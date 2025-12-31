/**
 * Sharpshooter EV Dashboard - Data Layer
 * Core calculations and mock data generation
 */

// ============================================
// CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate Expected Value percentage
 * EV% = (Model_Probability * Decimal_Odds) - 1
 */
export function calculateEV(probability, odds) {
    return ((probability * odds) - 1) * 100;
}

/**
 * Calculate Kelly Criterion stake percentage
 * Kelly% = (probability * odds - 1) / (odds - 1)
 */
export function calculateKelly(probability, odds) {
    if (odds <= 1) return 0;
    const kelly = ((probability * odds) - 1) / (odds - 1);
    return Math.max(0, kelly * 100); // Return as percentage, min 0
}

/**
 * Get confidence tier based on EV percentage (for display labels)
 */
export function getConfidenceTier(ev) {
    if (ev >= 10) return 'ELITE';
    if (ev >= 5) return 'STRONG';
    if (ev >= 3) return 'VALUE';
    return 'AVOID';
}

/**
 * Calculate confidence percentage from AI response or EV
 * Maps AI confidence (HIGH/MEDIUM/LOW) to percentage range
 * Falls back to EV-based calculation
 */
export function calculateConfidencePercent(match) {
    // If AI provided confidence, map it to percentage
    const aiConfidence = match.ai?.confidence;

    if (aiConfidence) {
        switch (aiConfidence.toUpperCase()) {
            case 'HIGH':
                return 80 + Math.random() * 15; // 80-95%
            case 'MEDIUM':
                return 60 + Math.random() * 19; // 60-79%
            case 'LOW':
                return 50 + Math.random() * 9;  // 50-59%
            default:
                break;
        }
    }

    // Fallback: Calculate from EV
    const ev = match.metrics?.ev || 0;
    if (ev >= 10) return 85 + Math.min(10, ev - 10); // 85-95% for high EV
    if (ev >= 5) return 65 + (ev - 5) * 3;           // 65-80% for medium EV
    if (ev >= 3) return 50 + (ev - 3) * 5;           // 50-60% for low EV
    return 40; // Below threshold
}

/**
 * Get confidence section based on percentage
 * HIGH: 80%+, MEDIUM: 60-79%, LOW: 50-59%
 */
export function getConfidenceSection(confidencePercent) {
    if (confidencePercent >= 80) return 'high';
    if (confidencePercent >= 60) return 'medium';
    if (confidencePercent >= 50) return 'low';
    return 'avoid';
}

/**
 * Group matches by confidence section
 * Returns { high: [], medium: [], low: [] }
 */
export function groupByConfidence(matches) {
    const groups = {
        high: [],
        medium: [],
        low: []
    };

    matches.forEach(match => {
        // Calculate and attach confidence percentage
        const confidencePercent = calculateConfidencePercent(match);
        const section = getConfidenceSection(confidencePercent);

        const enrichedMatch = {
            ...match,
            confidencePercent: parseFloat(confidencePercent.toFixed(1))
        };

        if (section === 'high') {
            groups.high.push(enrichedMatch);
        } else if (section === 'medium') {
            groups.medium.push(enrichedMatch);
        } else if (section === 'low') {
            groups.low.push(enrichedMatch);
        }
        // 'avoid' matches are not included
    });

    // Sort each group by EV (highest first)
    groups.high.sort((a, b) => b.metrics.ev - a.metrics.ev);
    groups.medium.sort((a, b) => b.metrics.ev - a.metrics.ev);
    groups.low.sort((a, b) => b.metrics.ev - a.metrics.ev);

    return groups;
}

/**
 * Get section statistics
 */
export function getSectionStats(matches) {
    if (matches.length === 0) {
        return { count: 0, avgEV: 0, avgConfidence: 0 };
    }

    const evValues = matches.map(m => m.metrics.ev);
    const confValues = matches.map(m => m.confidencePercent || 0);

    return {
        count: matches.length,
        avgEV: parseFloat((evValues.reduce((a, b) => a + b, 0) / evValues.length).toFixed(1)),
        avgConfidence: parseFloat((confValues.reduce((a, b) => a + b, 0) / confValues.length).toFixed(0))
    };
}

