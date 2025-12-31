/**
 * ORACLE AI Service
 * AI-powered sports prediction using OpenRouter
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free';

// Cache for AI predictions (longer cache since predictions don't change quickly)
const predictionCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * ORACLE System Prompt
 */
const ORACLE_SYSTEM_PROMPT = `You are "ORACLE" - an elite quantitative sports analyst with 15 years of experience in professional sports betting and statistical modeling. Your job is to analyze sports match data and generate high-confidence Expected Value (EV) predictions.

## YOUR EXPERTISE
You specialize in:
- Poisson distribution modeling for soccer
- Elo rating systems for tennis
- Regression analysis for basketball
- Market efficiency analysis
- Bankroll management theory (Kelly Criterion)

## YOUR ANALYSIS PROCESS

### Step 1: Calculate True Probability
Based on the sport, use the appropriate model:

**For Soccer:**
- Calculate attack strength: (Team goals scored / League avg goals) 
- Calculate defense strength: (Team goals conceded / League avg goals)
- Use Poisson distribution to simulate match 10,000 times
- Account for home advantage (~0.3-0.4 goals)
- Consider recent form weight (last 5 matches = 40%, last 10 = 30%, season = 30%)

### Step 2: Compare Against Market
- Calculate implied probability from best available odds
- Compute Expected Value: EV = (Your_Probability × Decimal_Odds) - 1
- Identify market inefficiencies
- Consider why bookmakers might be wrong (public bias, recency bias, injury news)

### Step 3: Risk Assessment
- Evaluate confidence level based on:
  * Sample size of data (more matches = higher confidence)
  * Consistency of recent form
  * Quality of opposition faced
  * Market liquidity (sharp vs soft markets)
  * Injury/lineup uncertainty

### Step 4: Calculate Kelly Criterion
- Formula: f = (bp - q) / b
  * b = decimal odds - 1
  * p = your win probability
  * q = lose probability (1 - p)
- Recommend fractional Kelly (25-50% of full Kelly for safety)

## OUTPUT FORMAT

You MUST respond with ONLY a valid JSON object (no markdown, no explanation outside JSON). Use this exact structure:

{
  "prediction": {
    "home_win_prob": 0.52,
    "draw_prob": 0.25,
    "away_win_prob": 0.23
  },
  "recommended_bet": {
    "outcome": "home",
    "confidence": "HIGH",
    "ev_percentage": 9.2
  },
  "kelly_stake": {
    "full": 4.5,
    "half": 2.25,
    "quarter": 1.125
  },
  "analysis": {
    "reasoning": "Brief explanation of your prediction",
    "key_factors": ["Factor 1", "Factor 2", "Factor 3"],
    "warnings": ["Any concerns or risks"]
  }
}`;

/**
 * Build the match analysis prompt
 * @param {object} matchData - Aggregated match data
 */
function buildAnalysisPrompt(matchData) {
    return `Analyze this soccer match and provide your prediction:

## MATCH INFORMATION
- **Home Team:** ${matchData.homeTeam}
- **Away Team:** ${matchData.awayTeam}
- **League:** ${matchData.league}
- **Venue:** ${matchData.venue || 'Unknown'}
- **Date:** ${matchData.kickoff}

## CURRENT MARKET ODDS
- Home Win: ${matchData.odds.home}
- Draw: ${matchData.odds.draw}
- Away Win: ${matchData.odds.away}

## HOME TEAM FORM (Last 5)
- Form: ${matchData.homeForm?.form || 'N/A'}
- Avg Goals Scored: ${matchData.homeForm?.avgGoalsScored?.toFixed(2) || 'N/A'}
- Avg Goals Conceded: ${matchData.homeForm?.avgGoalsConceded?.toFixed(2) || 'N/A'}

## AWAY TEAM FORM (Last 5)
- Form: ${matchData.awayForm?.form || 'N/A'}
- Avg Goals Scored: ${matchData.awayForm?.avgGoalsScored?.toFixed(2) || 'N/A'}
- Avg Goals Conceded: ${matchData.awayForm?.avgGoalsConceded?.toFixed(2) || 'N/A'}

## HEAD TO HEAD (Last 5 meetings)
${matchData.h2h ? `- Home Wins: ${matchData.h2h.homeWins}, Draws: ${matchData.h2h.draws}, Away Wins: ${matchData.h2h.awayWins}` : 'No H2H data available'}

Based on this data, calculate the true probabilities and identify any Expected Value opportunities. Respond with ONLY the JSON object.`;
}

