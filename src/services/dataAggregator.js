/**
 * Data Aggregator Service
 * Combines API-Football data with ORACLE predictions
 */

import {
    getLeagueFixtures,
    getFixtureOdds,
    getTeamLastFixtures,
    getHeadToHead,
    getPredictions,
    extractBestOdds,
    calculateTeamForm,
    POPULAR_LEAGUES,
    testConnection as testApiFootball
} from './apiFootballService.js';

import { analyzeMatch, analyzeMatches } from './oracleService.js';
import { calculateEV, calculateKelly, getConfidenceTier } from '../data.js';

/**
 * Aggregate all data for a single fixture
 * @param {object} fixture - API-Football fixture object
 */
async function aggregateFixtureData(fixture) {
    const homeTeam = fixture.teams?.home;
    const awayTeam = fixture.teams?.away;

    if (!homeTeam || !awayTeam) {
        console.warn('Missing team data for fixture:', fixture.fixture?.id);
        return null;
    }

    const fixtureId = fixture.fixture?.id;
    const leagueId = fixture.league?.id;

    // Get odds for this fixture
    let odds = null;
    try {
        const oddsData = await getFixtureOdds(fixtureId);
        odds = extractBestOdds(oddsData);
    } catch (error) {
        console.warn('No odds for fixture:', fixtureId);
    }

    // If no odds, generate reasonable defaults based on the fixture
    if (!odds) {
        // Use API-Football predictions as fallback
        try {
            const predictions = await getPredictions(fixtureId);
            if (predictions?.predictions?.percent) {
                const homeProb = parseInt(predictions.predictions.percent.home) / 100;
                const drawProb = parseInt(predictions.predictions.percent.draw) / 100;
                const awayProb = parseInt(predictions.predictions.percent.away) / 100;

                // Convert probabilities to implied odds (with 5% margin)
                odds = {
                    home: parseFloat((1 / (homeProb * 0.95)).toFixed(2)),
                    draw: parseFloat((1 / (drawProb * 0.95)).toFixed(2)),
                    away: parseFloat((1 / (awayProb * 0.95)).toFixed(2))
                };
            }
        } catch (e) {
            console.warn('No predictions for fixture:', fixtureId);
        }
    }

    if (!odds) {
        // Last resort: use default balanced odds
        odds = { home: 2.50, draw: 3.30, away: 2.80 };
    }

    // Get team form (parallel requests)
    let homeFormData = [], awayFormData = [], h2hData = [];

    try {
        [homeFormData, awayFormData, h2hData] = await Promise.all([
            getTeamLastFixtures(homeTeam.id, 10).catch(() => []),
            getTeamLastFixtures(awayTeam.id, 10).catch(() => []),
            getHeadToHead(homeTeam.id, awayTeam.id, 5).catch(() => [])
        ]);
    } catch (error) {
        console.warn('Error fetching team data:', error);
    }

    // Calculate form
    const homeForm = calculateTeamForm(homeFormData, homeTeam.id);
    const awayForm = calculateTeamForm(awayFormData, awayTeam.id);

    // Calculate H2H
    let h2h = null;
    if (h2hData && h2hData.length > 0) {
        let homeWins = 0, draws = 0, awayWins = 0;
        h2hData.forEach(match => {
            const hGoals = match.goals?.home ?? 0;
            const aGoals = match.goals?.away ?? 0;

            // Check if home team in this fixture was home in the H2H match
            const wasHome = match.teams?.home?.id === homeTeam.id;

            if (hGoals > aGoals) {
                wasHome ? homeWins++ : awayWins++;
            } else if (hGoals < aGoals) {
                wasHome ? awayWins++ : homeWins++;
            } else {
                draws++;
            }
        });
        h2h = { homeWins, draws, awayWins, total: h2hData.length };
    }

    return {
        fixtureId,
        homeTeam: homeTeam.name,
        homeTeamId: homeTeam.id,
        homeTeamLogo: homeTeam.logo,
        awayTeam: awayTeam.name,
        awayTeamId: awayTeam.id,
        awayTeamLogo: awayTeam.logo,
        league: fixture.league?.name || 'Unknown League',
        leagueLogo: fixture.league?.logo,
        leagueId,
        country: fixture.league?.country,
        venue: fixture.fixture?.venue?.name || null,
        kickoff: fixture.fixture?.date,
        status: fixture.fixture?.status?.short,
        odds,
        homeForm,
        awayForm,
        h2h
    };
}

/**
 * Build final match object with EV calculations
 * @param {object} aggregatedData - Aggregated fixture data
 * @param {object} prediction - ORACLE prediction
 */
