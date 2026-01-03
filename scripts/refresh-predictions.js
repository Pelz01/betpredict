/**
 * PREDICT - Autonomous Refresh Script (FREE TIER OPTIMIZED)
 * 
 * Budget: 100 requests/day
 * Strategy: EPL + La Liga only, aggressive caching, smart batching
 */

import fs from 'fs';
import path from 'path';
import { predictMatch } from './PredictionEngine.js';

// ============================================
// ENV LOADER
// ============================================
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                if (key && !key.startsWith('#')) process.env[key] = value;
            }
        });
        console.log('✅ Loaded .env');
    }
} catch (e) { console.warn('⚠️ No .env file'); }

// ============================================
// CONFIGURATION - FREE TIER OPTIMIZED
// ============================================

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || process.env.VITE_API_FOOTBALL_KEY;
const GIST_ID = process.env.GIST_ID || process.env.VITE_GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN;

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

// FREE TIER: Only EPL + La Liga (saves requests)
const FREE_TIER_LEAGUES = [
    { id: 39, name: 'Premier League' },
    { id: 140, name: 'La Liga' }
];

// Cache file path
const CACHE_FILE = path.resolve(process.cwd(), 'scripts/cache.json');

// ============================================
// FILE-BASED CACHE SYSTEM
// ============================================

let cache = {};

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            console.log('📦 Cache loaded');
        }
    } catch (e) {
        cache = {};
    }
}

function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.warn('⚠️ Cache save failed');
    }
}

function getCached(key, maxAgeMs) {
    const item = cache[key];
    if (!item) return null;
    if (Date.now() - item.timestamp > maxAgeMs) {
        delete cache[key];
        return null;
    }
    return item.data;
}

function setCache(key, data) {
    cache[key] = { data, timestamp: Date.now() };
}

// Cache durations (in milliseconds)
const CACHE_DURATION = {
    fixtures: 12 * 60 * 60 * 1000,    // 12 hours
    standings: 24 * 60 * 60 * 1000,   // 24 hours
    odds: 4 * 60 * 60 * 1000          // 4 hours
};

// ============================================
// API HELPERS (REQUEST TRACKING)
// ============================================

let requestCount = 0;
const MAX_REQUESTS = 95; // Leave 5 buffer

