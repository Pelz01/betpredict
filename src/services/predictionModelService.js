/**
 * Prediction Model Service
 * Implements the 5-factor weighted prediction model:
 * - Current Form (35%)
 * - League Performance (25%)
 * - Head-to-Head (15%)
 * - Situational Factors (15%)
 * - Squad Status (10%)
 */

// ============================================
// WEIGHT CONFIGURATION
// ============================================

export const FACTOR_WEIGHTS = {
    FORM: 0.35,           // Current Form - most predictive
    LEAGUE: 0.25,         // League Performance
    H2H: 0.15,            // Head-to-Head
    SITUATIONAL: 0.15,    // Situational Factors
    SQUAD: 0.10           // Squad Status
};

// ============================================
// FORM SCORE CALCULATION (35% weight)
// ============================================

/**
 * Calculate form score from recent matches
 * Last 5 matches (40% of form), Last 10 (30%), Opponent quality (30%)
 * 
 * @param {object} homeForm - Home team form data
 * @param {object} awayForm - Away team form data
 * @param {object} options - Additional options
 * @returns {object} Form score analysis
 */
export function calculateFormScore(homeForm, awayForm, options = {}) {
    const { opponentAvgPosition = 10 } = options;

    // Parse form strings like "WWDLW"
    const parseFormString = (formStr) => {
        if (!formStr || formStr === '?????') return { wins: 0, draws: 0, losses: 0, points: 0 };
        const form = formStr.toUpperCase().split('');
        return {
            wins: form.filter(f => f === 'W').length,
            draws: form.filter(f => f === 'D').length,
            losses: form.filter(f => f === 'L').length,
            points: form.reduce((acc, f) => acc + (f === 'W' ? 3 : f === 'D' ? 1 : 0), 0)
        };
    };

    // Calculate Last 5 score (40% of form)
    const homeLast5 = parseFormString(homeForm?.form?.slice(0, 5));
    const awayLast5 = parseFormString(awayForm?.form?.slice(0, 5));

    const homeLast5Score = (homeLast5.points / 15) * 10; // Normalize to 0-10
    const awayLast5Score = (awayLast5.points / 15) * 10;

    // Calculate Last 10 score (30% of form)
    const homeLast10 = parseFormString(homeForm?.fullForm?.slice(0, 10));
    const awayLast10 = parseFormString(awayForm?.fullForm?.slice(0, 10));

    const homeLast10Score = (homeLast10.points / 30) * 10;
    const awayLast10Score = (awayLast10.points / 30) * 10;

    // Calculate goals metrics
    const homeGoalsFor = parseFloat(homeForm?.avgGoalsScored || 0);
    const homeGoalsAgainst = parseFloat(homeForm?.avgGoalsConceded || 0);
    const awayGoalsFor = parseFloat(awayForm?.avgGoalsScored || 0);
    const awayGoalsAgainst = parseFloat(awayForm?.avgGoalsConceded || 0);

    // Goal difference bonus (-2 to +2)
    const homeGD = Math.min(2, Math.max(-2, homeGoalsFor - homeGoalsAgainst));
    const awayGD = Math.min(2, Math.max(-2, awayGoalsFor - awayGoalsAgainst));

    // Opponent quality adjustment (30% of form)
    // Higher opponent avg position = weaker opponents = less valuable wins
    const opponentQualityMultiplier = Math.max(0.7, Math.min(1.3,
        1 + (10 - opponentAvgPosition) * 0.03
    ));

    // Combined form scores
    const homeFormScore = (
        (homeLast5Score * 0.40) +
        (homeLast10Score * 0.30) +
        ((homeLast5Score * opponentQualityMultiplier) * 0.30)
    );

    const awayFormScore = (
        (awayLast5Score * 0.40) +
        (awayLast10Score * 0.30) +
        ((awayLast5Score * opponentQualityMultiplier) * 0.30)
    );

    // Form advantage (-10 to +10 scale)
    const formAdvantage = homeFormScore - awayFormScore;

    // Detect red flags
    const redFlags = [];
    if (homeLast5.losses >= 3) redFlags.push('Home: 3+ losses in last 5');
    if (awayLast5.losses >= 3) redFlags.push('Away: 3+ losses in last 5');
    if (homeGoalsFor < 0.5) redFlags.push('Home: Scoring drought');
    if (awayGoalsFor < 0.5) redFlags.push('Away: Scoring drought');
    if (homeGoalsAgainst > 2) redFlags.push('Home: Defensive issues');
    if (awayGoalsAgainst > 2) redFlags.push('Away: Defensive issues');

    // Detect green flags
    const greenFlags = [];
    if (homeLast5.wins >= 4) greenFlags.push('Home: Hot streak (4+ wins)');
    if (awayLast5.wins >= 4) greenFlags.push('Away: Hot streak (4+ wins)');
    if (homeLast5.losses === 0) greenFlags.push('Home: Unbeaten run');
    if (awayLast5.losses === 0) greenFlags.push('Away: Unbeaten run');

    // Determine trend
    const getTrend = (form) => {
        if (!form?.form || form.form.length < 5) return 'unknown';
        const recent3 = form.form.slice(0, 3);
        const older3 = form.form.slice(3, 6);
        const recentScore = recent3.split('').reduce((a, c) => a + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0);
        const olderScore = older3.split('').reduce((a, c) => a + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0);
        if (recentScore > olderScore + 2) return 'improving';
        if (recentScore < olderScore - 2) return 'declining';
        return 'stable';
    };

    return {
        score: Math.max(-10, Math.min(10, formAdvantage)),
        weight: FACTOR_WEIGHTS.FORM,
        contribution: formAdvantage * FACTOR_WEIGHTS.FORM,
        home: {
            last5: homeLast5,
            last10: homeLast10,
            goalsFor: homeGoalsFor,
            goalsAgainst: homeGoalsAgainst,
            score: homeFormScore,
            trend: getTrend(homeForm)
        },
        away: {
            last5: awayLast5,
            last10: awayLast10,
            goalsFor: awayGoalsFor,
            goalsAgainst: awayGoalsAgainst,
            score: awayFormScore,
            trend: getTrend(awayForm)
        },
        redFlags,
        greenFlags,
        summary: `Home: ${homeForm?.form || 'N/A'} (${homeFormScore.toFixed(1)}/10). Away: ${awayForm?.form || 'N/A'} (${awayFormScore.toFixed(1)}/10). Advantage: ${formAdvantage > 0 ? 'Home' : formAdvantage < 0 ? 'Away' : 'Even'}`
    };
}

