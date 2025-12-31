/**
 * GitHub Gist Service
 * Reads and writes prediction data to a GitHub Gist for persistence
 */

const GIST_ID = import.meta.env.VITE_GIST_ID;
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const FILENAME = 'predictions.json';

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
        // Use raw URL for public read (faster, no auth needed)
        const rawUrl = `https://gist.githubusercontent.com/raw/${GIST_ID}/${FILENAME}?t=${Date.now()}`;

        const response = await fetch(rawUrl);

        if (!response.ok) {
            // Try the API endpoint as fallback
            const apiUrl = `https://api.github.com/gists/${GIST_ID}`;
            const apiResponse = await fetch(apiUrl);

            if (!apiResponse.ok) {
                throw new Error(`Gist read failed: ${apiResponse.status}`);
            }

            const gist = await apiResponse.json();
            const content = gist.files?.[FILENAME]?.content;

            if (!content) {
                console.log('📭 Gist is empty or file not found');
                return null;
            }

            return JSON.parse(content);
        }

        const data = await response.json();
        console.log('📥 Loaded predictions from Gist');
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
