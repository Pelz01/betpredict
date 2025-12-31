/**
 * BetPredict - Scheduled Refresh Script
 * Runs via GitHub Actions to fetch predictions and save to Gist
 * 
 * Required environment variables:
 * - API_FOOTBALL_KEY
 * - SPORTMONKS_API_KEY
 * - OPENROUTER_API_KEY
 * - GIST_ID
 * - GITHUB_TOKEN
 */

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ============================================
// API FETCHING
// ============================================

async function fetchApiFootball(endpoint, params = {}) {
    const url = new URL(`${API_FOOTBALL_BASE}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const response = await fetch(url, {
        headers: {
            'x-rapidapi-host': 'v3.football.api-sports.io',
            'x-rapidapi-key': process.env.API_FOOTBALL_KEY
        }
    });

    if (!response.ok) throw new Error(`API-Football error: ${response.status}`);
    const json = await response.json();

    if (json.errors && Object.keys(json.errors).length > 0) {
        console.warn('API-Football errors:', json.errors);
        return [];
    }

    return json.response || [];
}

async function fetchSportmonks(endpoint, includes = []) {
    let url = `${SPORTMONKS_BASE}${endpoint}?api_token=${process.env.SPORTMONKS_API_KEY}`;
    if (includes.length > 0) {
        url += `&include=${includes.join(';')}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Sportmonks error: ${response.status}`);
    const json = await response.json();
    return json.data || [];
}

// ============================================
// DATA PROCESSING
// ============================================

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

async function getFixtures() {
    const today = formatDate(new Date());
    const tomorrow = formatDate(new Date(Date.now() + 86400000));
    const dayAfter = formatDate(new Date(Date.now() + 172800000));

    let allFixtures = [];

    // Try API-Football
    try {
        console.log('📡 Fetching from API-Football...');
        for (const date of [today, tomorrow, dayAfter]) {
            const fixtures = await fetchApiFootball('/fixtures', { date });
            const upcoming = fixtures.filter(f => f.fixture?.status?.short === 'NS');
            allFixtures.push(...upcoming.map(f => ({
                id: f.fixture.id,
                homeTeam: f.teams.home.name,
                awayTeam: f.teams.away.name,
                homeLogo: f.teams.home.logo,
                awayLogo: f.teams.away.logo,
                league: f.league.name,
                leagueLogo: f.league.logo,
                kickoff: f.fixture.date,
                odds: { home: 2.5, draw: 3.3, away: 2.8 }, // Default odds
                source: 'api-football'
            })));
        }
        console.log(`✅ API-Football: ${allFixtures.length} fixtures`);
    } catch (error) {
        console.warn('⚠️ API-Football failed:', error.message);
    }

    // Try Sportmonks
    try {
        console.log('📡 Fetching from Sportmonks...');
        const start = formatDate(new Date());
        const end = formatDate(new Date(Date.now() + 259200000)); // +3 days

        const fixtures = await fetchSportmonks(
            `/fixtures/between/${start}/${end}`,
            ['participants', 'odds', 'league']
        );

        const existingMatchups = new Set(
            allFixtures.map(f => `${f.homeTeam.toLowerCase()}-${f.awayTeam.toLowerCase()}`)
        );

        fixtures.forEach(f => {
            const home = f.participants?.find(p => p.meta?.location === 'home');
            const away = f.participants?.find(p => p.meta?.location === 'away');

            if (home && away) {
                const matchKey = `${home.name.toLowerCase()}-${away.name.toLowerCase()}`;
                if (!existingMatchups.has(matchKey)) {
                    allFixtures.push({
                        id: f.id,
                        homeTeam: home.name,
                        awayTeam: away.name,
                        homeLogo: home.image_path,
                        awayLogo: away.image_path,
                        league: f.league?.name || 'Unknown',
                        leagueLogo: f.league?.image_path,
                        kickoff: f.starting_at,
                        odds: { home: 2.5, draw: 3.3, away: 2.8 },
                        source: 'sportmonks'
                    });
                    existingMatchups.add(matchKey);
                }
            }
        });
        console.log(`✅ Sportmonks: added unique fixtures, total now ${allFixtures.length}`);
    } catch (error) {
        console.warn('⚠️ Sportmonks failed:', error.message);
    }

    return allFixtures.slice(0, 20); // Limit to 20
}

async function analyzeWithAI(fixtures) {
    console.log('🤖 Analyzing with AI...');

    const predictions = [];

    for (const fixture of fixtures) {
        try {
            const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: process.env.OPENROUTER_MODEL || 'xiaomi/mimo-v2-flash:free',
                    messages: [{
                        role: 'user',
                        content: `Analyze this soccer match for betting value:
${fixture.homeTeam} vs ${fixture.awayTeam}
League: ${fixture.league}
Kickoff: ${fixture.kickoff}
Odds: Home ${fixture.odds.home}, Draw ${fixture.odds.draw}, Away ${fixture.odds.away}

Return JSON only: {"home_prob": 0.XX, "draw_prob": 0.XX, "away_prob": 0.XX, "best_bet": "home|draw|away", "confidence": "HIGH|MEDIUM|LOW", "reasoning": "brief reason"}`
                    }],
                    response_format: { type: 'json_object' }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (content) {
                    const analysis = JSON.parse(content);

                    // Calculate EV
                    const probs = {
                        home: analysis.home_prob || 0.33,
                        draw: analysis.draw_prob || 0.34,
                        away: analysis.away_prob || 0.33
                    };

                    const evHome = (probs.home * fixture.odds.home - 1) * 100;
                    const evDraw = (probs.draw * fixture.odds.draw - 1) * 100;
                    const evAway = (probs.away * fixture.odds.away - 1) * 100;

                    const bestEV = Math.max(evHome, evDraw, evAway);
                    const recommendation = evHome === bestEV ? 'home' : evDraw === bestEV ? 'draw' : 'away';

                    predictions.push({
                        id: `match_${fixture.id}`,
                        fixtureId: fixture.id,
                        sport: 'soccer',
                        league: fixture.league,
                        leagueLogo: fixture.leagueLogo,
                        teams: {
                            home: fixture.homeTeam,
                            away: fixture.awayTeam,
                            homeLogo: fixture.homeLogo,
                            awayLogo: fixture.awayLogo
                        },
                        kickoff: fixture.kickoff,
                        odds: fixture.odds,
                        model: {
                            home_prob: probs.home,
                            draw_prob: probs.draw,
                            away_prob: probs.away
                        },
                        metrics: {
                            ev: parseFloat(bestEV.toFixed(1)),
                            kelly_stake: Math.max(0, parseFloat(((probs[recommendation] * fixture.odds[recommendation] - 1) / (fixture.odds[recommendation] - 1) * 100).toFixed(1))),
                            confidence_tier: analysis.confidence || 'MEDIUM'
                        },
                        recommendation,
                        ai: {
                            confidence: analysis.confidence || 'MEDIUM',
                            reasoning: analysis.reasoning || ''
                        },
                        _source: fixture.source
                    });
                }
            }

            // Rate limit delay
            await new Promise(r => setTimeout(r, 500));

        } catch (error) {
            console.warn(`Failed to analyze ${fixture.homeTeam} vs ${fixture.awayTeam}:`, error.message);
        }
    }

    console.log(`✅ Analyzed ${predictions.length} matches`);
    return predictions;
}

async function saveToGist(predictions) {
    console.log('💾 Saving to Gist...');

    const payload = {
        lastUpdated: new Date().toISOString(),
        predictions
    };

    const response = await fetch(`https://api.github.com/gists/${process.env.GIST_ID}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            files: {
                'predictions.json': {
                    content: JSON.stringify(payload, null, 2)
                }
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gist update failed: ${error.message}`);
    }

    console.log('✅ Saved to Gist!');
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('🏆 BetPredict Scheduled Refresh');
    console.log(`📅 ${new Date().toISOString()}`);

    try {
        const fixtures = await getFixtures();

        if (fixtures.length === 0) {
            console.log('⚠️ No fixtures found');
            process.exit(0);
        }

        const predictions = await analyzeWithAI(fixtures);

        if (predictions.length === 0) {
            console.log('⚠️ No predictions generated');
            process.exit(0);
        }

        await saveToGist(predictions);

        console.log(`🎉 Done! ${predictions.length} predictions saved.`);

    } catch (error) {
        console.error('❌ Refresh failed:', error);
        process.exit(1);
    }
}

main();