// ============================================
// LEAGUE PERFORMANCE SCORE (25% weight)
// ============================================

/**
 * Calculate league performance score using attack/defense strength
 * 
 * @param {object} homeStats - Home team statistics
 * @param {object} awayStats - Away team statistics  
 * @param {number} leagueAvgGoals - League average goals per match
 * @returns {object} League performance analysis
 */
export function calculateLeagueScore(homeStats, awayStats, leagueAvgGoals = 1.4) {
    // Attack strength = (Team Goals/Match) / (League Avg Goals/Match)
    const homeAttackStrength = (homeStats?.goalsPerMatch || leagueAvgGoals) / leagueAvgGoals;
    const awayAttackStrength = (awayStats?.goalsPerMatch || leagueAvgGoals) / leagueAvgGoals;

    // Defense strength = (Team Conceded/Match) / (League Avg Conceded/Match)
    // Lower = better defense
    const homeDefenseStrength = (homeStats?.concededPerMatch || leagueAvgGoals) / leagueAvgGoals;
    const awayDefenseStrength = (awayStats?.concededPerMatch || leagueAvgGoals) / leagueAvgGoals;

    // Home advantage factor (typically +0.3 to +0.4 goals)
    const HOME_ADVANTAGE = 1.35;

    // Calculate expected goals based on strength ratios
    const homeXG = homeAttackStrength * awayDefenseStrength * leagueAvgGoals * HOME_ADVANTAGE;
    const awayXG = awayAttackStrength * homeDefenseStrength * leagueAvgGoals;

    // xG difference indicates strength (-3 to +3 typical range)
    const xgDifference = homeXG - awayXG;

    // Convert to 0-10 scale for scoring
    // Attack strength above 1.0 = above average
    const homeAttackScore = Math.min(10, Math.max(0, homeAttackStrength * 5));
    const awayAttackScore = Math.min(10, Math.max(0, awayAttackStrength * 5));

    // Defense - lower is better, so invert
    const homeDefenseScore = Math.min(10, Math.max(0, (2 - homeDefenseStrength) * 5));
    const awayDefenseScore = Math.min(10, Math.max(0, (2 - awayDefenseStrength) * 5));

    // Combined score (attack 40%, defense 40%, xG 20%)
    const homeLeagueScore = (
        (homeAttackScore * 0.40) +
        (homeDefenseScore * 0.40) +
        (Math.min(10, (homeXG / awayXG) * 5) * 0.20)
    );

    const awayLeagueScore = (
        (awayAttackScore * 0.40) +
        (awayDefenseScore * 0.40) +
        (Math.min(10, (awayXG / homeXG) * 5) * 0.20)
    );

    const leagueAdvantage = homeLeagueScore - awayLeagueScore;

    return {
        score: Math.max(-10, Math.min(10, leagueAdvantage)),
        weight: FACTOR_WEIGHTS.LEAGUE,
        contribution: leagueAdvantage * FACTOR_WEIGHTS.LEAGUE,
        home: {
            attackStrength: parseFloat(homeAttackStrength.toFixed(2)),
            defenseStrength: parseFloat(homeDefenseStrength.toFixed(2)),
            xG: parseFloat(homeXG.toFixed(2)),
            position: homeStats?.position || null,
            pointsPerGame: homeStats?.pointsPerGame || null
        },
        away: {
            attackStrength: parseFloat(awayAttackStrength.toFixed(2)),
            defenseStrength: parseFloat(awayDefenseStrength.toFixed(2)),
            xG: parseFloat(awayXG.toFixed(2)),
            position: awayStats?.position || null,
            pointsPerGame: awayStats?.pointsPerGame || null
        },
        xgDifference: parseFloat(xgDifference.toFixed(2)),
        expectedScore: `${homeXG.toFixed(1)}-${awayXG.toFixed(1)}`,
        summary: `Attack strength: Home ${homeAttackStrength.toFixed(2)}x, Away ${awayAttackStrength.toFixed(2)}x. Defense: Home ${homeDefenseStrength.toFixed(2)}x, Away ${awayDefenseStrength.toFixed(2)}x. Expected: ${homeXG.toFixed(1)}-${awayXG.toFixed(1)}`
    };
}

