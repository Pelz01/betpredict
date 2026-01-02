/**
 * API-Football Service
 * Fetches live soccer fixtures, odds, and statistics from API-Football.com
 * Documentation: https://www.api-football.com/documentation-v3
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = import.meta.env.VITE_API_FOOTBALL_KEY;

// Cache for reducing API calls
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Make authenticated request to API-Football
 */
async function apiRequest(endpoint, params = {}) {
    const cacheKey = `${endpoint}-${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`📦 Cache hit: ${endpoint}`);
        return cached.data;
    }

    const url = new URL(`${API_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
        }
    });

    console.log(`🌐 Fetching: ${endpoint}`, params);

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'x-rapidapi-host': 'v3.football.api-sports.io',
                'x-rapidapi-key': API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`API-Football error: ${response.status}`);
        }

        const json = await response.json();

        if (json.errors && Object.keys(json.errors).length > 0) {
            console.error('API-Football errors:', json.errors);
            throw new Error(Object.values(json.errors).join(', '));
        }

        // Cache the response
        cache.set(cacheKey, {
            data: json.response,
            timestamp: Date.now()
        });

        return json.response;
    } catch (error) {
        console.error('API-Football Error:', error);
        throw error;
    }
}

/**
 * Format date as YYYY-MM-DD for API
 */
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Get today's date string
 */
function getToday() {
    return formatDate(new Date());
}

/**
 * Get date N days from now
 */
function getFutureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return formatDate(date);
}

// ============================================
// FIXTURES ENDPOINTS
// ============================================

/**
 * Get fixtures for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
export async function getFixturesByDate(date = getToday()) {
    return apiRequest('/fixtures', { date });
}

/**
 * Get upcoming fixtures for next N days
 * @param {number} days - Number of days ahead
 */
export async function getUpcomingFixtures(days = 3) {
    const today = getToday();
    const future = getFutureDate(days);

    // API-Football requires date-by-date requests or specific league
    // For efficiency, let's get fixtures for popular leagues
    const fixtures = await apiRequest('/fixtures', {
        date: today,
        status: 'NS' // Not Started
    });

    return fixtures || [];
}

/**
 * Get fixtures from popular leagues using date-based query (free tier compatible)
 * @param {number[]} leagueIds - League IDs to fetch (not used in free tier)
 * @param {string} season - Season year (not used in free tier)
 */
export async function getLeagueFixtures(leagueIds = [], season = '2024') {
    const allFixtures = [];

    // Free tier approach: Use date-based queries for today and tomorrow
    const today = getToday();
    const tomorrow = getFutureDate(1);
    const dayAfter = getFutureDate(2);

    const dates = [today, tomorrow, dayAfter];

    for (const date of dates) {
        try {
            console.log(`📅 Fetching fixtures for ${date}...`);
            const fixtures = await apiRequest('/fixtures', { date });

            if (fixtures && fixtures.length > 0) {
                // Filter to only "Not Started" matches
                const upcoming = fixtures.filter(f => f.fixture?.status?.short === 'NS');
                allFixtures.push(...upcoming);
                console.log(`   Found ${upcoming.length} upcoming fixtures for ${date}`);
            }
        } catch (error) {
            console.warn(`Failed to fetch fixtures for ${date}:`, error.message);
        }
    }

    console.log(`📊 Total fixtures found: ${allFixtures.length}`);
    return allFixtures;
}

/**
 * Popular league IDs
 */
export const POPULAR_LEAGUES = {
    PREMIER_LEAGUE: 39,
    LA_LIGA: 140,
    SERIE_A: 135,
    BUNDESLIGA: 78,
    LIGUE_1: 61,
    CHAMPIONS_LEAGUE: 2,
    EUROPA_LEAGUE: 3,
    WORLD_CUP: 1,
    MLS: 253
};

// ============================================
// ODDS ENDPOINTS
// ============================================

/**
 * Get betting odds for a fixture
 * @param {number} fixtureId 
 */
export async function getFixtureOdds(fixtureId) {
    return apiRequest('/odds', { fixture: fixtureId });
}

/**
 * Get pre-match odds for upcoming fixtures
 * @param {string} date 
 */
export async function getOddsByDate(date = getToday()) {
    return apiRequest('/odds', { date });
}

/**
 * Get odds for a specific league
 * @param {number} leagueId 
 * @param {string} season 
 */
export async function getLeagueOdds(leagueId, season = '2024') {
    return apiRequest('/odds', { league: leagueId, season });
}

// ============================================
// TEAM & STATISTICS ENDPOINTS
// ============================================

/**
 * Get team information
 * @param {number} teamId 
 */
export async function getTeam(teamId) {
    const response = await apiRequest('/teams', { id: teamId });
    return response?.[0];
}

/**
 * Get team statistics for a league/season
 * @param {number} teamId 
 * @param {number} leagueId 
 * @param {string} season 
 */
export async function getTeamStatistics(teamId, leagueId, season = '2024') {
    const response = await apiRequest('/teams/statistics', {
        team: teamId,
        league: leagueId,
        season
    });
    return response;
}

/**
 * Get team's last N fixtures
 * @param {number} teamId 
 * @param {number} last - Number of fixtures
 */
export async function getTeamLastFixtures(teamId, last = 10) {
    return apiRequest('/fixtures', {
        team: teamId,
        last
    });
}

/**
 * Get head-to-head between two teams
 * @param {number} team1Id 
 * @param {number} team2Id 
 * @param {number} last - Number of H2H matches
 */
export async function getHeadToHead(team1Id, team2Id, last = 10) {
    return apiRequest('/fixtures/headtohead', {
        h2h: `${team1Id}-${team2Id}`,
        last
    });
}

