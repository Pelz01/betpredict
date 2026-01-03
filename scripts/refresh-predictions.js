/**
 * PREDICT - Autonomous Refresh Script
 * Uses SPORTMONKS API (instead of API-Football)
 * + Pure Algorithm Engine
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
// CONFIGURATION
// ============================================

const SPORTMONKS_API_KEY = process.env.SPORTMONKS_API_KEY || process.env.VITE_SPORTMONKS_API_KEY;
const GIST_ID = process.env.GIST_ID || process.env.VITE_GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN;

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';

// Sportmonks League IDs (different from API-Football)
const LEAGUES = [
    { id: 8, name: 'Premier League' },
    { id: 564, name: 'La Liga' },
    { id: 384, name: 'Serie A' },
    { id: 82, name: 'Bundesliga' },
    { id: 301, name: 'Ligue 1' }
];

// ============================================
// SPORTMONKS API HELPERS
// ============================================

async function sportmonksRequest(endpoint, includes = []) {
    let url = `${SPORTMONKS_BASE}${endpoint}?api_token=${SPORTMONKS_API_KEY}`;

    if (includes.length > 0) {
        url += `&include=${includes.join(';')}`;
    }

    console.log(`📡 Fetching: ${endpoint}`);

    const response = await fetch(url);

    if (!response.ok) {
        const text = await response.text();
        console.error(`API Error: ${response.status} - ${text}`);
        return [];
    }

    const json = await response.json();
    return json.data || [];
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

async function getFixtures(days = 2) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    const fixtures = await sportmonksRequest(
        `/fixtures/between/${start}/${end}`,
        ['participants', 'odds', 'league', 'scores']
    );

    return fixtures || [];
}

async function getTeamStats(teamId) {
    const fixtures = await sportmonksRequest(
        `/fixtures/past/teams/${teamId}`,
        ['participants', 'scores']
    );
    return calculateForm(fixtures?.slice(0, 10) || [], teamId);
}

function calculateForm(fixtures, teamId) {
    let wins = 0, draws = 0, losses = 0;
    let goalsFor = 0, goalsAgainst = 0;

    fixtures.forEach(fixture => {
        const participants = fixture.participants || [];
        const home = participants.find(p => p.meta?.location === 'home');
        const away = participants.find(p => p.meta?.location === 'away');

        const scores = fixture.scores || [];
        const homeScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'home')?.score?.goals || 0;
        const awayScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'away')?.score?.goals || 0;

        const isHome = home?.id === teamId;

        if (isHome) {
            goalsFor += homeScore;
            goalsAgainst += awayScore;
            if (homeScore > awayScore) wins++;
            else if (homeScore < awayScore) losses++;
            else draws++;
        } else {
            goalsFor += awayScore;
            goalsAgainst += homeScore;
            if (awayScore > homeScore) wins++;
            else if (awayScore < homeScore) losses++;
            else draws++;
        }
    });

    return { wins, draws, losses, goalsFor, goalsAgainst, matches: fixtures.length };
}

function extractOdds(fixture) {
    const odds = fixture.odds || [];
    let home = 2.0, draw = 3.3, away = 3.5;

    // Find 1X2 odds
    odds.forEach(odd => {
        const label = (odd.label || odd.name || '').toLowerCase();
        const value = parseFloat(odd.value) || 0;

        if (label === '1' || label === 'home' || label.includes('home')) {
            if (value > 1) home = value;
        } else if (label === 'x' || label === 'draw') {
            if (value > 1) draw = value;
        } else if (label === '2' || label === 'away' || label.includes('away')) {
            if (value > 1) away = value;
        }
    });

    return { home, draw, away };
}

// ============================================
// DATA TRANSFORMATION
// ============================================

function transformToMatchData(fixture, homeForm, awayForm) {
    const participants = fixture.participants || [];
    const home = participants.find(p => p.meta?.location === 'home') || {};
    const away = participants.find(p => p.meta?.location === 'away') || {};

    const odds = extractOdds(fixture);
    const league = fixture.league?.name || 'Unknown League';

    return {
        match_id: `sm_${fixture.id}`,
        match_display: `${home.name || 'Home'} vs ${away.name || 'Away'}`,
        league: league,
        kickoff: fixture.starting_at || new Date().toISOString(),
        home_team: home.name || 'Home',
        away_team: away.name || 'Away',
        home_form: homeForm,
        away_form: awayForm,
        h2h: [],
        odds: odds
    };
}

// ============================================
// GIST STORAGE
// ============================================

async function saveToGist(data) {
    if (!GIST_ID || !GITHUB_TOKEN) {
        console.warn('⚠️ Gist not configured');
        console.log('📋 Output:', JSON.stringify(data, null, 2));
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
// MAIN
// ============================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('🏆 PREDICT - SPORTMONKS MODE');
    console.log(`📅 ${new Date().toISOString()}`);

    if (!SPORTMONKS_API_KEY) {
        console.error('❌ SPORTMONKS_API_KEY not configured');
        process.exit(1);
    }

    try {
        // STEP 1: Fetch fixtures
        console.log('\n📡 Fetching fixtures...');
        const fixtures = await getFixtures(2);
        console.log(`📊 Found ${fixtures.length} fixtures`);

        if (fixtures.length === 0) {
            console.log('No fixtures found.');
            await saveToGist({
                lastUpdated: new Date().toISOString(),
                mode: 'SPORTMONKS',
                stats: { matches_analyzed: 0, profitable_bets: 0 },
                predictions: { high: [], medium: [], low: [] }
            });
            return;
        }

        // STEP 2: Analyze matches
        console.log('\n🔍 Analyzing matches...');
        const allBets = [];
        const limit = Math.min(fixtures.length, 15);

        for (let i = 0; i < limit; i++) {
            const fixture = fixtures[i];
            const participants = fixture.participants || [];
            const home = participants.find(p => p.meta?.location === 'home');
            const away = participants.find(p => p.meta?.location === 'away');

            if (!home || !away) continue;

            console.log(`  [${i + 1}/${limit}] ${home.name} vs ${away.name}`);

            try {
                // Get team form (with rate limiting)
                await sleep(300);
                const homeForm = await getTeamStats(home.id);
                await sleep(300);
                const awayForm = await getTeamStats(away.id);

                // Transform and predict
                const matchData = transformToMatchData(fixture, homeForm, awayForm);
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
            mode: 'SPORTMONKS',
            stats: {
                matches_analyzed: limit,
                profitable_bets: allBets.length
            },
            predictions: {
                high: allBets.filter(b => b.confidence >= 75 || b.tier === 'ELITE' || b.tier === 'STRONG'),
                medium: allBets.filter(b => b.confidence >= 60 && b.confidence < 75 && b.tier === 'VALUE'),
                low: allBets.filter(b => b.tier === 'MARGINAL')
            }
        };

        console.log(`\n💰 Results:`);
        console.log(`   Total bets: ${allBets.length}`);
        console.log(`   High: ${result.predictions.high.length}`);
        console.log(`   Medium: ${result.predictions.medium.length}`);
        console.log(`   Low: ${result.predictions.low.length}`);

        // STEP 4: Save
        await saveToGist(result);
        console.log('🎉 Complete!');

    } catch (error) {
        console.error('❌ Fatal:', error);
        process.exit(1);
    }
}

main();