// ============================================
// HEAD-TO-HEAD SCORE (15% weight)
// ============================================

/**
 * Calculate head-to-head score from historical matchups
 * Recent 5 meetings (60%), Historical 10 (40%)
 * 
 * @param {object} h2hData - Head-to-head data
 * @returns {object} H2H analysis
 */
export function calculateH2HScore(h2hData) {
    if (!h2hData || h2hData.total === 0) {
        return {
            score: 0,
            weight: FACTOR_WEIGHTS.H2H,
            contribution: 0,
            dataAvailable: false,
            summary: 'No H2H data available - neutral impact'
        };
    }

    const { homeWins = 0, draws = 0, awayWins = 0, total = 0 } = h2hData;

    // Calculate H2H advantage
    // Each home win = +2, draw = 0, away win = -2
    const h2hPoints = (homeWins * 2) + (draws * 0) + (awayWins * -2);

    // Normalize to -10 to +10 based on max possible
    const maxPoints = total * 2;
    const h2hAdvantage = maxPoints > 0 ? (h2hPoints / maxPoints) * 10 : 0;

    // Weight by sample size (more meetings = more reliable)
    const sampleMultiplier = Math.min(1, total / 5); // Full weight at 5+ meetings

    const finalScore = h2hAdvantage * sampleMultiplier;

    // Detect patterns
    const patterns = [];
    if (draws >= 3 && total <= 6) patterns.push('Draw specialists - frequent draws');
    if (homeWins >= 4 && total >= 5) patterns.push('Home dominance in H2H');
    if (awayWins >= 4 && total >= 5) patterns.push('Away dominance in H2H');

    const homeWinRate = total > 0 ? (homeWins / total * 100).toFixed(0) : 0;
    const awayWinRate = total > 0 ? (awayWins / total * 100).toFixed(0) : 0;
    const drawRate = total > 0 ? (draws / total * 100).toFixed(0) : 0;

    return {
        score: Math.max(-10, Math.min(10, finalScore)),
        weight: FACTOR_WEIGHTS.H2H,
        contribution: finalScore * FACTOR_WEIGHTS.H2H,
        dataAvailable: true,
        record: { homeWins, draws, awayWins, total },
        winRates: {
            home: parseFloat(homeWinRate),
            draw: parseFloat(drawRate),
            away: parseFloat(awayWinRate)
        },
        patterns,
        sampleMultiplier,
        summary: `Last ${total} meetings: Home ${homeWins}W, ${draws}D, ${awayWins}L. ${homeWinRate}% home win rate. ${patterns.length > 0 ? patterns[0] : ''}`
    };
}