function buildMatchObject(aggregatedData, prediction) {
    const odds = aggregatedData.odds;

    // Use AI prediction probabilities or defaults
    const probs = prediction?.prediction || {
        home_win_prob: 0.33,
        draw_prob: 0.34,
        away_win_prob: 0.33
    };

    // Calculate EV for each outcome
    const evHome = calculateEV(probs.home_win_prob, odds.home);
    const evDraw = calculateEV(probs.draw_prob, odds.draw);
    const evAway = calculateEV(probs.away_win_prob, odds.away);

    // Find best outcome
    const outcomes = [
        { outcome: 'home', ev: evHome, prob: probs.home_win_prob, odds: odds.home },
        { outcome: 'draw', ev: evDraw, prob: probs.draw_prob, odds: odds.draw },
        { outcome: 'away', ev: evAway, prob: probs.away_win_prob, odds: odds.away }
    ];
    const best = outcomes.reduce((a, b) => a.ev > b.ev ? a : b);

    // Calculate Kelly for best outcome
    const kelly = calculateKelly(best.prob, best.odds);

    return {
        id: `match_${aggregatedData.fixtureId}`,
        fixtureId: aggregatedData.fixtureId,
        sport: 'soccer',
        league: aggregatedData.league,
        leagueLogo: aggregatedData.leagueLogo,
        country: aggregatedData.country,
        teams: {
            home: aggregatedData.homeTeam,
            away: aggregatedData.awayTeam,
            homeLogo: aggregatedData.homeTeamLogo,
            awayLogo: aggregatedData.awayTeamLogo
        },
        venue: aggregatedData.venue,
        kickoff: aggregatedData.kickoff,
        odds: {
            home: odds.home,
            draw: odds.draw,
            away: odds.away
        },
        model: {
            home_prob: probs.home_win_prob,
            draw_prob: probs.draw_prob,
            away_prob: probs.away_win_prob,
            win_prob: best.prob,
            fair_odds: parseFloat((1 / best.prob).toFixed(2))
        },
        metrics: {
            ev: parseFloat(best.ev.toFixed(1)),
            kelly_stake: parseFloat(Math.max(0, kelly).toFixed(1)),
            confidence_tier: getConfidenceTier(best.ev)
        },
        recommendation: best.outcome,
        ai: {
            confidence: prediction?.recommended_bet?.confidence || 'MEDIUM',
            reasoning: prediction?.analysis?.reasoning || '',
            keyFactors: prediction?.analysis?.key_factors || [],
            warnings: prediction?.analysis?.warnings || [],
            kellyRecommendation: prediction?.kelly_stake || null
        },
        form: {
            home: aggregatedData.homeForm,
            away: aggregatedData.awayForm
        },
        h2h: aggregatedData.h2h
    };
}

/**
 * Fetch and analyze all upcoming matches
 * @param {object} options - Options
 * @param {function} onProgress - Progress callback
 */
export async function fetchLiveMatches(options = {}, onProgress) {
    const {
        maxMatches = 20,
        useAI = true
    } = options;

    console.log('📡 Fetching live matches from API-Football...');

    // Step 1: Get upcoming fixtures from popular leagues
    const leagueIds = [
        POPULAR_LEAGUES.PREMIER_LEAGUE,
        POPULAR_LEAGUES.LA_LIGA,
        POPULAR_LEAGUES.SERIE_A,
        POPULAR_LEAGUES.BUNDESLIGA,
        POPULAR_LEAGUES.CHAMPIONS_LEAGUE
    ];

    let fixtures = [];
    try {
        fixtures = await getLeagueFixtures(leagueIds, '2024');
    } catch (error) {
        console.error('Failed to fetch fixtures:', error);
        throw new Error('Failed to fetch fixtures from API-Football: ' + error.message);
    }

    console.log(`📊 Found ${fixtures.length} fixtures`);

    if (fixtures.length === 0) {
        throw new Error('No upcoming fixtures found. Try again later.');
    }

    // Filter to only "Not Started" fixtures
    const upcomingFixtures = fixtures
        .filter(f => f.fixture?.status?.short === 'NS')
        .slice(0, maxMatches);

    console.log(`🎯 ${upcomingFixtures.length} upcoming fixtures to analyze`);

    if (upcomingFixtures.length === 0) {
        throw new Error('No upcoming matches found. All matches may have already started.');
    }

    // Step 2: Aggregate data for each fixture
    const aggregatedMatches = [];

    for (let i = 0; i < upcomingFixtures.length; i++) {
        const fixture = upcomingFixtures[i];

        if (onProgress) {
            onProgress(i + 1, upcomingFixtures.length * 2, 'Fetching match data...');
        }

        try {
            const aggregated = await aggregateFixtureData(fixture);
            if (aggregated) {
                aggregatedMatches.push(aggregated);
            }
        } catch (error) {
            console.warn('Failed to aggregate fixture:', fixture.fixture?.id, error);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`🔄 Aggregated ${aggregatedMatches.length} matches with data`);

    if (aggregatedMatches.length === 0) {
        throw new Error('Failed to aggregate match data. Please try again.');
    }

    // Step 3: Analyze with ORACLE AI (if enabled)
    let matches = [];

    if (useAI) {
        const analyzed = await analyzeMatches(aggregatedMatches, (current, total) => {
            if (onProgress) {
                onProgress(
                    aggregatedMatches.length + current,
                    aggregatedMatches.length * 2,
                    'ORACLE analyzing...'
                );
            }
        });

        matches = analyzed
            .filter(m => m.prediction && !m.prediction._parseError)
            .map(m => buildMatchObject(m, m.prediction));
    } else {
        // Without AI, use default probabilities based on odds
        matches = aggregatedMatches.map(m => {
            const impliedHome = 1 / m.odds.home;
            const impliedDraw = 1 / m.odds.draw;
            const impliedAway = 1 / m.odds.away;
            const total = impliedHome + impliedDraw + impliedAway;

            const prediction = {
                prediction: {
                    home_win_prob: impliedHome / total,
                    draw_prob: impliedDraw / total,
                    away_win_prob: impliedAway / total
                },
                recommended_bet: { confidence: 'LOW' },
                analysis: {
                    reasoning: 'Based on market odds (no AI analysis)',
                    key_factors: [],
                    warnings: ['AI analysis disabled']
                }
            };

            return buildMatchObject(m, prediction);
        });
    }

    console.log(`✅ ${matches.length} matches ready`);

    return matches;
}

/**
 * Test API connection
 */
export async function testConnection() {
    const result = await testApiFootball();
    return result.success;
}

/**
 * Quick fetch without AI analysis (for testing)
 */
export async function fetchMatchesWithoutAI() {
    return fetchLiveMatches({ useAI: false, maxMatches: 10 });
}
