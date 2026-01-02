/**
 * Data Aggregator Service
 * Combines data from API-Football AND Sportmonks with ORACLE predictions
 */

import {
    getLeagueFixtures as getApiFootballFixtures,
    getFixtureOdds as getApiFootballOdds,
    getTeamLastFixtures as getApiFootballTeamForm,
    getHeadToHead as getApiFootballH2H,
    getLeagueStats,
    calculateRestDays,
    getPredictions,
    extractBestOdds as extractApiFootballOdds,
    calculateTeamForm as calculateApiFootballForm,
    getInjuries,
    POPULAR_LEAGUES
} from './apiFootballService.js';

import {
    getUpcomingFixtures as getSportmonksFixtures,
    extractBestOdds as extractSportmonksOdds,
    calculateTeamForm as calculateSportmonksForm,
    extractWeather
} from './sportmonksService.js';

import { scanNews } from './newsService.js';
import { analyzeMatch } from './oracleService.js';
import { generateWeightedPrediction } from './predictionModelService.js';
import { calculateKelly } from '../data.js';

/**
 * Aggregate all data for a single fixture
 * Handles both API-Football and Sportmonks fixtures
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
    const isFromSportmonks = fixture._source === 'sportmonks';

    // 1. Initialize empty data structures
    let odds = { home: 0, draw: 0, away: 0 };
    let homeForm = {}, awayForm = {};
    let h2h = null;
    let injuries = { home: [], away: [] };
    let weather = null;
    let news = [];

    // 2. Fetch specific data based on source
    if (isFromSportmonks) {
        console.log(`📊 Processing Sportmonks fixture: ${homeTeam.name} vs ${awayTeam.name}`);

        if (fixture._rawSportmonks) {
            odds = extractSportmonksOdds(fixture._rawSportmonks) || odds;
            weather = extractWeather(fixture._rawSportmonks);
        }

        // Form & stats would need separate calls for Sportmonks in a full implementation
        // For now, we use placeholders if not available in "includes"
        homeForm = { form: '?????', avgGoalsScored: 1.5, avgGoalsConceded: 1.2 };
        awayForm = { form: '?????', avgGoalsScored: 1.2, avgGoalsConceded: 1.5 };

    } else {
        console.log(`📊 Processing API-Football fixture: ${homeTeam.name} vs ${awayTeam.name}`);

        // Parallel data fetching for speed
        try {
            const [oddsData, homeFormData, awayFormData, h2hData, injuryData, leagueStatsData] = await Promise.all([
                getApiFootballOdds(fixtureId).catch(() => []),
                getApiFootballTeamForm(homeTeam.id, 10).catch(() => []),
                getApiFootballTeamForm(awayTeam.id, 10).catch(() => []),
                getApiFootballH2H(homeTeam.id, awayTeam.id, 10).catch(() => []),
                getInjuries(fixtureId).catch(() => []),
                getLeagueStats(leagueId, fixture.league?.season || '2024').catch(() => null)
            ]);

            odds = extractApiFootballOdds(oddsData) || odds;

            // Calculate detailed form
            homeForm = calculateApiFootballForm(homeFormData, homeTeam.id);
            awayForm = calculateApiFootballForm(awayFormData, awayTeam.id);

            // Add League Stats (for Factor 2)
            if (leagueStatsData && leagueStatsData.standings) {
                homeForm.leagueStats = leagueStatsData.standings[homeTeam.id] || {};
                awayForm.leagueStats = leagueStatsData.standings[awayTeam.id] || {};
                homeForm.leagueAvgGoals = leagueStatsData.leagueAvgGoals;
            }

            // Calculations
            homeForm.restDays = calculateRestDays(homeFormData[0]?.fixture?.date, fixture.fixture?.date);
            awayForm.restDays = calculateRestDays(awayFormData[0]?.fixture?.date, fixture.fixture?.date);

            // H2H
            h2h = processH2H(h2hData, homeTeam.id);

            // Injuries
            injuries.home = injuryData.filter(i => i.team.id === homeTeam.id);
            injuries.away = injuryData.filter(i => i.team.id === awayTeam.id);

        } catch (error) {
            console.warn(`Error processing ${fixtureId}:`, error);
        }
    }

    // Default odds if missing
    if (!odds.home) odds = { home: 2.50, draw: 3.30, away: 2.80 };

    // 3. Scan News (Phase 2)
    news = await scanNews({
        fixtureId,
        homeTeam: homeTeam.name,
        awayTeam: awayTeam.name,
        _source: fixture._source,
        weather
    });

    // 4. Construct Comprehensive Match Object (The ONE Truth)
    const aggregatedMatch = {
        // ID & Metadata
        match_id: `match_${fixtureId}`,
        fixtureId,
        sport: 'soccer',
        league: fixture.league?.name,
        country: fixture.league?.country,
        kickoff: fixture.fixture?.date,
        venue: fixture.fixture?.venue?.name,

        // Teams
        home_team: homeTeam.name,
        away_team: awayTeam.name,
        home_logo: homeTeam.logo,
        away_logo: awayTeam.logo,

        // Data Quality Score (0-100)
        data_quality: calculateDataQuality({ odds, homeForm, awayForm, h2h }),

        // 5-Factor Data
        current_form: {
            home: homeForm,
            away: awayForm
        },

        league_stats: {
            league_avg_goals: homeForm.leagueAvgGoals || 1.4,
            home: homeForm.leagueStats || {},
            away: awayForm.leagueStats || {}
        },

        head_to_head: h2h || { homeWins: 0, draws: 0, awayWins: 0, total: 0, history: [] },

        situational: {
            home_rest: homeForm.restDays || 7,
            away_rest: awayForm.restDays || 7,
            weather: weather || { type: 'Normal', temp: 20 },
            venue_capacity: fixture.fixture?.venue?.capacity
        },

        squad_status: {
            home_injuries: injuries.home,
            away_injuries: injuries.away
        },

        // News & Market Data
        recent_news: news,
        market_odds: {
            match_result: odds
            // TODO: Add more markets here when API supports them
        }
    };

    return aggregatedMatch;
}

/**
 * Process H2H data into usable stats
 */