// ============================================
// SITUATIONAL FACTORS SCORE (15% weight)
// ============================================

/**
 * Calculate situational factors score (rest, motivation, venue)
 * Rest (40%), Motivation (35%), Venue (25%)
 * 
 * @param {object} situational - Situational factors data
 * @returns {object} Situational analysis
 */
export function calculateSituationalScore(situational = {}) {
    const {
        homeRestDays = 7,
        awayRestDays = 7,
        homeMotivation = 'normal',
        awayMotivation = 'normal',
        homeFixtureCongestion = false,
        awayFixtureCongestion = false,
        weather = 'clear',
        venue = null
    } = situational;

    // Rest factor calculation
    // 7+ days = 100%, 4-6 = 95%, 3 = 85%, 2 = 70%, 1 = 50%
    const getRestScore = (days) => {
        if (days >= 7) return 10;
        if (days >= 4) return 9;
        if (days >= 3) return 7;
        if (days >= 2) return 5;
        return 3;
    };

    const homeRestScore = getRestScore(homeRestDays);
    const awayRestScore = getRestScore(awayRestDays);
    const restAdvantage = homeRestScore - awayRestScore;

    // Motivation mapping
    const motivationScores = {
        'title_chase': 10,
        'top_4_race': 9,
        'european_qualification': 8,
        'relegation_battle': 9, // High motivation despite negative context
        'derby': 9,
        'cup_final': 10,
        'cup_semi': 9,
        'normal': 5,
        'mid_table': 4,
        'nothing_to_play': 2,
        'already_relegated': 1,
        'already_champions': 3
    };

    const homeMotivScore = motivationScores[homeMotivation] || 5;
    const awayMotivScore = motivationScores[awayMotivation] || 5;
    const motivationAdvantage = homeMotivScore - awayMotivScore;

    // Venue/Weather factor
    let venueScore = 5; // Neutral
    if (venue) venueScore = 6; // Slight home edge with known venue

    // Weather impact (affects both teams equally but can lower scoring)
    const weatherImpact = {
        'clear': 0,
        'cloudy': 0,
        'light_rain': -0.5,
        'heavy_rain': -1,
        'snow': -1.5,
        'extreme_heat': -1
    };

    // Fixture congestion penalty
    const homeCongestPenalty = homeFixtureCongestion ? -1 : 0;
    const awayCongestPenalty = awayFixtureCongestion ? -1 : 0;

    // Combined situational score
    const totalSituational = (
        (restAdvantage * 0.40) +
        (motivationAdvantage * 0.35) +
        ((venueScore - 5) * 0.25) +
        (homeCongestPenalty - awayCongestPenalty)
    );

    const factors = [];
    if (restAdvantage > 2) factors.push(`Rest advantage: Home (${homeRestDays}d vs ${awayRestDays}d)`);
    if (restAdvantage < -2) factors.push(`Rest advantage: Away (${awayRestDays}d vs ${homeRestDays}d)`);
    if (homeFixtureCongestion) factors.push('Home: Fixture congestion');
    if (awayFixtureCongestion) factors.push('Away: Fixture congestion');
    if (homeMotivation !== 'normal') factors.push(`Home motivation: ${homeMotivation.replace(/_/g, ' ')}`);
    if (awayMotivation !== 'normal') factors.push(`Away motivation: ${awayMotivation.replace(/_/g, ' ')}`);

    return {
        score: Math.max(-10, Math.min(10, totalSituational)),
        weight: FACTOR_WEIGHTS.SITUATIONAL,
        contribution: totalSituational * FACTOR_WEIGHTS.SITUATIONAL,
        rest: {
            home: homeRestDays,
            away: awayRestDays,
            advantage: restAdvantage > 0 ? 'home' : restAdvantage < 0 ? 'away' : 'even'
        },
        motivation: {
            home: homeMotivation,
            away: awayMotivation,
            homeScore: homeMotivScore,
            awayScore: awayMotivScore
        },
        weather,
        factors,
        summary: factors.length > 0 ? factors.join('. ') : 'No significant situational factors'
    };
}

