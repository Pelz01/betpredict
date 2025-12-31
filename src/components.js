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
  const isLive = state.mode === 'live';
  const timestamp = formatTimestamp(state.lastUpdated);
  const totalMatches = state.totalAnalyzed || 0;
  const positiveEV = (state.groupedMatches?.high?.length || 0) +
    (state.groupedMatches?.medium?.length || 0) +
    (state.groupedMatches?.low?.length || 0);

  // Get current theme from DOM
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const isDark = currentTheme === 'dark';

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
        <!-- Theme Toggle -->
        <button class="btn-icon" id="theme-toggle" title="Toggle Theme">
          ${isDark ? '☀️' : '🌙'}
        </button>

        <!-- Mode Toggle -->
        <button 
          class="mode-toggle-btn ${isLive ? 'mode-live' : 'mode-mock'}" 
          id="mode-toggle"
          title="${isLive ? 'Using live data from API-Football + AI' : 'Using mock data'}"
        >
          <span class="indicator"></span>
          <span>${isLive ? 'Live Data' : 'Mock Data'}</span>
        </button>

        <!-- Refresh Button -->
        <button class="btn-icon" id="refresh-btn" title="Refresh predictions">
          🔄
        </button>
      </div>

      ${state.lastUpdated ? `
        <div class="header-meta">
          <span class="meta-item">Last scan: <strong>${timestamp}</strong></span>
          <span class="meta-divider">|</span>
          <span class="meta-item">Analyzed: <strong>${totalMatches}</strong></span>
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
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center;">
        <div style="font-size:4rem; margin-bottom:1rem">❌</div>
        <h2>Connection Error</h2>
        <p style="color:var(--text-secondary); max-width:400px; margin-bottom:2rem">${errorMessage}</p>
        <button class="mode-toggle-btn" id="retry-btn">
            Try Again
        </button>
    </div>
  `;
}