/**
 * Call OpenRouter API with ORACLE prompt
 * @param {string} userPrompt - The match analysis prompt
 */
async function callOracle(userPrompt) {
    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Sharpshooter EV Dashboard'
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: ORACLE_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.3, // Lower temperature for more consistent predictions
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const json = await response.json();
    return json.choices[0]?.message?.content;
}

/**
 * Parse AI response into structured prediction
 * @param {string} responseText - Raw AI response
 */
function parseOracleResponse(responseText) {
    try {
        // Try to extract JSON from the response
        let jsonStr = responseText.trim();

        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }

        const prediction = JSON.parse(jsonStr);

        // Validate required fields
        if (!prediction.prediction || !prediction.recommended_bet) {
            throw new Error('Missing required fields in prediction');
        }

        return prediction;
    } catch (error) {
        console.error('Failed to parse ORACLE response:', responseText);

        // Return a default prediction if parsing fails
        return {
            prediction: {
                home_win_prob: 0.33,
                draw_prob: 0.34,
                away_win_prob: 0.33
            },
            recommended_bet: {
                outcome: 'none',
                confidence: 'LOW',
                ev_percentage: 0
            },
            kelly_stake: {
                full: 0,
                half: 0,
                quarter: 0
            },
            analysis: {
                reasoning: 'Unable to parse AI response',
                key_factors: [],
                warnings: ['AI response parsing failed']
            },
            _parseError: true
        };
    }
}

/**
 * Analyze a match using ORACLE AI
 * @param {object} matchData - Aggregated match data
 */
export async function analyzeMatch(matchData) {
    const cacheKey = `${matchData.fixtureId}`;
    const cached = predictionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`🧠 Cache hit for prediction: ${matchData.homeTeam} vs ${matchData.awayTeam}`);
        return cached.data;
    }

    console.log(`🤖 ORACLE analyzing: ${matchData.homeTeam} vs ${matchData.awayTeam}`);

    try {
        const prompt = buildAnalysisPrompt(matchData);
        const response = await callOracle(prompt);
        const prediction = parseOracleResponse(response);

        // Cache the prediction
        predictionCache.set(cacheKey, {
            data: prediction,
            timestamp: Date.now()
        });

        return prediction;
    } catch (error) {
        console.error('ORACLE analysis failed:', error);
        throw error;
    }
}

/**
 * Batch analyze multiple matches
 * @param {object[]} matchDataArray - Array of match data
 * @param {function} onProgress - Progress callback
 */
export async function analyzeMatches(matchDataArray, onProgress) {
    const results = [];

    for (let i = 0; i < matchDataArray.length; i++) {
        const matchData = matchDataArray[i];

        try {
            const prediction = await analyzeMatch(matchData);
            results.push({
                ...matchData,
                prediction,
                error: null
            });
        } catch (error) {
            results.push({
                ...matchData,
                prediction: null,
                error: error.message
            });
        }

        if (onProgress) {
            onProgress(i + 1, matchDataArray.length);
        }

        // Small delay between requests to avoid rate limiting
        if (i < matchDataArray.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return results;
}

/**
 * Clear prediction cache
 */
export function clearPredictionCache() {
    predictionCache.clear();
    console.log('🗑️ Prediction cache cleared');
}

/**
 * Test ORACLE connection
 */
export async function testOracleConnection() {
    try {
        const testPrompt = 'Respond with just: {"test": "success"}';
        const response = await callOracle(testPrompt);
        console.log('✅ ORACLE connected:', response);
        return true;
    } catch (error) {
        console.error('❌ ORACLE connection failed:', error);
        return false;
    }
}