// ============================================
// SQUAD STATUS SCORE (10% weight)
// ============================================

/**
 * Calculate squad status score based on injuries/availability
 * 
 * @param {object} squadStatus - Squad availability data
 * @returns {object} Squad analysis
 */
export function calculateSquadScore(squadStatus = {}) {
    const {
        homeInjuries = [],
        awayInjuries = [],
        homeSuspensions = [],
        awaySuspensions = []
    } = squadStatus;

    // Impact by position/importance
    const importanceMultiplier = {
        'star': 15,
        'key': 10,
        'high': 8,
        'medium': 5,
        'low': 2,
        'rotation': 1
    };

    // Calculate total impact for each team
    const calculateImpact = (injuries, suspensions) => {
        let totalImpact = 0;

        injuries.forEach(injury => {
            const importance = injury.importance || 'medium';
            totalImpact += importanceMultiplier[importance] || 5;
        });

        suspensions.forEach(suspension => {
            const importance = suspension.importance || 'medium';
            totalImpact += importanceMultiplier[importance] || 5;
        });

        return totalImpact;
    };

    const homeImpact = calculateImpact(homeInjuries, homeSuspensions);
    const awayImpact = calculateImpact(awayInjuries, awaySuspensions);

    // Convert to availability score (100 - impact, capped at 50% minimum)
    const homeAvailability = Math.max(50, 100 - homeImpact);
    const awayAvailability = Math.max(50, 100 - awayImpact);

    // Normalize to -10 to +10 scale
    const squadAdvantage = (homeAvailability - awayAvailability) / 10;

    const issues = [];
    if (homeInjuries.length > 0) {
        issues.push(`Home: ${homeInjuries.length} injured (${homeInjuries.map(i => i.player || 'Unknown').join(', ')})`);
    }
    if (awayInjuries.length > 0) {
        issues.push(`Away: ${awayInjuries.length} injured (${awayInjuries.map(i => i.player || 'Unknown').join(', ')})`);
    }
    if (homeSuspensions.length > 0) {
        issues.push(`Home: ${homeSuspensions.length} suspended`);
    }
    if (awaySuspensions.length > 0) {
        issues.push(`Away: ${awaySuspensions.length} suspended`);
    }

    return {
        score: Math.max(-10, Math.min(10, squadAdvantage)),
        weight: FACTOR_WEIGHTS.SQUAD,
        contribution: squadAdvantage * FACTOR_WEIGHTS.SQUAD,
        home: {
            injuries: homeInjuries.length,
            suspensions: homeSuspensions.length,
            availability: homeAvailability,
            impact: homeImpact
        },
        away: {
            injuries: awayInjuries.length,
            suspensions: awaySuspensions.length,
            availability: awayAvailability,
            impact: awayImpact
        },
        issues,
        summary: issues.length > 0 ? issues.join('. ') : 'No significant squad issues reported'
    };
}

