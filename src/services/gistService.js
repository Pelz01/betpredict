/**
 * GitHub Gist Service
 * Reads and writes prediction data to a GitHub Gist for persistence
 */

const GIST_ID = import.meta.env.VITE_GIST_ID;
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const FILENAME = 'oracle_predictions.json'; // Must match refresh-predictions.js

/**
 * Read predictions from Gist
 * This is a public read—no auth needed
 */
export async function readFromGist() {
    if (!GIST_ID) {
        console.warn('⚠️ No GIST_ID configured, cannot read from Gist');
        return null;
    }

    try {
        // Use the GitHub API endpoint (more reliable than raw URL)
        const apiUrl = `https://api.github.com/gists/${GIST_ID}`;
        console.log('📡 Fetching predictions from Gist...');

        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            },
            cache: 'no-store' // Bypass cache to get fresh data
        });

        if (!response.ok) {
            throw new Error(`Gist API error: ${response.status}`);
        }

        const gist = await response.json();
        const content = gist.files?.[FILENAME]?.content;

        if (!content) {
            console.log('📭 Gist is empty or file not found');
            return null;
        }

        const data = JSON.parse(content);
        console.log('📥 Loaded predictions from Gist:', data.predictions?.length || 0, 'predictions');
        return data;

    } catch (error) {
        console.error('❌ Failed to read from Gist:', error);
        return null;
    }
}

/**
 * Write predictions to Gist
 * Requires GitHub token (admin only)
 */
export async function writeToGist(predictions) {
    if (!GIST_ID || !GITHUB_TOKEN) {
        console.error('❌ Cannot write to Gist: Missing GIST_ID or GITHUB_TOKEN');
        return false;
    }

    const payload = {
        lastUpdated: new Date().toISOString(),
        predictions: predictions
    };

    try {
        const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                files: {
                    [FILENAME]: {
                        content: JSON.stringify(payload, null, 2)
                    }
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        console.log('📤 Saved predictions to Gist');
        return true;

    } catch (error) {
        console.error('❌ Failed to write to Gist:', error);
        return false;
    }
}

/**
 * Check if Gist is configured
 */
export function isGistConfigured() {
    return Boolean(GIST_ID);
}

/**
 * Check if we can write (admin mode)
 */
export function canWriteToGist() {
    return Boolean(GIST_ID && GITHUB_TOKEN);
}