/**
 * Calculate fair odds from probability
 */
export function calculateFairOdds(probability) {
    return probability > 0 ? (1 / probability) : Infinity;
}

// ============================================
// MOCK DATA CONFIGURATION
// ============================================

const SOCCER_TEAMS = {
    EPL: [
        ['Arsenal', 'Liverpool'], ['Manchester City', 'Chelsea'],
        ['Manchester United', 'Tottenham'], ['Newcastle', 'Aston Villa'],
        ['Brighton', 'West Ham'], ['Brentford', 'Fulham']
    ],
    LaLiga: [
        ['Real Madrid', 'Barcelona'], ['Atletico Madrid', 'Sevilla'],
        ['Athletic Bilbao', 'Real Sociedad'], ['Villarreal', 'Valencia']
    ],
    SerieA: [
        ['Inter Milan', 'AC Milan'], ['Juventus', 'Napoli'],
        ['Roma', 'Lazio'], ['Atalanta', 'Fiorentina']
    ],
    Bundesliga: [
        ['Bayern Munich', 'Borussia Dortmund'], ['RB Leipzig', 'Bayer Leverkusen'],
        ['Eintracht Frankfurt', 'Wolfsburg']
    ]
};

const NBA_TEAMS = {
    Eastern: [
        ['Boston Celtics', 'Milwaukee Bucks'], ['Philadelphia 76ers', 'Miami Heat'],
        ['Cleveland Cavaliers', 'New York Knicks'], ['Brooklyn Nets', 'Atlanta Hawks'],
        ['Chicago Bulls', 'Toronto Raptors'], ['Indiana Pacers', 'Orlando Magic']
    ],
    Western: [
        ['Denver Nuggets', 'Phoenix Suns'], ['Los Angeles Lakers', 'Golden State Warriors'],
        ['LA Clippers', 'Memphis Grizzlies'], ['Sacramento Kings', 'Dallas Mavericks'],
        ['New Orleans Pelicans', 'Minnesota Timberwolves'], ['Oklahoma City Thunder', 'Houston Rockets']
    ]
};

const TENNIS_PLAYERS = {
    ATP: [
        ['Novak Djokovic', 'Carlos Alcaraz'], ['Jannik Sinner', 'Daniil Medvedev'],
        ['Alexander Zverev', 'Andrey Rublev'], ['Stefanos Tsitsipas', 'Holger Rune'],
        ['Taylor Fritz', 'Casper Ruud'], ['Hubert Hurkacz', 'Felix Auger-Aliassime'],
        ['Alex de Minaur', 'Tommy Paul'], ['Frances Tiafoe', 'Ben Shelton']
    ],
    GrandSlam: [
        ['Rafael Nadal', 'Dominic Thiem'], ['Nick Kyrgios', 'Gael Monfils']
    ]
};

// ============================================
// MOCK DATA GENERATOR
// ============================================

function generateRandomOdds(baseProbability) {
    // Add some market inefficiency (the edge we're looking for)
    const marketNoise = (Math.random() - 0.5) * 0.3; // ±15% variation
    const marketProb = Math.max(0.1, Math.min(0.9, baseProbability + marketNoise));

    // Convert to decimal odds with bookmaker margin (5-8%)
    const marginMultiplier = 1 - (0.05 + Math.random() * 0.03);
    return parseFloat((1 / (marketProb * marginMultiplier)).toFixed(2));
}

function generateMatchTime(hoursFromNow) {
    const now = new Date();
    now.setHours(now.getHours() + hoursFromNow);
    return now.toISOString();
}