// ============================================
// TOTAL WEIGHTED CALCULATION
// ============================================

/**
 * Calculate total weighted adjustment from all factors
 * 
 * @param {object} factorScores - All factor scores
 * @returns {object} Total analysis
 */
export function calculateTotalAdjustment(factorScores) {
    const { form, league, h2h, situational, squad } = factorScores;

    const totalContribution =
        (form?.contribution || 0) +
        (league?.contribution || 0) +
        (h2h?.contribution || 0) +
        (situational?.contribution || 0) +
        (squad?.contribution || 0);

    // Identify top factors driving prediction
    const factors = [
        { name: 'Current Form', score: form?.score || 0, weight: FACTOR_WEIGHTS.FORM },
        { name: 'League Performance', score: league?.score || 0, weight: FACTOR_WEIGHTS.LEAGUE },
        { name: 'Head-to-Head', score: h2h?.score || 0, weight: FACTOR_WEIGHTS.H2H },
        { name: 'Situational', score: situational?.score || 0, weight: FACTOR_WEIGHTS.SITUATIONAL },
        { name: 'Squad Status', score: squad?.score || 0, weight: FACTOR_WEIGHTS.SQUAD }
    ];

    // Sort by absolute contribution
    const sortedFactors = [...factors].sort((a, b) =>
        Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)
    );

    // Top 3 key factors
    const keyFactors = sortedFactors.slice(0, 3).map(f => {
        const direction = f.score > 0 ? 'favours home' : f.score < 0 ? 'favours away' : 'neutral';
        return `${f.name}: ${direction} (${f.score > 0 ? '+' : ''}${f.score.toFixed(1)})`;
    });

    // Collect all warnings
    const warnings = [
        ...(form?.redFlags || []),
        ...(squad?.issues || [])
    ];

    // Determine overall direction
    const direction = totalContribution > 1 ? 'home_advantage' :
        totalContribution < -1 ? 'away_advantage' : 'balanced';

    return {
        totalAdjustment: parseFloat(totalContribution.toFixed(2)),
        direction,
        keyFactors,
        warnings,
        factorBreakdown: {
            form: { score: form?.score || 0, contribution: form?.contribution || 0, summary: form?.summary },
            league: { score: league?.score || 0, contribution: league?.contribution || 0, summary: league?.summary },
            h2h: { score: h2h?.score || 0, contribution: h2h?.contribution || 0, summary: h2h?.summary },
            situational: { score: situational?.score || 0, contribution: situational?.contribution || 0, summary: situational?.summary },
            squad: { score: squad?.score || 0, contribution: squad?.contribution || 0, summary: squad?.summary }
        }
    };
}

// ============================================
// PROBABILITY CALCULATION
// ============================================

/**
 * Calculate match probabilities based on adjusted expected goals (xG)
 * Uses statistical distribution to determine likelihood of outcomes
 * 
 * @param {number} homeXG - Home team expected goals
 * @param {number} awayXG - Away team expected goals
 * @param {number} adjustment - Total weighted adjustment
 * @returns {object} Match probabilities
 */
