/**
 * BetPredict - AI-Powered Edge Finder
 * Main Application Entry Point
 */

import './styles.css';
import {
  generateMockData,
  filterAndSortMatches,
  getMatchStats,
  groupByConfidence,
  getSectionStats
} from './data.js';
import { fetchLiveMatches, testConnection } from './services/dataAggregator.js';
import { clearCache as clearApiCache } from './services/apiFootballService.js';
import { clearPredictionCache } from './services/oracleService.js';
import { readFromGist, writeToGist, isGistConfigured } from './services/gistService.js';
import {
  renderHeader,
  renderConfidenceSection,
  renderLowSectionCollapsed,
  renderLoadingState,
  renderErrorState,
  renderCountdownBanner
} from './components.js';

// ============================================
// ADMIN PASSKEY CHECK
// ============================================

const ADMIN_PASSKEY = import.meta.env.VITE_ADMIN_PASSKEY || 'betpredict2024';
const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('admin') === ADMIN_PASSKEY;

if (isAdmin) {
  console.log('🔐 Admin mode activated');
}

// ============================================
// APPLICATION STATE
// ============================================

const state = {
  // Match data
  allMatches: [],
  groupedMatches: { high: [], medium: [], low: [] },

  // Section limits (default values per UX spec)
  sectionLimits: {
    high: 10,
    medium: 15,
    low: 5
  },

  // UI state
  lowSectionExpanded: false,
  isLoading: false,
  error: null,
  mode: 'cached', // 'cached', 'live', 'mock'
  isAdmin: isAdmin,

  // Metadata
  lastUpdated: null,
  totalAnalyzed: 0,

  // Progress tracking
  progress: { current: 0, total: 0, message: '' }
};

// ============================================
// RENDER FUNCTIONS
// ============================================

