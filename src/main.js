/**
 * Oracle Pro - Autonomous Agent Dashboard
 * Main Application Entry Point
 */

import './styles.css';
import { fetchLiveMatches, testConnection } from './services/dataAggregator.js';
import { clearCache as clearApiCache } from './services/apiFootballService.js';
import { clearPredictionCache, analyzeMatch } from './services/oracleService.js';
import { readFromGist, writeToGist, isGistConfigured } from './services/gistService.js';
import {
  renderHeader,
  renderConfidenceSection,
  renderLowSectionCollapsed,
  renderLoadingState,
  renderErrorState,
  renderFooter
} from './components.js';

// ============================================
// ADMIN CONFIG
// ============================================

const ADMIN_PASSKEY = import.meta.env.VITE_ADMIN_PASSKEY || 'oracle2026';
const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('admin') === ADMIN_PASSKEY;

if (isAdmin) console.log('🔐 Admin Access Granted');

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
  // New Structure: Arrays of Bets (not Matches)
  groupedBets: { high: [], medium: [], low: [] },
  stats: {},

  // UI Config
  sectionLimits: { high: 10, medium: 15, low: 5 },
  lowSectionExpanded: false,

  // Status
  isLoading: false,
  error: null,
  mode: 'cached', // 'cached' or 'live' (processing)
  isAdmin: isAdmin,
  lastUpdated: null,

  // Progress for Live Analysis
  progress: { current: 0, total: 0, message: '' }
};

// ============================================
// CORE LOGIC - DATA PROCESSING
// ============================================

/**
 * Convert raw AI Analysis into Ranked Bets Logic 
 * (Replicates scripts/refresh-predictions.js logic for Browser)
 */
function processAnalysisResults(rawPredictions) {
  const allBets = [];

  rawPredictions.forEach(item => {
    const bets = item.analysis.recommended_bets || [];

    bets.forEach(bet => {
      // Filter: EV > 5% and Confidence > 60 (Medium)
      if (bet.ev >= 5 && (bet.confidence >= 60 || bet.tier !== 'LOW')) {
        allBets.push({
          match_id: item.meta.match_id,
          match_display: `${item.meta.home_team} vs ${item.meta.away_team}`,
          league: item.meta.league,
          kickoff: item.meta.kickoff,
          market: bet.market,
          pick: bet.pick,
          odds: bet.odds,
          ev: bet.ev,
          confidence: bet.confidence,
          tier: bet.tier,
          stake: bet.stake,
          reason: bet.simple_reason,
          risk_factors: item.analysis.news_impact?.has_breaking_news ? ['Breaking News Impact'] : []
        });
      }
    });
  });

  // Sort by EV
  allBets.sort((a, b) => b.ev - a.ev);

  return {
    high: allBets.filter(b => b.confidence >= 80 || b.tier === 'HIGH' || b.tier === 'ELITE'),
    medium: allBets.filter(b => (b.confidence >= 60 && b.confidence < 80) || b.tier === 'STRONG' || b.tier === 'MEDIUM'),
    low: allBets.filter(b => b.confidence < 60 || b.tier === 'LOW'),
    all: allBets
  };
}

// ============================================
// RENDER LOOP
// ============================================