export function calculateOutcomeProbabilities(homeXG, awayXG, adjustment = 0) {
    // Adjust xG based on factor analysis
    const adjustedHomeXG = homeXG * (1 + adjustment * 0.02);
    const adjustedAwayXG = awayXG * (1 - adjustment * 0.02);

    // Statistical probability function (Distribution model)
    const getProbability = (lambda, k) => {
        return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
    };

    const factorial = (n) => {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    };

    // Calculate probabilities for each scoreline (0-0 to 5-5)
    let homeWin = 0, draw = 0, awayWin = 0;
    const scorelines = [];

    for (let h = 0; h <= 6; h++) {
        for (let a = 0; a <= 6; a++) {
            const prob = getProbability(adjustedHomeXG, h) * getProbability(adjustedAwayXG, a);
            scorelines.push({ home: h, away: a, prob });

            if (h > a) homeWin += prob;
            else if (h === a) draw += prob;
            else awayWin += prob;
        }
    }

    // Normalize to 100%
    const total = homeWin + draw + awayWin;
    homeWin /= total;
    draw /= total;
    awayWin /= total;

    // Most likely scoreline
    const mostLikely = scorelines.sort((a, b) => b.prob - a.prob)[0];

    return {
        homeWin: parseFloat(homeWin.toFixed(3)),
        draw: parseFloat(draw.toFixed(3)),
        awayWin: parseFloat(awayWin.toFixed(3)),
        mostLikelyScore: `${mostLikely.home}-${mostLikely.away}`,
        adjustedXG: {
            home: parseFloat(adjustedHomeXG.toFixed(2)),
            away: parseFloat(adjustedAwayXG.toFixed(2))
        }
    };
}

// ============================================
// CONFIDENCE CALCULATION
// ============================================

/**
 * Calculate prediction confidence based on data quality
 * 
 * @param {object} dataQuality - Data quality indicators
 * @returns {object} Confidence assessment
 */
export function calculateConfidenceScore(dataQuality = {}) {
    const {
        formDataComplete = false,
        leagueDataComplete = false,
        h2hDataAvailable = false,
        h2hMeetingsCount = 0,
        injuryDataAvailable = false,
        majorInjuries = 0,
        edgeStrength = 0 // EV percentage
    } = dataQuality;

    let confidence = 50; // Base confidence
    let factors = [];

    // Data completeness (up to +30%)
    if (formDataComplete) { confidence += 10; factors.push('Complete form data'); }
    if (leagueDataComplete) { confidence += 10; factors.push('Complete league stats'); }
    if (h2hDataAvailable && h2hMeetingsCount >= 5) { confidence += 5; factors.push('H2H data (5+ meetings)'); }
    if (injuryDataAvailable) { confidence += 5; factors.push('Injury data available'); }

    // Edge strength (up to +15%)
    if (edgeStrength >= 10) { confidence += 15; factors.push('Strong statistical edge (10%+ EV)'); }
    else if (edgeStrength >= 5) { confidence += 10; factors.push('Moderate edge (5-10% EV)'); }
    else if (edgeStrength >= 3) { confidence += 5; factors.push('Small edge (3-5% EV)'); }

    // Penalties
    if (majorInjuries >= 3) { confidence -= 15; factors.push('Warning: Multiple key injuries'); }
    else if (majorInjuries >= 1) { confidence -= 5; factors.push('Note: Key player(s) out'); }

    if (!formDataComplete) { confidence -= 10; factors.push('Warning: Incomplete form data'); }
    if (h2hMeetingsCount < 3) { confidence -= 5; factors.push('Note: Limited H2H history'); }

    // Cap at 95%
    confidence = Math.min(95, Math.max(30, confidence));

    // Tier classification
    let tier;
    if (confidence >= 80) tier = 'HIGH';
    else if (confidence >= 60) tier = 'MEDIUM';
    else if (confidence >= 50) tier = 'LOW';
    else tier = 'INSUFFICIENT';

    return {
        score: confidence,
        tier,
        factors,
        explanation: factors.slice(0, 5).join('. ')
    };
}

// ============================================
// MAIN PREDICTION FUNCTION
// ============================================

/**
 * Generate complete prediction using weighted model
 * 
 * @param {object} matchData - Aggregated match data
 * @returns {object} Complete prediction with factor breakdown
 */