function createSoccerMatch(id, league, teams) {
    // Generate "true" model probabilities
    const homeAdvantage = 0.05 + Math.random() * 0.1;
    const baseStrength = 0.3 + Math.random() * 0.25;

    const homeProb = Math.min(0.65, baseStrength + homeAdvantage);
    const drawProb = 0.2 + Math.random() * 0.15;
    const awayProb = Math.max(0.15, 1 - homeProb - drawProb);

    // Generate market odds (potentially inefficient)
    const homeOdds = generateRandomOdds(homeProb);
    const drawOdds = generateRandomOdds(drawProb);
    const awayOdds = generateRandomOdds(awayProb);

    // Calculate EV for each outcome and find the best
    const evHome = calculateEV(homeProb, homeOdds);
    const evDraw = calculateEV(drawProb, drawOdds);
    const evAway = calculateEV(awayProb, awayOdds);

    // Find best recommendation
    const evs = [
        { outcome: 'home', ev: evHome, prob: homeProb, odds: homeOdds },
        { outcome: 'draw', ev: evDraw, prob: drawProb, odds: drawOdds },
        { outcome: 'away', ev: evAway, prob: awayProb, odds: awayOdds }
    ];
    const best = evs.reduce((a, b) => a.ev > b.ev ? a : b);

    return {
        id: `soccer_${id}`,
        sport: 'soccer',
        league,
        teams: { home: teams[0], away: teams[1] },
        kickoff: generateMatchTime(2 + Math.random() * 72),
        odds: { home: homeOdds, draw: drawOdds, away: awayOdds },
        model: {
            home_prob: parseFloat(homeProb.toFixed(3)),
            draw_prob: parseFloat(drawProb.toFixed(3)),
            away_prob: parseFloat(awayProb.toFixed(3)),
            win_prob: parseFloat(best.prob.toFixed(3)),
            fair_odds: parseFloat(calculateFairOdds(best.prob).toFixed(2))
        },
        metrics: {
            ev: parseFloat(best.ev.toFixed(1)),
            kelly_stake: parseFloat(calculateKelly(best.prob, best.odds).toFixed(1)),
            confidence_tier: getConfidenceTier(best.ev)
        },
        recommendation: best.outcome
    };
}

function createNBAMatch(id, conference, teams) {
    // NBA typically has tighter markets
    const homeAdvantage = 0.03 + Math.random() * 0.07;
    const baseStrength = 0.35 + Math.random() * 0.2;

    const homeProb = Math.min(0.72, baseStrength + homeAdvantage);
    const awayProb = 1 - homeProb;

    const homeOdds = generateRandomOdds(homeProb);
    const awayOdds = generateRandomOdds(awayProb);

    const evHome = calculateEV(homeProb, homeOdds);
    const evAway = calculateEV(awayProb, awayOdds);

    const best = evHome > evAway
        ? { outcome: 'home', ev: evHome, prob: homeProb, odds: homeOdds }
        : { outcome: 'away', ev: evAway, prob: awayProb, odds: awayOdds };

    // Generate spread for context
    const spread = parseFloat((Math.random() * 14 - 7).toFixed(1));

    return {
        id: `nba_${id}`,
        sport: 'nba',
        league: `NBA ${conference}`,
        teams: { home: teams[0], away: teams[1] },
        kickoff: generateMatchTime(1 + Math.random() * 48),
        odds: { home: homeOdds, away: awayOdds },
        spread,
        model: {
            home_prob: parseFloat(homeProb.toFixed(3)),
            away_prob: parseFloat(awayProb.toFixed(3)),
            win_prob: parseFloat(best.prob.toFixed(3)),
            fair_odds: parseFloat(calculateFairOdds(best.prob).toFixed(2))
        },
        metrics: {
            ev: parseFloat(best.ev.toFixed(1)),
            kelly_stake: parseFloat(calculateKelly(best.prob, best.odds).toFixed(1)),
            confidence_tier: getConfidenceTier(best.ev)
        },
        recommendation: best.outcome
    };
}