function processH2H(h2hData, homeTeamId) {
    if (!h2hData || h2hData.length === 0) return null;

    let homeWins = 0, draws = 0, awayWins = 0;

    h2hData.forEach(m => {
        const homeGoals = m.goals.home;
        const awayGoals = m.goals.away;
        const isHome = m.teams.home.id === homeTeamId;

        if (homeGoals === awayGoals) draws++;
        else if (isHome && homeGoals > awayGoals) homeWins++;
        else if (!isHome && awayGoals > homeGoals) homeWins++; // "Home" team (our focus) won away
        else awayWins++;
    });

    return {
        homeWins,
        draws,
        awayWins,
        total: h2hData.length,
        history: h2hData.slice(0, 5).map(m => ({
            date: m.fixture.date,
            score: `${m.goals.home}-${m.goals.away}`
        }))
    };
}

/**
 * Calculate data quality score
 */
function calculateDataQuality(data) {
    let score = 100;
    if (data.homeForm.form === '?????') score -= 20;
    if (!data.h2h) score -= 15;
    if (!data.odds.home) score -= 20;
    return Math.max(0, score);
}

/**
 * Fetch and analyze matches
 */
export async function fetchLiveMatches(options = {}) {
    console.log('🚀 Starting Oracle Pro Data Cycle...');

    const { maxMatches = 10 } = options;

    // 1. Fetch Fixtures
    const fixtures = await getApiFootballFixtures([39, 140, 135, 78, 61], '2024'); // Top 5 Leagues
    const validFixtures = fixtures.slice(0, maxMatches);

    // 2. Aggregate Data
    const enrichedMatches = [];
    for (const fixture of validFixtures) {
        const data = await aggregateFixtureData(fixture);
        if (data) enrichedMatches.push(data);
        await new Promise(r => setTimeout(r, 200)); // Rate limit niceness
    }

    // 3. AI Analysis (Batch)
    // We will update this part in Phase 3
    // For now, return enriched data
    return enrichedMatches;
}

// Re-export needed functions
export { testConnection } from './apiFootballService.js';