export function generateWeightedPrediction(matchData) {
    const {
        homeForm,
        awayForm,
        homeStats,
        awayStats,
        h2h,
        situational,
        squadStatus,
        odds,
        leagueAvgGoals = 1.4
    } = matchData;

    // Calculate all factor scores
    const formScore = calculateFormScore(homeForm, awayForm);
    const leagueScore = calculateLeagueScore(
        {
            goalsPerMatch: parseFloat(homeForm?.avgGoalsScored) || 1.4,
            concededPerMatch: parseFloat(homeForm?.avgGoalsConceded) || 1.4,
            ...homeStats
        },
        {
            goalsPerMatch: parseFloat(awayForm?.avgGoalsScored) || 1.4,
            concededPerMatch: parseFloat(awayForm?.avgGoalsConceded) || 1.4,
            ...awayStats
        },
        leagueAvgGoals
    );
    const h2hScore = calculateH2HScore(h2h);
    const situationalScore = calculateSituationalScore(situational);
    const squadScore = calculateSquadScore(squadStatus);

    // Get total adjustment
    const totalAnalysis = calculateTotalAdjustment({
        form: formScore,
        league: leagueScore,
        h2h: h2hScore,
        situational: situationalScore,
        squad: squadScore
    });

    // Calculate outcome probabilities from factor-adjusted xG
    const baseHomeXG = leagueScore.home?.xG || 1.5;
    const baseAwayXG = leagueScore.away?.xG || 1.0;
    const probabilities = calculateOutcomeProbabilities(
        baseHomeXG,
        baseAwayXG,
        totalAnalysis.totalAdjustment
    );

    // Calculate EV for each outcome
    const calculateEV = (prob, decimalOdds) => ((prob * decimalOdds) - 1) * 100;

    const evHome = calculateEV(probabilities.homeWin, odds?.home || 2.0);
    const evDraw = calculateEV(probabilities.draw, odds?.draw || 3.5);
    const evAway = calculateEV(probabilities.awayWin, odds?.away || 3.0);

    // Find best bet
    const outcomes = [
        { outcome: 'home', ev: evHome, prob: probabilities.homeWin, odds: odds?.home || 2.0 },
        { outcome: 'draw', ev: evDraw, prob: probabilities.draw, odds: odds?.draw || 3.5 },
        { outcome: 'away', ev: evAway, prob: probabilities.awayWin, odds: odds?.away || 3.0 }
    ];
    const best = outcomes.reduce((a, b) => a.ev > b.ev ? a : b);

    // Calculate confidence
    const confidence = calculateConfidenceScore({
        formDataComplete: homeForm?.form && homeForm.form !== '?????',
        leagueDataComplete: leagueScore.home?.attackStrength > 0,
        h2hDataAvailable: h2hScore.dataAvailable,
        h2hMeetingsCount: h2h?.total || 0,
        injuryDataAvailable: squadStatus?.homeInjuries !== undefined,
        majorInjuries: (squadStatus?.homeInjuries?.length || 0) + (squadStatus?.awayInjuries?.length || 0),
        edgeStrength: best.ev
    });

    return {
        prediction: {
            home_win_prob: probabilities.homeWin,
            draw_prob: probabilities.draw,
            away_win_prob: probabilities.awayWin
        },
        recommended_bet: {
            outcome: best.outcome,
            probability: best.prob,
            odds: best.odds,
            ev_percentage: parseFloat(best.ev.toFixed(1)),
            confidence: confidence.tier
        },
        factor_breakdown: totalAnalysis.factorBreakdown,
        model_details: {
            total_adjustment: totalAnalysis.totalAdjustment,
            direction: totalAnalysis.direction,
            expected_score: probabilities.mostLikelyScore,
            adjusted_xg: probabilities.adjustedXG
        },
        confidence: {
            score: confidence.score,
            tier: confidence.tier,
            explanation: confidence.explanation
        },
        key_factors: totalAnalysis.keyFactors,
        warnings: totalAnalysis.warnings,
        ev_analysis: {
            home: parseFloat(evHome.toFixed(1)),
            draw: parseFloat(evDraw.toFixed(1)),
            away: parseFloat(evAway.toFixed(1))
        }
    };
}

export default {
    FACTOR_WEIGHTS,
    calculateFormScore,
    calculateLeagueScore,
    calculateH2HScore,
    calculateSituationalScore,
    calculateSquadScore,
    calculateTotalAdjustment,
    calculateOutcomeProbabilities,
    calculateConfidenceScore,
    generateWeightedPrediction
};