function createTennisMatch(id, tournament, players) {
    // Tennis can have larger probability swings
    const player1Strength = 0.3 + Math.random() * 0.4;
    const player2Strength = 1 - player1Strength;

    const player1Odds = generateRandomOdds(player1Strength);
    const player2Odds = generateRandomOdds(player2Strength);

    const ev1 = calculateEV(player1Strength, player1Odds);
    const ev2 = calculateEV(player2Strength, player2Odds);

    const best = ev1 > ev2
        ? { outcome: 'home', ev: ev1, prob: player1Strength, odds: player1Odds }
        : { outcome: 'away', ev: ev2, prob: player2Strength, odds: player2Odds };

    return {
        id: `tennis_${id}`,
        sport: 'tennis',
        league: tournament,
        teams: { home: players[0], away: players[1] },
        kickoff: generateMatchTime(3 + Math.random() * 96),
        odds: { home: player1Odds, away: player2Odds },
        model: {
            home_prob: parseFloat(player1Strength.toFixed(3)),
            away_prob: parseFloat(player2Strength.toFixed(3)),
            win_prob: parseFloat(best.prob.toFixed(3)),
            fair_odds: parseFloat(calculateFairOdds(best.prob).toFixed(2))
        },
        metrics: {
            ev: parseFloat(best.ev.toFixed(1)),
            kelly_stake: parseFloat(calculateKelly(best.prob, best.odds).toFixed(1)),
            confidence_tier: getConfidenceTier(best.ev)
        },
        recommendation: best.outcome
    };
}

/**
 * Generate 40 mock matches across all sports
 */
export function generateMockData() {
    const matches = [];
    let idCounter = 1;

    // Generate Soccer matches (17 total)
    Object.entries(SOCCER_TEAMS).forEach(([league, teamPairs]) => {
        teamPairs.forEach(teams => {
            matches.push(createSoccerMatch(idCounter++, league, teams));
        });
    });

    // Generate NBA matches (12 total)
    Object.entries(NBA_TEAMS).forEach(([conference, teamPairs]) => {
        teamPairs.forEach(teams => {
            matches.push(createNBAMatch(idCounter++, conference, teams));
        });
    });

    // Generate Tennis matches (10 total)
    Object.entries(TENNIS_PLAYERS).forEach(([tournament, playerPairs]) => {
        playerPairs.forEach(players => {
            matches.push(createTennisMatch(idCounter++, tournament, players));
        });
    });

    // Add a few extra matches to reach 40
    const extraSoccer = [
        ['PSG', 'Monaco'],
        ['Ajax', 'PSV Eindhoven'],
        ['Porto', 'Benfica']
    ];
    extraSoccer.forEach(teams => {
        matches.push(createSoccerMatch(idCounter++, 'Champions League', teams));
    });

    return matches;
}

// ============================================
// FILTERING & SORTING
// ============================================

/**
 * Filter matches with positive EV (> 3%) and sort by highest EV
 */
export function filterAndSortMatches(matches, options = {}) {
    const {
        minEV = 3,
        sport = 'all',
        tier = 'all'
    } = options;

    return matches
        .filter(match => {
            // EV threshold filter
            if (match.metrics.ev < minEV) return false;

            // Sport filter
            if (sport !== 'all' && match.sport !== sport) return false;

            // Tier filter
            if (tier !== 'all' && match.metrics.confidence_tier !== tier) return false;

            return true;
        })
        .sort((a, b) => b.metrics.ev - a.metrics.ev); // Highest EV first
}

/**
 * Get summary statistics for filtered matches
 */
export function getMatchStats(matches) {
    if (matches.length === 0) {
        return {
            total: 0,
            avgEV: 0,
            bestEV: 0,
            totalKelly: 0,
            bySport: { soccer: 0, nba: 0, tennis: 0 },
            byTier: { ELITE: 0, STRONG: 0, VALUE: 0 }
        };
    }

    const evValues = matches.map(m => m.metrics.ev);
    const kellyValues = matches.map(m => m.metrics.kelly_stake);

    return {
        total: matches.length,
        avgEV: parseFloat((evValues.reduce((a, b) => a + b, 0) / evValues.length).toFixed(1)),
        bestEV: Math.max(...evValues),
        totalKelly: parseFloat(kellyValues.reduce((a, b) => a + b, 0).toFixed(1)),
        bySport: {
            soccer: matches.filter(m => m.sport === 'soccer').length,
            nba: matches.filter(m => m.sport === 'nba').length,
            tennis: matches.filter(m => m.sport === 'tennis').length
        },
        byTier: {
            ELITE: matches.filter(m => m.metrics.confidence_tier === 'ELITE').length,
            STRONG: matches.filter(m => m.metrics.confidence_tier === 'STRONG').length,
            VALUE: matches.filter(m => m.metrics.confidence_tier === 'VALUE').length
        }
    };
}