function render() {
  const app = document.getElementById('app');

  if (state.isLoading) {
    app.innerHTML = `
      ${renderHeader(state)}
      ${renderLoadingState(state.progress)}
      ${renderFooter()}
    `;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      ${renderHeader(state)}
      ${renderErrorState(state.error)}
      ${renderFooter()}
    `;
    attachEventListeners();
    return;
  }

  // Slice for Display Limits
  const highDisplay = state.groupedBets?.high?.slice(0, state.sectionLimits.high) || [];
  const mediumDisplay = state.groupedBets?.medium?.slice(0, state.sectionLimits.medium) || [];
  const lowDisplay = state.groupedBets?.low?.slice(0, state.sectionLimits.low) || [];

  app.innerHTML = `
    ${renderHeader(state)}
    
    ${renderConfidenceSection({
    type: 'high',
    icon: '🔥',
    title: 'HIGH CONFIDENCE',
    subtitle: '80%+ Tier',
    matches: highDisplay,
    totalAvailable: state.groupedBets?.high?.length || 0,
    currentLimit: state.sectionLimits.high
  })}
    
    ${renderConfidenceSection({
    type: 'medium',
    icon: '💎',
    title: 'MEDIUM CONFIDENCE',
    subtitle: '60-79% Tier',
    matches: mediumDisplay,
    totalAvailable: state.groupedBets?.medium?.length || 0,
    currentLimit: state.sectionLimits.medium
  })}
    
    ${state.lowSectionExpanded
      ? renderConfidenceSection({
        type: 'low',
        icon: '⚠️',
        title: 'LOW CONFIDENCE',
        subtitle: 'High Risk / Variance',
        matches: lowDisplay,
        totalAvailable: state.groupedBets?.low?.length || 0,
        currentLimit: state.sectionLimits.low,
        isLow: true
      })
      : renderLowSectionCollapsed(state.groupedBets?.low?.length || 0)
    }

    ${renderFooter()}
  `;

  attachEventListeners();
}

// ============================================
// DATA LOADING
// ============================================

async function init() {
  console.log('🏆 Oracle Pro Initializing...');

  // 1. Try Gist Load (Standard for Users)
  if (isGistConfigured()) {
    state.isLoading = true;
    state.progress.message = 'Syncing with Oracle Brain...';
    render();

    try {
      const data = await readFromGist();
      if (data && data.predictions) {
        state.groupedBets = data.predictions;
        state.stats = data.stats;
        state.lastUpdated = new Date(data.lastUpdated);
        state.mode = 'cached';
        console.log('✅ Loaded data from Gist');
      } else {
        throw new Error('No valid predictions found.');
      }
    } catch (e) {
      console.warn('Gist load failed:', e);
      if (!isAdmin) state.error = "Waiting for Oracle Pro to publish new predictions.";
    }
  }

  state.isLoading = false;
  render();

  // If Admin and empty, auto-trigger live load? No, wait for button.
}

async function runLiveAnalysis() {
  if (!state.isAdmin) return;

  state.mode = 'live';
  state.isLoading = true;
  state.error = null;
  state.progress = { current: 0, total: 10, message: 'Initialize...' };
  render();

  try {
    // 1. Fetch
    state.progress.message = 'Scanning Global Fixtures...';
    render();
    const rawMatches = await fetchLiveMatches({ maxMatches: 15 });

    // 2. Filter & Analyze
    const validMatches = rawMatches.filter(m => m.data_quality >= 60);
    const analyzed = [];

    state.progress.total = validMatches.length;

    for (let i = 0; i < validMatches.length; i++) {
      state.progress.current = i + 1;
      state.progress.message = `Analyzing: ${validMatches[i].home_team} vs ${validMatches[i].away_team}`;
      render(); // Force UI update

      // Rate limit helper
      if (i > 0) await new Promise(r => setTimeout(r, 800));

      try {
        const analysis = await analyzeMatch(validMatches[i]);
        if (analysis && analysis.recommended_bets) {
          analyzed.push({ meta: validMatches[i], analysis });
        }
      } catch (e) {
        console.error('Analysis failed for match', e);
      }
    }

    // 3. Process
    const processed = processAnalysisResults(analyzed);
    state.groupedBets = processed;
    state.lastUpdated = new Date();

    // 4. Save
    await writeToGist({
      lastUpdated: state.lastUpdated.toISOString(),
      stats: {
        matches_analyzed: analyzed.length,
        high_confidence: processed.high.length
      },
      predictions: processed
    });

    state.isLoading = false;
    render();

  } catch (error) {
    state.error = error.message;
    state.isLoading = false;
    render();
  }
}

// ============================================
// EVENT HANDLERS
// ============================================

function attachEventListeners() {
  // Theme
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    render();
  });

  // Admin Refresh
  document.getElementById('refresh-btn')?.addEventListener('click', runLiveAnalysis);

  // Retry
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    state.error = null;
    init();
  });

  // Section Toggles
  document.querySelectorAll('.toggle-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sectionLimits[btn.dataset.section] = btn.dataset.limit === 'all' ? 50 : parseInt(btn.dataset.limit);
      render();
    });
  });

  // Low Section
  document.getElementById('low-section-toggle')?.addEventListener('click', () => {
    state.lowSectionExpanded = true;
    render();
  });
  document.getElementById('hide-low-section')?.addEventListener('click', () => {
    state.lowSectionExpanded = false;
    render();
  });
}

// Start
document.addEventListener('DOMContentLoaded', init);
