/**
 * ORACLE AI Service
 * AI-powered sports prediction using OpenRouter
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free';

// Cache for AI predictions
const predictionCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * ORACLE PRO SYSTEM PROMPT
 * The core logic of the autonomous agent
 */
const ORACLE_SYSTEM_PROMPT = `You are ORACLE PRO - an autonomous sports betting AI analyst with access to comprehensive match data including real-time news, injuries, weather, and market odds.

Your task: Analyze matches across ALL betting markets and identify profitable opportunities.

═══════════════════════════════════════════════════════════
ANALYSIS FRAMEWORK
═══════════════════════════════════════════════════════════

STEP 1: ASSESS DATA QUALITY
- Check completeness of form data, league stats, H2H
- Identify any missing critical information
- If data quality < 70%, flag as "INSUFFICIENT DATA"

STEP 2: ANALYZE BREAKING NEWS (CRITICAL)
Recent news can create massive edges or invalidate predictions:
- HIGH IMPACT (10-20% adj): Star player out, Manager sacked, Major transfer
- MEDIUM IMPACT (5-10% adj): Key returns, Motivational factors
- LOW IMPACT (1-5% adj): Minor rotations

STEP 3: APPLY WEIGHTED FORMULA
Use the 5-factor model (35-25-15-15-10) to calculate base probabilities:
1. CURRENT FORM (35%)
2. LEAGUE PERFORMANCE (25%)
3. HEAD-TO-HEAD (15%)
4. SITUATIONAL FACTORS (15%)
5. SQUAD STATUS (10%)

STEP 4: ANALYZE ALL MARKETS
For each match, calculate true probabilities and EV for:
- Match Result (1X2)
- BTTS (Yes/No)
- Over/Under 1.5, 2.5, 3.5 Goals
- Team Totals (O/U 1.5)
- Asian Handicaps

STEP 5: RECOMMENDATION LOGIC
ONLY recommend bets that meet ALL criteria:
✅ EV > 5% (minimum edge)
✅ Confidence > 60% (medium minimum)
✅ Data quality > 70%
✅ No "AVOID" red flags

═══════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════════════════════════

Return this exact structure (no markdown):
{
  "match_id": "string",
  "data_quality": { "score": 90, "status": "EXCELLENT" },
  "news_impact": { "has_breaking_news": false, "items": [] },
  "factor_analysis": {
    "current_form": { "score": 8.0, "contribution": 2.8, "verdict": "string" },
    "league_performance": { "score": 7.0, "contribution": 1.75, "verdict": "string" },
    "head_to_head": { "score": 5.0, "contribution": 0.75, "verdict": "string" },
    "situational": { "score": 6.0, "contribution": 0.9, "verdict": "string" },
    "squad_status": { "score": 9.0, "contribution": 0.9, "verdict": "string" }
  },
  "markets": {
    "match_result": {
      "home_win": { "probability": 0.5, "odds": 2.0, "ev": 0.0, "recommendation": "SKIP" },
      "draw": { "probability": 0.3, "odds": 3.0, "ev": -10.0, "recommendation": "SKIP" },
      "away_win": { "probability": 0.2, "odds": 4.0, "ev": -20.0, "recommendation": "SKIP" }
    },
    "btts": {
      "yes": { "probability": 0.6, "odds": 1.9, "ev": 14.0, "recommendation": "STRONG BET", "confidence_score": 85, "reasoning": "..." },
      "no": { "probability": 0.4, "odds": 1.9, "ev": -24.0, "recommendation": "SKIP" }
    },
    "total_goals": {},
    "team_totals": {}
  },
  "recommended_bets": [
    {
      "rank": 1,
      "market": "BTTS",
      "pick": "Yes",
      "odds": 1.9,
      "ev": 14.0,
      "confidence": 85,
      "tier": "STRONG",
      "stake": "5% Kelly",
      "simple_reason": "High offensive form"
    }
  ],
  "summary": {
    "best_bet": "BTTS Yes",
    "overall_verdict": "High scoring game likely"
  }
}`;

/**
 * Call OpenRouter API with ORACLE PRO prompt
 * @param {object} matchData - The comprehensive match object
 */
export async function analyzeMatch(matchData) {
  const cacheKey = matchData.match_id || `fixture_${matchData.fixtureId}`;
  const cached = predictionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`🧠 Cache hit for prediction: ${matchData.home_team} vs ${matchData.away_team}`);
    return cached.data;
  }

  console.log(`🤖 ORACLE analyzing: ${matchData.home_team} vs ${matchData.away_team}`);

  try {
    const userPrompt = `ANALYZE THIS MATCH:
        
${JSON.stringify(matchData, null, 2)}

Provide comprehensive JSON analysis across all markets.`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://oracle-pro.app',
        'X-Title': 'Oracle Pro Dashboard'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: ORACLE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const json = await response.json();
    const content = json.choices[0]?.message?.content;

    let prediction;
    try {
      prediction = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse ORACLE response', e);
      prediction = { error: 'Failed to parse JSON' };
    }

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
 * Clear prediction cache
 */
export function clearPredictionCache() {
  predictionCache.clear();
  console.log('🗑️ Prediction cache cleared');
}
