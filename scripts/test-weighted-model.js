
import { generateWeightedPrediction } from '../src/services/predictionModelService.js';

// Mock Match Data
const mockMatch = {
    homeForm: {
        form: 'WWDLW',
        fullForm: 'WWDLWLLWWD',
        avgGoalsScored: 2.1,
        avgGoalsConceded: 0.8,
        restDays: 5
    },
    awayForm: {
        form: 'DLLLW',
        fullForm: 'DLLLWDDLWL',
        avgGoalsScored: 0.9,
        avgGoalsConceded: 1.5,
        restDays: 3
    },
    homeStats: {
        goalsPerMatch: 2.1,
        concededPerMatch: 0.8,
        position: 3,
        pointsPerGame: 2.1
    },
    awayStats: {
        goalsPerMatch: 0.9,
        concededPerMatch: 1.5,
        position: 14,
        pointsPerGame: 0.8
    },
    h2h: {
        total: 6,
        homeWins: 3,
        draws: 2,
        awayWins: 1
    },
    situational: {
        homeRestDays: 5,
        awayRestDays: 3,
        homeMotivation: 'title_chase',
        awayMotivation: 'normal',
        venue: 'Emirates Stadium'
    },
    squadStatus: {
        homeInjuries: [{ player: 'Star Striker', importance: 'star' }],
        awayInjuries: []
    },
    odds: {
        home: 1.65,
        draw: 3.80,
        away: 5.50
    },
    leagueAvgGoals: 1.45
};

console.log('🧪 Testing Weighted Prediction Model...');
console.log('------------------------------------------------');

try {
    const result = generateWeightedPrediction(mockMatch);

    console.log('✅ Prediction Generated Successfully');
    console.log('------------------------------------------------');
    console.log('📊 Prediction:', result.prediction);
    console.log('💰 Recommendation:', result.recommended_bet);
    console.log('🔍 Breakdown Keys:', Object.keys(result.factor_breakdown));
    console.log('------------------------------------------------');
    console.log('📝 Sample Factor (Form):', result.factor_breakdown.form);
    console.log('------------------------------------------------');
    console.log('Full Output Structure Valid:',
        !!result.factor_breakdown &&
        !!result.confidence &&
        !!result.key_factors
    );

} catch (error) {
    console.error('❌ Test Failed:', error);
}
