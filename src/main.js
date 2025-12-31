/**
 * Sharpshooter EV Dashboard
 * Main Application Entry Point
 * Enhanced UX with Confidence Sections
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
import {
  renderHeader,
  renderConfidenceSection,
  renderLowSectionCollapsed,
  renderLoadingState,
  renderErrorState
} from './components.js';

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
  mode: 'live',

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
  state.progress = { current: 0, total: 0, message: 'Connecting to API-Football...' };
  render();

  try {
    console.log('🔗 Testing API-Football connection...');
    state.progress.message = 'Testing API connection...';
    render();

    const apiOk = await testConnection();
    if (!apiOk) {
      throw new Error('Failed to connect to API-Football. Check your API key.');
    }

    console.log('✅ API-Football connected!');
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
      throw new Error('No matches found. Try again later.');
    }

    state.allMatches = matches;
    state.totalAnalyzed = matches.length;
    state.lastUpdated = new Date();
    state.isLoading = false;

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

  // Refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshData);
  }

  // Retry button (in error state)
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      state.error = null;
      loadLiveData();
    });
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

function init() {
  console.log('🏆 BetPredict - AI-Powered Edge Finder Initializing...');
  console.log('🔧 Enhanced UX with Confidence Sections');

  // Start with live data by default
  loadLiveData();

  console.log('🚀 Dashboard Ready!');
}

// Start the application
document.addEventListener('DOMContentLoaded', init);

// Export for console debugging
window.sharpshooter = {
  state,
  loadMockData,
  loadLiveData,
  refreshData,
  toggleMode,
  setSectionLimit,
  setSectionLimit,
  toggleLowSection,
  toggleTheme
};