async function apiFootballRequest(endpoint, params = {}) {
    if (requestCount >= MAX_REQUESTS) {
        console.warn('⚠️ Request limit reached, using cached/default data');
        return [];
    }

    const url = new URL(`${API_FOOTBALL_BASE}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const response = await fetch(url, {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY }
    });

    requestCount++;
    console.log(`📡 API Request #${requestCount}: ${endpoint}`);

    if (!response.ok) throw new Error(`API: ${response.status}`);
    const json = await response.json();

    if (json.errors && Object.keys(json.errors).length > 0) {
        console.error('API Error:', JSON.stringify(json.errors));
        return [];
    }

    return json.response || [];
}

// ============================================
// DATA FETCHERS (CACHED)
// ============================================

async function getFixtures(leagueId, season, dateFrom, dateTo) {
    const cacheKey = `fixtures_${leagueId}_${dateFrom}`;
    const cached = getCached(cacheKey, CACHE_DURATION.fixtures);
    if (cached) {
        console.log(`📦 Cache hit: fixtures ${leagueId}`);
        return cached;
    }

    const data = await apiFootballRequest('/fixtures', {
        league: leagueId,
        season: season,
        from: dateFrom,
        to: dateTo
    });

    if (data.length > 0) setCache(cacheKey, data);
    return data;
}

async function getStandings(leagueId, season) {
    const cacheKey = `standings_${leagueId}_${season}`;
    const cached = getCached(cacheKey, CACHE_DURATION.standings);
    if (cached) {
        console.log(`📦 Cache hit: standings ${leagueId}`);
        return cached;
    }

    const data = await apiFootballRequest('/standings', { league: leagueId, season });
    const standings = data[0]?.league?.standings?.[0] || [];

    if (standings.length > 0) setCache(cacheKey, standings);
    return standings;
}

async function getOdds(fixtureId) {
    const cacheKey = `odds_${fixtureId}`;
    const cached = getCached(cacheKey, CACHE_DURATION.odds);
    if (cached) return cached;

    const data = await apiFootballRequest('/odds', { fixture: fixtureId });
    const odds = extractOdds(data);

    if (odds) setCache(cacheKey, odds);
    return odds;
}

function extractOdds(oddsData) {
    if (!oddsData || oddsData.length === 0) return null;
    const bookmakers = oddsData[0]?.bookmakers || [];

    for (const bm of bookmakers) {
        const market = bm.bets?.find(b => b.name === 'Match Winner');
        if (market) {
            const home = market.values?.find(v => v.value === 'Home')?.odd;
            const draw = market.values?.find(v => v.value === 'Draw')?.odd;
            const away = market.values?.find(v => v.value === 'Away')?.odd;
            if (home && draw && away) {
                return { home: parseFloat(home), draw: parseFloat(draw), away: parseFloat(away) };
            }
        }
    }
    return null;
}

// ============================================
// DATA TRANSFORMATION
// ============================================

function transformToMatchData(fixture, standings, odds) {
    const home = fixture.teams.home;
    const away = fixture.teams.away;

    const homeStanding = standings.find(s => s.team.id === home.id);
    const awayStanding = standings.find(s => s.team.id === away.id);

    const homeForm = homeStanding ? {
        wins: homeStanding.all.win || 0,
        draws: homeStanding.all.draw || 0,
        losses: homeStanding.all.lose || 0,
        goalsFor: homeStanding.all.goals?.for || 0,
        goalsAgainst: homeStanding.all.goals?.against || 0,
        matches: homeStanding.all.played || 0,
        position: homeStanding.rank || 10
    } : { wins: 2, draws: 1, losses: 2, goalsFor: 5, goalsAgainst: 5, matches: 5, position: 10 };

    const awayForm = awayStanding ? {
        wins: awayStanding.all.win || 0,
        draws: awayStanding.all.draw || 0,
        losses: awayStanding.all.lose || 0,
        goalsFor: awayStanding.all.goals?.for || 0,
        goalsAgainst: awayStanding.all.goals?.against || 0,
        matches: awayStanding.all.played || 0,
        position: awayStanding.rank || 10
    } : { wins: 2, draws: 1, losses: 2, goalsFor: 5, goalsAgainst: 5, matches: 5, position: 10 };

    return {
        match_id: `match_${fixture.fixture.id}`,
        match_display: `${home.name} vs ${away.name}`,
        league: fixture.league.name,
        kickoff: fixture.fixture.date,
        home_team: home.name,
        away_team: away.name,
        home_form: homeForm,
        away_form: awayForm,
        h2h: [],
        odds: odds || { home: 2.0, draw: 3.3, away: 3.5 }
    };
}

// ============================================
// GIST STORAGE
// ============================================

async function saveToGist(data) {
    if (!GIST_ID || !GITHUB_TOKEN) {
        console.warn('⚠️ Gist not configured');
        return;
    }

    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            files: { 'oracle_predictions.json': { content: JSON.stringify(data, null, 2) } }
        })
    });

    if (!response.ok) throw new Error(`Gist: ${response.status}`);
    console.log('✅ Saved to Gist');
}

