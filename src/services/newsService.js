/**
 * News Scanner Service
 * Scans for breaking news, injuries, and squad updates
 */

import { getInjuries } from './apiFootballService.js';
import { extractWeather } from './sportmonksService.js';

// Keywords for news categorization
const KEYWORDS = {
    INJURY: ['injured', 'injury', 'hamstring', 'acl', 'knock', 'doubt', 'ruled out', 'surgery', 'scan'],
    RETURN: ['return', 'available', 'fit', 'training', 'squad'],
    SUSPENSION: ['suspended', 'ban', 'red card', 'yellow cards'],
    MANAGER: ['sacked', 'appointed', 'manager', 'coach', 'resigned'],
    TRANSFER: ['transfer', 'signed', 'departed', 'loan'],
    MOTIVATION: ['must win', 'derby', 'revenge', 'title', 'relegation', 'cup']
};

/**
 * Scan for news related to a match
 * @param {object} match - Match object with IDs
 * @returns {Promise<object[]>} - Array of news items
 */
export async function scanNews(match) {
    console.log(`📰 Scanning news for ${match.homeTeam} vs ${match.awayTeam}...`);

    const newsItems = [];
    const fixtureId = match.fixtureId;

    // 1. Get Official Injuries (API-Football)
    // Note: Only call getInjuries if we have a fixtureId (works with API-Football fixtures)
    if (fixtureId && match._source !== 'sportmonks') {
        try {
            const injuries = await getInjuries(fixtureId);
            if (injuries && injuries.length > 0) {
                injuries.forEach(injury => {
                    newsItems.push({
                        type: 'injury',
                        impact: assessInjuryImpact(injury.player.type, injury.player.reason),
                        summary: `${injury.player.name} (${injury.team.name}) - ${injury.player.reason}`,
                        teams_affected: [injury.team.name],
                        players_affected: [injury.player.name],
                        timestamp: Date.now(), // Assume current since it's active
                        source: 'Official Injury Report'
                    });
                });
            }
        } catch (error) {
            console.warn('Failed to fetch injuries:', error.message);
        }
    }

    // 2. Check for Weather (Sportmonks or generic)
    if (match.weather) {
        const weather = match.weather;
        // Check for extreme weather
        if (weather.temperature && (weather.temperature < 0 || weather.temperature > 35)) {
            newsItems.push({
                type: 'weather',
                impact: 'MEDIUM',
                summary: `Extreme temperature: ${weather.temperature}°C`,
                teams_affected: [match.homeTeam, match.awayTeam],
                timestamp: Date.now(),
                source: 'Weather Report'
            });
        }
        if (weather.clouds && weather.clouds.includes('Rain')) {
            newsItems.push({
                type: 'weather',
                impact: 'MEDIUM',
                summary: `Rain forecast: ${weather.clouds}`,
                teams_affected: [match.homeTeam, match.awayTeam],
                timestamp: Date.now(),
                source: 'Weather Report'
            });
        }
    }

    // 3. Simulated News (Placeholder for Search API)
    // In a real production environment, we would call a search API here
    // For now, we return specific hardcoded scenarios for demo/testing or empty
    // purely to demonstrate the architecture

    return newsItems;
}

/**
 * Assess impact of an injury
 * @param {string} type 
 * @param {string} reason 
 */
function assessInjuryImpact(type, reason) {
    const r = reason.toLowerCase();
    if (r.includes('acl') || r.includes('break') || r.includes('surgery')) return 'HIGH';
    if (r.includes('hamstring') || r.includes('doubt')) return 'MEDIUM';
    return 'LOW'; // knock, illness
}

/**
 * Assess general news impact
 */
export function assessNewsImpact(text) {
    const t = text.toLowerCase();
    if (t.includes('sacked') || t.includes('star') || t.includes('key')) return 'HIGH';
    if (t.includes('doubt') || t.includes('return')) return 'MEDIUM';
    return 'LOW';
}
