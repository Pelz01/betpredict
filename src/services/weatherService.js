/**
 * Weather Service
 * Fetches weather data for match venues
 */

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY; // Optional: OpenWeatherMap or similar

/**
 * Get weather for a specific venue and time
 * @param {string} venue 
 * @param {string} date 
 */
export async function getWeather(venue, date) {
    // If no API key or complex logic, return null or mock
    // In a real implementation, we would geocode the venue -> lat/long -> fetch forecast

    // For now, we rely on Sportmonks providing weather data in fixtures
    return null;
}

/**
 * Analyze weather impact on goals
 * @param {object} weather 
 */
export function analyzeWeatherImpact(weather) {
    if (!weather) return 'neutral';

    // Heavy rain/snow often leads to lower scoring
    // High heat leads to slower pace

    const conditions = weather.type || '';
    if (conditions.includes('Rain') || conditions.includes('Snow')) return 'low_scoring';
    if (weather.temperature > 30) return 'fatigue_risk';

    return 'neutral';
}