/**
 * Get injuries for a specific fixture
 * @param {number} fixtureId
 */
export async function getInjuries(fixtureId) {
    return apiRequest('/injuries', { fixture: fixtureId });
}

// ============================================
// STANDINGS ENDPOINT
// ============================================

/**
 * Get league standings
 * @param {number} leagueId 
 * @param {string} season 
 */
export async function getStandings(leagueId, season = '2024') {
    const response = await apiRequest('/standings', {
        league: leagueId,
        season
    });
    return response?.[0]?.league?.standings?.[0];
}

// ============================================
// PREDICTIONS ENDPOINT (Built-in AI)
// ============================================

/**
 * Get API-Football's built-in predictions
 * @param {number} fixtureId 
 */
export async function getPredictions(fixtureId) {
    const response = await apiRequest('/predictions', { fixture: fixtureId });
    return response?.[0];
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Extract best odds from odds response
 * @param {object[]} oddsData 
 */
export function extractBestOdds(oddsData) {
    if (!oddsData || oddsData.length === 0) return null;

    // Find the "Match Winner" market (1X2)
    const bookmakers = oddsData[0]?.bookmakers || [];

    let bestHome = 0, bestDraw = 0, bestAway = 0;

    bookmakers.forEach(bookmaker => {
        const matchWinner = bookmaker.bets?.find(
            bet => bet.name === 'Match Winner' || bet.id === 1
        );

        if (matchWinner) {
            matchWinner.values?.forEach(value => {
                const odds = parseFloat(value.odd);
                if (value.value === 'Home') bestHome = Math.max(bestHome, odds);
                if (value.value === 'Draw') bestDraw = Math.max(bestDraw, odds);
                if (value.value === 'Away') bestAway = Math.max(bestAway, odds);
            });
        }
    });

    if (bestHome === 0 && bestDraw === 0 && bestAway === 0) {
        return null;
    }

    return {
        home: bestHome || 2.0,
        draw: bestDraw || 3.5,
        away: bestAway || 3.0
    };
}

/**
 * Calculate team form from fixtures
 * @param {object[]} fixtures 
 * @param {number} teamId 
 */
export function calculateTeamForm(fixtures, teamId) {
    const form = [];
    let goalsScored = 0;
    let goalsConceded = 0;

    fixtures.slice(0, 10).forEach(fixture => {
        const isHome = fixture.teams?.home?.id === teamId;
        const homeGoals = fixture.goals?.home ?? 0;
        const awayGoals = fixture.goals?.away ?? 0;

        if (isHome) {
            goalsScored += homeGoals;
            goalsConceded += awayGoals;
            if (homeGoals > awayGoals) form.push('W');
            else if (homeGoals < awayGoals) form.push('L');
            else form.push('D');
        } else {
            goalsScored += awayGoals;
            goalsConceded += homeGoals;
            if (awayGoals > homeGoals) form.push('W');
            else if (awayGoals < homeGoals) form.push('L');
            else form.push('D');
        }
    });

    const played = fixtures.length;

    return {
        form: form.slice(0, 5).join(''),
        fullForm: form.join(''),
        wins: form.filter(f => f === 'W').length,
        draws: form.filter(f => f === 'D').length,
        losses: form.filter(f => f === 'L').length,
        goalsScored,
        goalsConceded,
        avgGoalsScored: played > 0 ? (goalsScored / played).toFixed(2) : 0,
        avgGoalsConceded: played > 0 ? (goalsConceded / played).toFixed(2) : 0,
        cleanSheets: fixtures.filter(f => {
            const isHome = f.teams?.home?.id === teamId;
            return isHome ? f.goals?.away === 0 : f.goals?.home === 0;
        }).length
    };
}

/**
 * Clear API cache
 */
export function clearCache() {
    cache.clear();
    console.log('🗑️ API-Football cache cleared');
}

/**
 * Test API connection
 */
export async function testConnection() {
    try {
        const status = await apiRequest('/status');
        console.log('✅ API-Football connected:', status);
        return { success: true, status };
    } catch (error) {
        console.error('❌ API-Football connection failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get API status/quota
 */
export async function getApiStatus() {
    return apiRequest('/status');
}

/**
 * Get league statistics for weighted model
 * @param {number} leagueId 
 * @param {string} season 
 */
export async function getLeagueStats(leagueId, season = '2024') {
    const standings = await getStandings(leagueId, season);

    if (!standings || !standings.length) return null;

    // Calculate league averages
    let totalGoals = 0;
    let totalMatches = 0;

    standings.forEach(team => {
        totalGoals += (team.all?.goals?.for || 0);
        totalMatches += (team.all?.played || 0);
    });

    const leagueAvgGoals = totalMatches > 0 ? totalGoals / totalMatches : 1.4;

    return {
        leagueAvgGoals,
        standings: standings.reduce((acc, team) => {
            acc[team.team.id] = {
                position: team.rank,
                pointsPerGame: team.all?.played > 0 ? (team.points / team.all.played).toFixed(2) : 0,
                goalsPerMatch: team.all?.played > 0 ? (team.all.goals.for / team.all.played).toFixed(2) : 0,
                concededPerMatch: team.all?.played > 0 ? (team.all.goals.against / team.all.played).toFixed(2) : 0,
                form: team.form
            };
            return acc;
        }, {})
    };
}

/**
 * Calculate rest days between matches
 * @param {string} lastMatchDate 
 * @param {string} currentMatchDate 
 */
export function calculateRestDays(lastMatchDate, currentMatchDate = new Date()) {
    if (!lastMatchDate) return 7; // Default to fully rested if unknown

    const last = new Date(lastMatchDate);
    const current = new Date(currentMatchDate);

    // Calculate difference in days
    const diffTime = Math.abs(current - last);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}
