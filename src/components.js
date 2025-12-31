/**
 * Sharpshooter EV Dashboard - UI Components
 * Premium Redesign (Dual Theme)
 */

// ============================================
// ICONS & CONSTANTS
// ============================================

const SPORT_ICONS = {
  soccer: '⚽',
  nba: '🏀',
  tennis: '🎾'
};

const TOGGLE_OPTIONS = [5, 10, 15, 20, 'all'];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = date - now;

  if (diff < 0) return 'LIVE';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours < 1) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTimestamp(date) {
  if (!date) return 'Never';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// ============================================
// HEADER COMPONENT
// ============================================

export function renderHeader(state) {
  const isCached = state.mode === 'cached';
  const isLive = state.mode === 'live';
  const timestamp = formatTimestamp(state.lastUpdated);
  const totalMatches = state.totalAnalyzed || 0;
  const positiveEV = (state.groupedMatches?.high?.length || 0) +
    (state.groupedMatches?.medium?.length || 0) +
    (state.groupedMatches?.low?.length || 0);

  // Get current theme from DOM
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const isDark = currentTheme === 'dark';

  // Mode label
  let modeLabel = 'Cached';
  let modeClass = 'mode-cached';
  if (isLive) {
    modeLabel = 'Live';
    modeClass = 'mode-live';
  } else if (state.mode === 'mock') {
    modeLabel = 'Mock';
    modeClass = 'mode-mock';
  }

  return `
    <header class="header">
      <div class="logo">
        <div class="logo-icon">🏆</div>
        <div>
          <div class="logo-text">BETPREDICT</div>
          <div class="logo-tagline">AI-Powered Edge Finder</div>
        </div>
      </div>
      
      <div class="header-actions">
        ${state.isAdmin ? `<span style="background: var(--status-high); color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">🔐 ADMIN</span>` : ''}
        
        <!-- Theme Toggle -->
        <button class="btn-icon" id="theme-toggle" title="Toggle Theme">
          ${isDark ? '☀️' : '🌙'}
        </button>

        <!-- Mode Indicator -->
        <span class="mode-toggle-btn ${modeClass}" style="cursor: default;">
          <span class="indicator"></span>
          <span>${modeLabel}</span>
        </span>

        <!-- Refresh Button (shown for all, hidden via JS for non-admin) -->
        <button class="btn-icon" id="refresh-btn" title="Admin: Refresh predictions">
          🔄
        </button>
      </div>

      ${state.lastUpdated ? `
        <div class="header-meta">
          <span class="meta-item">Last updated: <strong>${timestamp}</strong></span>
          <span class="meta-divider">|</span>
          <span class="meta-item">Matches: <strong>${totalMatches}</strong></span>
          <span class="meta-divider">|</span>
          <span class="meta-item highlight">+EV Found: ${positiveEV}</span>
        </div>
      ` : ''}
    </header>
  `;
}

// ============================================
// TOGGLE BUTTONS COMPONENT
// ============================================

function renderToggleButtons(section, currentLimit, totalAvailable) {
  const maxVisible = Math.min(30, totalAvailable);
  const allLabel = totalAvailable > 30 ? '30+' : `All`;

  return `
    <div class="toggle-group">
      ${TOGGLE_OPTIONS.map(opt => {
    const value = opt === 'all' ? maxVisible : opt;
    const label = opt === 'all' ? allLabel : opt;
    // Determine active state strictly
    let isActive = false;
    if (opt === 'all') {
      isActive = currentLimit >= maxVisible; // If limit is high enough to show all
    } else {
      isActive = currentLimit === opt;
    }

    const isDisabled = typeof opt === 'number' && opt > totalAvailable && opt !== 5; // Always keep 5 enable roughly? or strict
    // Correction: Disable if the specific option step is unreachable? 
    // Actually, simpler: Disable if option > totalAvailable (unless it's the lowest option that covers everything?)
    const disabledClass = (typeof opt === 'number' && opt > totalAvailable) ? 'disabled' : '';

    return `
          <button 
            class="toggle-pill ${isActive ? 'active' : ''} ${disabledClass}"
            data-section="${section}"
            data-limit="${opt}"
            ${disabledClass ? 'disabled' : ''}
          >
            ${label}
          </button>
        `;
  }).join('')}
    </div>
  `;
}

// ============================================
// CONFIDENCE SECTION COMPONENT
// ============================================

export function renderConfidenceSection(options) {
  const {
    type,
    icon,
    title,
    subtitle,
    matches,
    totalAvailable,
    currentLimit,
    stats,
    isLow = false
  } = options;

  const showing = matches.length;

  return `
    <section class="confidence-section ${type}" id="section-${type}">
      <div class="section-header">
        <div class="section-title">
          <h2>${icon} ${title}</h2>
          <span class="section-subtitle">${subtitle}</span>
        </div>
        
        ${renderToggleButtons(type, currentLimit, totalAvailable)}
      </div>
      
       ${isLow ? `
        <div class="low-warning-banner">
          <span>⚠️</span>
          <div>
            <strong>High Risk Area</strong><br/>
            These picks have 50-59% confidence. Edge exists but variance is high. Use strict bankroll management.
          </div>
          <button class="hide-section-btn" id="hide-low-section" style="margin-left:auto; background:none; border:none; text-decoration:underline; cursor:pointer;">
            Hide
          </button>
        </div>
      ` : ''}

      <div class="match-grid">
        ${matches.map(match => renderMatchCard(match)).join('')}
      </div>
      
      <div style="margin-top: var(--space-lg); text-align: center; color: var(--text-tertiary); font-size: 0.875rem;">
        Showing ${showing} of ${totalAvailable} available picks • sorted by EV
      </div>
    </section>
  `;
}

// ============================================
// LOW SECTION COLLAPSED COMPONENT
// ============================================

export function renderLowSectionCollapsed(count) {
  // Re-using the confidence-section class but with 'collapsed' styling inline or via class
  // We didn't define specific .collapsed styles in the new CSS, so we'll use a simple container
  // that uses the glass style.
  if (count === 0) return '';

  return `
    <section class="confidence-section low" id="low-section-toggle" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding: var(--space-md) var(--space-lg);">
      <div style="display:flex; align-items:center; gap:var(--space-md)">
        <span style="font-size:1.5rem">⚠️</span>
        <div>
          <h2 style="font-size:1.1rem; margin:0;">Low Confidence Picks</h2>
          <span style="color:var(--text-tertiary); font-size:0.9rem">${count} picks hidden</span>
        </div>
      </div>
      <button class="btn-icon" style="width:auto; padding:0 1rem; border-radius:var(--radius-md); font-size:0.9rem;">
        Show Picks
      </button>
    </section>
  `;
}

// ============================================
// MATCH CARD COMPONENT
// ============================================

function renderMatchCard(match) {
  const sportIcon = SPORT_ICONS[match.sport] || '🎮';
  const homeIsRecommended = match.recommendation === 'home';
  const awayIsRecommended = match.recommendation === 'away';
  const drawIsRecommended = match.recommendation === 'draw';

  return `
    <article class="match-card" data-id="${match.id}">
      <div class="card-header">
        <span class="sport-badge">${sportIcon} ${match.league}</span>
        <span>${formatTime(match.kickoff)}</span>
      </div>
      
      <div class="match-teams">
        <div class="team-row ${homeIsRecommended ? 'recommended' : ''}">
          <span class="team-name">${match.teams.home}</span>
          <span class="team-odds">${match.odds.home.toFixed(2)}</span>
        </div>
        ${match.odds.draw ? `
        <div class="team-row ${drawIsRecommended ? 'recommended' : ''}" style="font-size:0.9em; opacity:0.8;">
          <span class="team-name" style="font-weight:400">Draw</span>
          <span class="team-odds">${match.odds.draw.toFixed(2)}</span>
        </div>` : ''}
        <div class="team-row ${awayIsRecommended ? 'recommended' : ''}">
          <span class="team-name">${match.teams.away}</span>
          <span class="team-odds">${match.odds.away.toFixed(2)}</span>
        </div>
      </div>
      
      <div class="card-stats">
        <div class="stat-box">
          <span class="stat-label">EDGE</span>
          <span class="stat-value ev-positive">${match.metrics.ev.toFixed(1)}%</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">KELLY</span>
          <span class="stat-value">${match.metrics.kelly_stake.toFixed(1)}%</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">CONFIDENCE</span>
          <span class="stat-value">${match.confidencePercent}%</span>
        </div>
      </div>
    </article>
  `;
}

// ============================================
// LOADING & ERROR STATES
// ============================================

export function renderLoadingState(progress = { current: 0, total: 0, message: '' }) {
  // Inline simplified loading for now, matching the theme
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center;">
      <div class="spinner" style="font-size:3rem; margin-bottom:1rem; animation: spin 1s infinite linear;">🎯</div>
      <h2 style="font-family:var(--font-display); margin-bottom:0.5rem">Analyzing Market Data...</h2>
      <p style="color:var(--text-secondary)">Finding the sharpest edges for you</p>
      ${progress.total > 0 ? `
        <div style="width:200px; height:4px; background:var(--bg-surface-elevated); margin-top:1rem; border-radius:2px; overflow:hidden">
            <div style="width:${(progress.current / progress.total) * 100}%; height:100%; background:var(--accent-primary); transition:width 0.3s"></div>
        </div>
        <p style="margin-top:0.5rem; font-size:0.8rem; color:var(--text-tertiary)">${progress.current} / ${progress.total}</p>
      ` : ''}
      <style>@keyframes spin { 0% {transform:rotate(0deg);} 100% {transform:rotate(360deg);} }</style>
    </div>
  `;
}

export function renderErrorState(errorMessage) {
  // Calculate time until next refresh (9 AM or 3 PM UTC+1)
  const now = new Date();
  const utcPlus1 = new Date(now.getTime() + (1 * 60 * 60 * 1000)); // Adjust for UTC+1

  const hours = utcPlus1.getUTCHours();
  let nextRefresh;

  if (hours < 9) {
    // Before 9 AM - next is 9 AM today
    nextRefresh = new Date(utcPlus1);
    nextRefresh.setUTCHours(9, 0, 0, 0);
  } else if (hours < 15) {
    // Before 3 PM - next is 3 PM today
    nextRefresh = new Date(utcPlus1);
    nextRefresh.setUTCHours(15, 0, 0, 0);
  } else {
    // After 3 PM - next is 9 AM tomorrow
    nextRefresh = new Date(utcPlus1);
    nextRefresh.setDate(nextRefresh.getDate() + 1);
    nextRefresh.setUTCHours(9, 0, 0, 0);
  }

  // Calculate countdown
  let diff = nextRefresh - utcPlus1;
  if (diff < 0) diff = 0; // Safety

  const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
  const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const nextTimeLabel = nextRefresh.getUTCHours() === 9 ? '9:00 AM' : '3:00 PM';

  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; text-align:center; padding: 2rem;">
      <div style="font-size:5rem; margin-bottom:1.5rem; filter: grayscale(0.3);">🏆</div>
      
      <h1 style="font-family:var(--font-display); font-size:2rem; margin-bottom:0.5rem; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">
        Predictions Coming Soon
      </h1>
      
      <p style="color:var(--text-secondary); max-width:400px; margin-bottom:2rem; line-height:1.6;">
        Our AI is preparing the next batch of edges for you. Check back at the next scheduled refresh.
      </p>
      
      <div style="background:var(--glass-bg); backdrop-filter:blur(10px); border:1px solid var(--glass-border); border-radius:16px; padding:2rem 3rem; margin-bottom:2rem;">
        <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-tertiary); margin-bottom:0.5rem;">
          Next Refresh In
        </div>
        <div id="countdown-timer" style="font-family:var(--font-display); font-size:2.5rem; font-weight:700; color:var(--accent-primary);">
          ${hoursLeft}h ${minutesLeft}m
        </div>
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.5rem;">
          📅 ${nextTimeLabel} (UTC+1)
        </div>
      </div>
      
      <div style="display:flex; gap:1rem; flex-wrap:wrap; justify-content:center;">
        <button class="mode-toggle-btn mode-live" id="retry-btn" style="cursor:pointer;">
          <span class="indicator"></span>
          <span>🔄 Check Again</span>
        </button>
      </div>
      
      <p style="margin-top:3rem; font-size:0.75rem; color:var(--text-tertiary); max-width:300px;">
        💡 Predictions refresh automatically at <strong>9:00 AM</strong> and <strong>3:00 PM</strong> daily
      </p>
    </div>
  `;
}