// ============================================
// MAIN - FREE TIER OPTIMIZED
// ============================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('🏆 PREDICT - FREE TIER MODE');
    console.log(`📅 ${new Date().toISOString()}`);
    console.log(`📊 Leagues: EPL + La Liga only`);
    console.log(`💾 Request budget: ${MAX_REQUESTS}`);

    loadCache();

    try {
        // Historical date for free plan testing
        const today = '2024-02-10';
        const tomorrow = '2024-02-11';
        const season = '2023';

        // For live mode (paid plan), use:
        // const today = new Date().toISOString().split('T')[0];
        // const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        // const season = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;

        // STEP 1: Fetch fixtures from both leagues
        console.log('\n📡 Fetching fixtures...');
        let allFixtures = [];
        const standingsMap = {};

        for (const league of FREE_TIER_LEAGUES) {
            const fixtures = await getFixtures(league.id, season, today, tomorrow);
            allFixtures = allFixtures.concat(fixtures);

            // Get standings for this league
            standingsMap[league.id] = await getStandings(league.id, season);
            await sleep(200);
        }

        console.log(`📊 Found ${allFixtures.length} fixtures`);
        console.log(`📡 Requests used: ${requestCount}/${MAX_REQUESTS}`);

        if (allFixtures.length === 0) {
            console.log('No fixtures found. Saving empty state.');
            await saveToGist({
                lastUpdated: new Date().toISOString(),
                mode: 'FREE_TIER',
                stats: { matches_analyzed: 0, profitable_bets: 0, requests_used: requestCount },
                predictions: { high: [], medium: [], low: [] }
            });
            saveCache();
            return;
        }

        // STEP 2: Analyze matches (limit to save requests)
        console.log('\n🔍 Analyzing matches...');
        const allBets = [];
        const limit = Math.min(allFixtures.length, 15); // Max 15 matches

        for (let i = 0; i < limit; i++) {
            const fixture = fixtures[i] || allFixtures[i];
            if (!fixture) continue;

            const home = fixture.teams.home;
            const away = fixture.teams.away;
            console.log(`  [${i + 1}/${limit}] ${home.name} vs ${away.name}`);

            try {
                // Get odds (with caching)
                const odds = await getOdds(fixture.fixture.id);
                await sleep(150);

                // Get standings for this league
                const standings = standingsMap[fixture.league.id] || [];

                // Transform and predict
                const matchData = transformToMatchData(fixture, standings, odds);
                const prediction = predictMatch(matchData);

                // Collect recommendations
                if (prediction.recommendations?.length > 0) {
                    prediction.recommendations.forEach(rec => {
                        allBets.push({
                            match_id: prediction.match_id,
                            match_display: prediction.match_display,
                            league: prediction.league,
                            kickoff: prediction.kickoff,
                            market: rec.market,
                            pick: rec.description,
                            odds: rec.odds,
                            ev: rec.ev,
                            confidence: prediction.confidence,
                            tier: rec.tier,
                            stake: `${Math.round(rec.kelly_stake / 2)}% Kelly`,
                            reason: `xG: ${prediction.expected_goals.home}-${prediction.expected_goals.away} | Prob: ${rec.probability}%`,
                            risk_factors: [],
                            data_quality: prediction.data_quality
                        });
                    });
                }
            } catch (err) {
                console.error(`  ❌ Error: ${err.message}`);
            }
        }

        // STEP 3: Sort and categorize
        allBets.sort((a, b) => b.ev - a.ev);

        const result = {
            lastUpdated: new Date().toISOString(),
            mode: 'FREE_TIER',
            stats: {
                matches_analyzed: limit,
                profitable_bets: allBets.length,
                requests_used: requestCount,
                cache_hits: Object.keys(cache).length
            },
            predictions: {
                high: allBets.filter(b => b.confidence >= 75 || b.tier === 'ELITE' || b.tier === 'STRONG'),
                medium: allBets.filter(b => b.confidence >= 60 && b.confidence < 75 && b.tier === 'VALUE'),
                low: allBets.filter(b => b.tier === 'MARGINAL')
            }
        };

        console.log(`\n💰 Results:`);
        console.log(`   High: ${result.predictions.high.length}`);
        console.log(`   Medium: ${result.predictions.medium.length}`);
        console.log(`   Low: ${result.predictions.low.length}`);
        console.log(`   Requests: ${requestCount}/${MAX_REQUESTS}`);

        // STEP 4: Save
        await saveToGist(result);
        saveCache();
        console.log('🎉 Complete!');

    } catch (error) {
        console.error('❌ Fatal:', error);
        saveCache();
        process.exit(1);
    }
}

main();
