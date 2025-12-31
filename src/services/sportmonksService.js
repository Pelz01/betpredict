/**
 * Sportmonks API Service
 * Fetches live soccer fixtures, odds, and statistics
 */

const API_BASE = 'https://api.sportmonks.com/v3/football';
const API_KEY = import.meta.env.VITE_SPORTMONKS_API_KEY;

// Cache for reducing API calls
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Make authenticated request to Sportmonks API
 */
async function apiRequest(endpoint, includes = [], filters = []) {
    const cacheKey = `${endpoint}-${includes.join(',')}-${filters.join(',')}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`📦 Cache hit: ${endpoint}`);
        return cached.data;
    }

    let url = `${API_BASE}${endpoint}?api_token=${API_KEY}`;

    if (includes.length > 0) {
        url += `&include=${includes.join(';')}`;
    }

    if (filters.length > 0) {
        url += `&filters=${filters.join(';')}`;
    }

    console.log(`🌐 Fetching: ${endpoint}`);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Sportmonks API error: ${response.status}`);
        }

        const json = await response.json();

        // Cache the response
        cache.set(cacheKey, {
            data: json.data,
            timestamp: Date.now()
        });

        return json.data;
    } catch (error) {
        console.error('Sportmonks API Error:', error);
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
 * Get upcoming fixtures for the next N days
 * @param {number} days - Number of days ahead
 * @param {number[]} leagueIds - Optional league IDs to filter
 */
export async function getUpcomingFixtures(days = 7, leagueIds = []) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    const includes = [
        'participants',
        'odds',
        'league',
        'venue',
        'scores'
    ];

    const filters = [];
    if (leagueIds.length > 0) {
        filters.push(`fixtureLeagues:${leagueIds.join(',')}`);
    }

    const fixtures = await apiRequest(
        `/fixtures/between/${start}/${end}`,
        includes,
        filters
    );

    return fixtures || [];
}

/**
 * Get detailed fixture with all data
 * @param {number} fixtureId 
 */
export async function getFixtureDetails(fixtureId) {
    const includes = [
        'participants',
        'odds',
        'statistics',
        'league',
        'venue',
        'events',
        'lineups',
        'scores',
        'weatherReport'
    ];

    return apiRequest(`/fixtures/${fixtureId}`, includes);
}

/**
 * Get team information and statistics
 * @param {number} teamId 
 */
export async function getTeamStats(teamId) {
    const includes = ['statistics', 'players', 'coach'];
    return apiRequest(`/teams/${teamId}`, includes);
}

/**
 * Get team's recent fixtures (form)
 * @param {number} teamId 
 * @param {number} limit 
 */
export async function getTeamForm(teamId, limit = 10) {
    const fixtures = await apiRequest(`/fixtures/past/teams/${teamId}`, ['participants', 'scores']);
    return fixtures?.slice(0, limit) || [];
}

/**
 * Get head-to-head record between two teams
 * @param {number} team1Id 
 * @param {number} team2Id 
 */
export async function getHeadToHead(team1Id, team2Id) {
    return apiRequest(
        `/fixtures/head-to-head/${team1Id}/${team2Id}`,
        ['participants', 'scores']
    );
}

/**
 * Get available leagues
 */
export async function getLeagues() {
    return apiRequest('/leagues', ['country']);
}

/**
 * Get popular leagues (top tier)
 */
export async function getPopularLeagues() {
    // Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League
    const popularIds = [8, 564, 384, 82, 301, 2];
    const leagues = await getLeagues();
    return leagues?.filter(l => popularIds.includes(l.id)) || [];
}

/**
 * Extract best odds from fixture data
 * @param {object} fixture 
 */
export function extractBestOdds(fixture) {
    if (!fixture.odds || fixture.odds.length === 0) {
        return null;
    }

    // Filter to 1X2 market (Match Winner)
    const matchWinnerOdds = fixture.odds.filter(odd => {
        // Market ID 1 is typically 1X2 / Match Winner
        return odd.market_id === 1 || odd.name?.includes('1X2');
    });

    if (matchWinnerOdds.length === 0) {
        // Try to find any odds with home/draw/away
        return extractOddsFromAny(fixture.odds);
    }

    // Find best odds for each outcome
    let bestHome = 0, bestDraw = 0, bestAway = 0;

    matchWinnerOdds.forEach(odd => {
        if (odd.label === '1' || odd.label === 'Home') {
            bestHome = Math.max(bestHome, parseFloat(odd.value) || 0);
        } else if (odd.label === 'X' || odd.label === 'Draw') {
            bestDraw = Math.max(bestDraw, parseFloat(odd.value) || 0);
        } else if (odd.label === '2' || odd.label === 'Away') {
            bestAway = Math.max(bestAway, parseFloat(odd.value) || 0);
        }
    });

    return {
        home: bestHome || 2.0,
        draw: bestDraw || 3.5,
        away: bestAway || 3.0
    };
}

/**
 * Helper to extract odds from various formats
 */
function extractOddsFromAny(odds) {
    const result = { home: 2.0, draw: 3.5, away: 3.0 };

    odds.forEach(odd => {
        const value = parseFloat(odd.value) || 0;
        const label = (odd.label || '').toLowerCase();

        if (label.includes('home') || label === '1') {
            result.home = Math.max(result.home, value);
        } else if (label.includes('draw') || label === 'x') {
            result.draw = Math.max(result.draw, value);
        } else if (label.includes('away') || label === '2') {
            result.away = Math.max(result.away, value);
        }
    });

    return result;
}

/**
 * Extract team form (W/D/L) from recent fixtures
 * @param {object[]} fixtures - Recent fixtures
 * @param {number} teamId - Team to analyze
 */
export function calculateTeamForm(fixtures, teamId) {
    const form = [];
    let goalsScored = 0;
    let goalsConceded = 0;

    fixtures.forEach(fixture => {
        const isHome = fixture.participants?.find(p => p.id === teamId && p.meta?.location === 'home');
        const scores = fixture.scores || [];

        const homeScore = scores.find(s => s.description === 'CURRENT' && s.participant === 'home')?.score || 0;
        const awayScore = scores.find(s => s.description === 'CURRENT' && s.participant === 'away')?.score || 0;

        if (isHome) {
            goalsScored += homeScore;
            goalsConceded += awayScore;
            if (homeScore > awayScore) form.push('W');
            else if (homeScore < awayScore) form.push('L');
            else form.push('D');
        } else {
            goalsScored += awayScore;
            goalsConceded += homeScore;
            if (awayScore > homeScore) form.push('W');
            else if (awayScore < homeScore) form.push('L');
            else form.push('D');
        }
    });

    return {
        form: form.slice(0, 5).join(''),
        wins: form.filter(f => f === 'W').length,
        draws: form.filter(f => f === 'D').length,
        losses: form.filter(f => f === 'L').length,
        goalsScored,
        goalsConceded,
        avgGoalsScored: fixtures.length > 0 ? goalsScored / fixtures.length : 0,
        avgGoalsConceded: fixtures.length > 0 ? goalsConceded / fixtures.length : 0
    };
}

/**
 * Clear the cache
 */
export function clearCache() {
    cache.clear();
    console.log('🗑️ Cache cleared');
}

/**
 * Test API connection
 */
export async function testConnection() {
    try {
        const leagues = await getLeagues();
        console.log(`✅ Sportmonks connected: ${leagues?.length || 0} leagues available`);
        return true;
    } catch (error) {
        console.error('❌ Sportmonks connection failed:', error);
        return false;
    }
}
