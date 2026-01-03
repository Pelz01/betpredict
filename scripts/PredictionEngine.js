/**
 * PredictionEngine - Pure Mathematical Prediction System
 * No AI dependency - deterministic algorithm using weighted factors
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const WEIGHTS = {
    currentForm: 0.35,
    leaguePerformance: 0.25,
    headToHead: 0.15,
    situational: 0.15,
    squadStatus: 0.10
};

const LEAGUE_AVERAGES = {
    'Premier League': { goals: 1.4, home_advantage: 0.38 },
    'La Liga': { goals: 1.35, home_advantage: 0.42 },
    'Serie A': { goals: 1.28, home_advantage: 0.45 },
    'Bundesliga': { goals: 1.5, home_advantage: 0.35 },
    'Ligue 1': { goals: 1.3, home_advantage: 0.40 },
    'Championship': { goals: 1.35, home_advantage: 0.42 },
    'Eredivisie': { goals: 1.55, home_advantage: 0.38 },
    'Liga Portugal': { goals: 1.25, home_advantage: 0.45 },
    'MLS': { goals: 1.45, home_advantage: 0.35 },
    'default': { goals: 1.35, home_advantage: 0.40 }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
}

function poisson(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// ============================================================================
// FACTOR CALCULATIONS
// ============================================================================

function calculateFormScore(matchData) {
    const homeForm = matchData.home_form || {};
    const awayForm = matchData.away_form || {};

    // Score from last 5 results (W=3, D=1, L=0)
    const homeScore = (homeForm.wins || 0) * 3 + (homeForm.draws || 0) * 1;
    const awayScore = (awayForm.wins || 0) * 3 + (awayForm.draws || 0) * 1;

    const maxScore = 15; // 5 wins = 15 points
    const diff = (homeScore - awayScore) / maxScore;

    return clamp(diff, -1, 1);
}

function calculateLeagueScore(matchData) {
    const leagueAvg = LEAGUE_AVERAGES[matchData.league] || LEAGUE_AVERAGES['default'];
    const avgGoals = leagueAvg.goals;

    const homeGoalsFor = matchData.home_form?.goalsFor || avgGoals * 5;
    const homeGoalsAgainst = matchData.home_form?.goalsAgainst || avgGoals * 5;
    const awayGoalsFor = matchData.away_form?.goalsFor || avgGoals * 5;
    const awayGoalsAgainst = matchData.away_form?.goalsAgainst || avgGoals * 5;

    // Attack vs Defense matchup
    const homeAttack = homeGoalsFor / 5 / avgGoals;
    const homeDefense = homeGoalsAgainst / 5 / avgGoals;
    const awayAttack = awayGoalsFor / 5 / avgGoals;
    const awayDefense = awayGoalsAgainst / 5 / avgGoals;

    const attackAdvantage = homeAttack / Math.max(awayDefense, 0.1);
    const defenseAdvantage = awayAttack / Math.max(homeDefense, 0.1);

    const score = (attackAdvantage - defenseAdvantage) / 2;
    return clamp(score, -1, 1);
}

function calculateH2HScore(matchData) {
    // If no H2H data, return 0 (neutral)
    if (!matchData.h2h || matchData.h2h.length === 0) {
        return 0;
    }

    let homeWins = 0, draws = 0, awayWins = 0;
    matchData.h2h.forEach(match => {
        if (match.winner === 'home') homeWins++;
        else if (match.winner === 'away') awayWins++;
        else draws++;
    });

    const total = matchData.h2h.length;
    const score = (homeWins - awayWins) / total;
    return clamp(score, -1, 1);
}

function calculateSituationalScore(matchData) {
    const leagueAvg = LEAGUE_AVERAGES[matchData.league] || LEAGUE_AVERAGES['default'];

    // Base home advantage
    let score = leagueAvg.home_advantage * 0.5;

    // Rest advantage (if available)
    if (matchData.rest_days) {
        const restDiff = (matchData.rest_days.home || 3) - (matchData.rest_days.away || 3);
        score += clamp(restDiff / 7, -0.3, 0.3);
    }

    return clamp(score, -1, 1);
}

function calculateSquadScore(matchData) {
    // Free plan doesn't have injury data - return 0 with flag
    return { score: 0, dataAvailable: false };
}

// ============================================================================
// PROBABILITY CALCULATIONS (Poisson Model)
// ============================================================================

function calculateExpectedGoals(matchData, totalScore) {
    const leagueAvg = LEAGUE_AVERAGES[matchData.league] || LEAGUE_AVERAGES['default'];
    const avgGoals = leagueAvg.goals;
    const homeAdvantage = leagueAvg.home_advantage;

    // Base expected goals
    let homeXG = avgGoals * (1 + homeAdvantage);
    let awayXG = avgGoals;

    // Adjust based on form
    const homeForm = matchData.home_form || {};
    const awayForm = matchData.away_form || {};

    if (homeForm.goalsFor) {
        homeXG = (homeForm.goalsFor / 5) * (1 + homeAdvantage * 0.5);
    }
    if (awayForm.goalsFor) {
        awayXG = awayForm.goalsFor / 5;
    }

    // Adjust based on weighted score
    const adjustment = totalScore * 0.3;
    homeXG *= (1 + adjustment);
    awayXG *= (1 - adjustment);

    return { home: Math.max(0.5, homeXG), away: Math.max(0.3, awayXG) };
}

function calculateMatchProbabilities(homeXG, awayXG) {
    let homeWin = 0, draw = 0, awayWin = 0;

    // Sum probabilities for each scoreline
    for (let h = 0; h <= 7; h++) {
        for (let a = 0; a <= 7; a++) {
            const prob = poisson(h, homeXG) * poisson(a, awayXG);
            if (h > a) homeWin += prob;
            else if (h === a) draw += prob;
            else awayWin += prob;
        }
    }

    // Normalize
    const total = homeWin + draw + awayWin;
    return {
        home_win: homeWin / total,
        draw: draw / total,
        away_win: awayWin / total
    };
}

function calculateBTTSProbability(homeXG, awayXG) {
    const homeScores = 1 - poisson(0, homeXG);
    const awayScores = 1 - poisson(0, awayXG);
    return homeScores * awayScores;
}

function calculateOverUnderProbability(totalXG, line) {
    let under = 0;
    for (let i = 0; i <= line; i++) {
        under += poisson(i, totalXG);
    }
    return { over: 1 - under, under: under };
}

// ============================================================================
// MARKET ANALYSIS
// ============================================================================

function analyzeOutcome(probability, odds, description) {
    if (!odds || odds <= 1) {
        return null;
    }

    const impliedProb = 1 / odds;
    const ev = (probability * odds) - 1;
    const evPercent = ev * 100;
    const kellyStake = Math.max(0, ((probability * odds - 1) / (odds - 1)) * 100);

    let tier = 'SKIP';
    if (evPercent >= 10) tier = 'ELITE';
    else if (evPercent >= 7) tier = 'STRONG';
    else if (evPercent >= 5) tier = 'VALUE';
    else if (evPercent >= 3) tier = 'MARGINAL';

    return {
        description,
        probability: Math.round(probability * 1000) / 10,
        odds,
        implied_probability: Math.round(impliedProb * 1000) / 10,
        ev: Math.round(evPercent * 10) / 10,
        kelly_stake: Math.round(kellyStake * 10) / 10,
        tier
    };
}

function analyzeAllMarkets(matchData, probs, xg, odds) {
    const markets = [];
    const totalXG = xg.home + xg.away;

    // Match Result (1X2)
    const homeResult = analyzeOutcome(probs.home_win, odds.home || 2.0, 'Home Win');
    const drawResult = analyzeOutcome(probs.draw, odds.draw || 3.3, 'Draw');
    const awayResult = analyzeOutcome(probs.away_win, odds.away || 3.5, 'Away Win');

    if (homeResult) markets.push({ market: 'Match Result', ...homeResult });
    if (drawResult) markets.push({ market: 'Match Result', ...drawResult });
    if (awayResult) markets.push({ market: 'Match Result', ...awayResult });

    // BTTS
    const bttsProb = calculateBTTSProbability(xg.home, xg.away);
    const bttsYes = analyzeOutcome(bttsProb, odds.btts_yes || 1.85, 'BTTS Yes');
    const bttsNo = analyzeOutcome(1 - bttsProb, odds.btts_no || 1.95, 'BTTS No');

    if (bttsYes) markets.push({ market: 'BTTS', ...bttsYes });
    if (bttsNo) markets.push({ market: 'BTTS', ...bttsNo });

    // Total Goals
    const ou25 = calculateOverUnderProbability(totalXG, 2.5);
    const over25 = analyzeOutcome(ou25.over, odds.over_2_5 || 1.90, 'Over 2.5 Goals');
    const under25 = analyzeOutcome(ou25.under, odds.under_2_5 || 1.90, 'Under 2.5 Goals');

    if (over25) markets.push({ market: 'Total Goals', ...over25 });
    if (under25) markets.push({ market: 'Total Goals', ...under25 });

    const ou15 = calculateOverUnderProbability(totalXG, 1.5);
    const over15 = analyzeOutcome(ou15.over, odds.over_1_5 || 1.30, 'Over 1.5 Goals');
    const under15 = analyzeOutcome(ou15.under, odds.under_1_5 || 3.50, 'Under 1.5 Goals');

    if (over15) markets.push({ market: 'Total Goals', ...over15 });
    if (under15) markets.push({ market: 'Total Goals', ...under15 });

    return markets;
}

// ============================================================================
// MAIN PREDICTION FUNCTION
// ============================================================================

export function predictMatch(matchData) {
    // Calculate factor scores
    const formScore = calculateFormScore(matchData);
    const leagueScore = calculateLeagueScore(matchData);
    const h2hScore = calculateH2HScore(matchData);
    const situationalScore = calculateSituationalScore(matchData);
    const squadResult = calculateSquadScore(matchData);

    // Weighted total score
    const totalScore = (
        formScore * WEIGHTS.currentForm +
        leagueScore * WEIGHTS.leaguePerformance +
        h2hScore * WEIGHTS.headToHead +
        situationalScore * WEIGHTS.situational +
        squadResult.score * WEIGHTS.squadStatus
    );

    // Calculate expected goals
    const xg = calculateExpectedGoals(matchData, totalScore);

    // Calculate probabilities
    const probs = calculateMatchProbabilities(xg.home, xg.away);

    // Analyze all markets
    const odds = matchData.odds || {};
    const markets = analyzeAllMarkets(matchData, probs, xg, odds);

    // Calculate confidence
    let confidence = 65;
    if (matchData.home_form?.matches >= 5) confidence += 5;
    if (matchData.away_form?.matches >= 5) confidence += 5;
    if (matchData.h2h?.length >= 3) confidence += 5;
    if (Math.abs(totalScore) > 0.3) confidence += 10;
    confidence = clamp(confidence, 50, 95);

    // Filter profitable bets (EV >= 3%)
    const recommendations = markets
        .filter(m => m.ev >= 3 && m.tier !== 'SKIP')
        .sort((a, b) => b.ev - a.ev)
        .slice(0, 3); // Top 3 bets per match

    // Build result
    return {
        match_id: matchData.match_id,
        match_display: matchData.match_display,
        league: matchData.league,
        kickoff: matchData.kickoff,
        factors: {
            form: Math.round(formScore * 100) / 100,
            league: Math.round(leagueScore * 100) / 100,
            h2h: Math.round(h2hScore * 100) / 100,
            situational: Math.round(situationalScore * 100) / 100,
            squad: squadResult.score,
            squad_data_available: squadResult.dataAvailable
        },
        expected_goals: {
            home: Math.round(xg.home * 100) / 100,
            away: Math.round(xg.away * 100) / 100
        },
        probabilities: {
            home_win: Math.round(probs.home_win * 1000) / 10,
            draw: Math.round(probs.draw * 1000) / 10,
            away_win: Math.round(probs.away_win * 1000) / 10
        },
        confidence,
        recommendations,
        data_quality: {
            has_form: !!(matchData.home_form?.matches),
            has_h2h: !!(matchData.h2h?.length),
            has_odds: !!(matchData.odds?.home),
            has_injuries: squadResult.dataAvailable
        }
    };
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

export function predictMatches(matches) {
    return matches.map(m => predictMatch(m));
}