function render() {
  const app = document.getElementById('app');

  if (state.isLoading) {
    app.innerHTML = `
      ${renderHeader(state)}
      ${renderLoadingState(state.progress)}
    `;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      ${renderHeader(state)}
      ${renderErrorState(state.error)}
    `;
    attachEventListeners();
    return;
  }

  // Calculate stats for each section
  const highStats = getSectionStats(state.groupedMatches.high);
  const mediumStats = getSectionStats(state.groupedMatches.medium);
  const lowStats = getSectionStats(state.groupedMatches.low);

  // Get matches limited by current section limits
  const highMatches = state.groupedMatches.high.slice(0, state.sectionLimits.high);
  const mediumMatches = state.groupedMatches.medium.slice(0, state.sectionLimits.medium);
  const lowMatches = state.groupedMatches.low.slice(0, state.sectionLimits.low);

  app.innerHTML = `
    ${renderHeader(state)}
    ${renderCountdownBanner()}
    
    ${renderConfidenceSection({
    type: 'high',
    icon: '🔥',
    title: 'HIGH CONFIDENCE',
    subtitle: '80%+ Confidence',
    matches: highMatches,
    totalAvailable: state.groupedMatches.high.length,
    currentLimit: state.sectionLimits.high,
    stats: highStats
  })}
    
    ${renderConfidenceSection({
    type: 'medium',
    icon: '💎',
    title: 'MEDIUM CONFIDENCE',
    subtitle: '60-79% Confidence',
    matches: mediumMatches,
    totalAvailable: state.groupedMatches.medium.length,
    currentLimit: state.sectionLimits.medium,
    stats: mediumStats
  })}
    
    ${state.lowSectionExpanded
      ? renderConfidenceSection({
        type: 'low',
        icon: '⚠️',
        title: 'LOW CONFIDENCE',
        subtitle: '50-59% Confidence',
        matches: lowMatches,
        totalAvailable: state.groupedMatches.low.length,
        currentLimit: state.sectionLimits.low,
        stats: lowStats,
        isLow: true
      })
      : renderLowSectionCollapsed(state.groupedMatches.low.length)
    }

    <footer style="text-align: center; padding: 2rem; color: var(--text-tertiary); font-size: 0.85rem; font-family: var(--font-body);">
      Built with love <span style="color: #22c55e;">💚</span> by Pelz
    </footer>
  `;

  attachEventListeners();
}

function updateState() {
  // Group matches by confidence
  const filtered = filterAndSortMatches(state.allMatches, { minEV: 3 });
  state.groupedMatches = groupByConfidence(filtered);
  render();
}

// ============================================
// DATA FETCHING
// ============================================

async function loadMockData() {
  state.mode = 'mock';
  state.isLoading = true;
  state.error = null;
  render();

  await new Promise(resolve => setTimeout(resolve, 500));

  state.allMatches = generateMockData();
  state.totalAnalyzed = state.allMatches.length;
  state.lastUpdated = new Date();
  state.isLoading = false;

  updateState();

  console.log(`📊 Loaded ${state.allMatches.length} mock matches`);
}

async function loadLiveData() {
  state.mode = 'live';
  state.isLoading = true;
  state.error = null;
  state.progress = { current: 0, total: 0, message: 'Connecting to data sources...' };
  render();

  try {
    console.log('📡 Fetching matches from available sources...');
    state.progress.message = 'Fetching upcoming fixtures...';
    render();

    const matches = await fetchLiveMatches(
      { maxMatches: 15, useAI: true },
      (current, total, message) => {
        state.progress = { current, total, message: message || 'Processing...' };
        render();
      }
    );

    if (matches.length === 0) {
      throw new Error('No matches found from any source. Try again later.');
    }

    state.allMatches = matches;
    state.totalAnalyzed = matches.length;
    state.lastUpdated = new Date();
    state.isLoading = false;
    state.mode = 'live';

    updateState();

    console.log(`📊 Loaded ${matches.length} live matches`);

  } catch (error) {
    console.error('Failed to load live data:', error);
    state.error = error.message;
    state.isLoading = false;
    render();
  }
}

function refreshData() {
  clearApiCache();
  clearPredictionCache();

  if (state.mode === 'live') {
    loadLiveData();
  } else {
    loadMockData();
  }
}

function toggleMode() {
  if (state.mode === 'mock') {
    loadLiveData();
  } else {
    loadMockData();
  }
}

// ============================================
// SECTION LIMIT HANDLERS
// ============================================

function setSectionLimit(section, limit) {
  state.sectionLimits[section] = limit;
  render();
}

function toggleLowSection() {
  state.lowSectionExpanded = !state.lowSectionExpanded;
  render();
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  // Re-render header to update the icon
  render();
}

// ============================================
// EVENT LISTENERS
// ============================================

// ============================================
// EVENT LISTENERS
// ============================================

function attachEventListeners() {
  // Theme toggle button
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Mode toggle button
  const modeToggle = document.getElementById('mode-toggle');
  if (modeToggle) {
    modeToggle.addEventListener('click', toggleMode);
  }

  // Refresh button (admin only)
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    if (state.isAdmin) {
      refreshBtn.addEventListener('click', adminRefresh);
    } else {
      // Hide refresh button for non-admins
      refreshBtn.style.display = 'none';
    }
  }

  // Retry button (in error state) - admin only
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      state.error = null;
      if (state.isAdmin) {
        adminRefresh();
      } else {
        init(); // Try to load from cache again
      }
    });
  }

  // Countdown Timer (if present in error/waiting state OR banner)
  const countdownEl = document.getElementById('countdown-timer');
  const bannerCountdownEl = document.getElementById('countdown-banner-timer');

  if (countdownEl || bannerCountdownEl) {
    // Clear any existing interval
    if (window.countdownInterval) clearInterval(window.countdownInterval);

    // Start new interval
    window.countdownInterval = setInterval(() => {
      const now = new Date();
      const utcPlus1 = new Date(now.getTime() + (1 * 60 * 60 * 1000));
      const hours = utcPlus1.getUTCHours();
      let nextRefresh;

      if (hours < 9) {
        nextRefresh = new Date(utcPlus1);
        nextRefresh.setUTCHours(9, 0, 0, 0);
      } else if (hours < 15) {
        nextRefresh = new Date(utcPlus1);
        nextRefresh.setUTCHours(15, 0, 0, 0);
      } else {
        nextRefresh = new Date(utcPlus1);
        nextRefresh.setDate(nextRefresh.getDate() + 1);
        nextRefresh.setUTCHours(9, 0, 0, 0);
      }

      let diff = nextRefresh - utcPlus1;
      if (diff < 0) diff = 0;

      const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
      const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secondsLeft = Math.floor((diff % (1000 * 60)) / 1000);

      if (countdownEl) {
        countdownEl.textContent = `${hoursLeft}h ${minutesLeft}m ${secondsLeft}s`;
      }

      if (bannerCountdownEl) {
        bannerCountdownEl.textContent = `${hoursLeft}h ${minutesLeft}m`;
      }
    }, 1000);
  }

  // Use mock data button (in error state)
  const useMockBtn = document.getElementById('use-mock-btn');
  if (useMockBtn) {
    useMockBtn.addEventListener('click', loadMockData);
  }

  // Toggle buttons for each section
  document.querySelectorAll('.toggle-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      const limit = btn.dataset.limit === 'all' ? 30 : parseInt(btn.dataset.limit);
      setSectionLimit(section, limit);
    });
  });

  // LOW section expand/collapse
  const lowToggle = document.getElementById('low-section-toggle');
  if (lowToggle) {
    lowToggle.addEventListener('click', toggleLowSection);
  }

  // Hide LOW section button
  const hideLowBtn = document.getElementById('hide-low-section');
  if (hideLowBtn) {
    hideLowBtn.addEventListener('click', toggleLowSection);
  }
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  console.log('🏆 BetPredict - AI-Powered Edge Finder');
  console.log(`🔐 Admin mode: ${state.isAdmin ? 'YES' : 'NO'}`);

  // Step 1: Try to load cached predictions from Gist
  if (isGistConfigured()) {
    state.isLoading = true;
    state.progress = { current: 0, total: 0, message: 'Loading cached predictions...' };
    render();

    const cached = await readFromGist();

    if (cached && cached.predictions && cached.predictions.length > 0) {
      console.log(`📦 Loaded ${cached.predictions.length} cached predictions`);
      state.allMatches = cached.predictions;
      state.lastUpdated = cached.lastUpdated ? new Date(cached.lastUpdated) : null;
      state.totalAnalyzed = cached.predictions.length;
      state.mode = 'cached';
      state.isLoading = false;
      updateState();
      return;
    } else {
      console.log('📭 No cached predictions found');
    }
  }

  // Step 2: If admin and no cache, load live data
  if (state.isAdmin) {
    loadLiveData();
  } else {
    // Non-admin with no cache: show empty state
    state.isLoading = false;
    state.error = 'No predictions available yet. An admin needs to refresh the data.';
    render();
  }
}

/**
 * Admin-only: Refresh and save to Gist
 */
async function adminRefresh() {
  if (!state.isAdmin) {
    console.warn('⛔ Refresh blocked: Admin access required');
    return;
  }

  await loadLiveData();

  // Save to Gist after successful load
  if (state.allMatches.length > 0 && isGistConfigured()) {
    const saved = await writeToGist(state.allMatches);
    if (saved) {
      console.log('✅ Predictions saved to Gist for all users');
    }
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);

// Export for console debugging
window.betpredict = {
  state,
  loadMockData,
  loadLiveData,
  adminRefresh,
  refreshData,
  toggleMode,
  setSectionLimit,
  toggleLowSection,
  toggleTheme
};
