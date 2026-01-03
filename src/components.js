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
  if (!isoString) return '';
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
  const timestamp = formatTimestamp(state.lastUpdated);
  const totalMatches = state.totalAnalyzed || 0;

  // Calculate total bets found
  const totalBets = (state.groupedMatches?.high?.length || 0) +
    (state.groupedMatches?.medium?.length || 0) +
    (state.groupedMatches?.low?.length || 0);

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const isDark = currentTheme === 'dark';

  return `
    <header class="header">
      <div class="logo">
        <div class="logo-icon">🏆</div>
        <div>
          <div class="logo-text">PREDICT</div>
          <div class="logo-tagline">AI Edge Finder</div>
        </div>
      </div>
      
      <div class="header-actions">
        ${state.isAdmin ? `<span style="background: var(--status-high); color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">🔐 ADMIN</span>` : ''}
        
        <button class="btn-icon" id="theme-toggle" title="Toggle Theme">
          ${isDark ? '☀️' : '🌙'}
        </button>

        <button class="btn-icon" id="refresh-btn" title="Admin: Refresh predictions">
          🔄
        </button>
      </div>

      ${state.lastUpdated ? `
        <div class="header-meta">
          <span class="meta-item">Updated: <strong>${timestamp}</strong></span>
          <span class="meta-divider">|</span>
          <span class="meta-item">Analyzed: <strong>${totalMatches}</strong></span>
          <span class="meta-divider">|</span>
          <span class="meta-item highlight">+EV Bets: ${totalBets}</span>
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
    let isActive = false;
    if (opt === 'all') {
      isActive = currentLimit >= maxVisible;
    } else {
      isActive = currentLimit === opt;
    }
    const disabledClass = (typeof opt === 'number' && opt > totalAvailable && opt !== 5) ? 'disabled' : '';

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
    matches, // This is now an array of "Bet" objects
    totalAvailable,
    currentLimit,
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
            These picks have lower confidence. Edge exists but variance is high. Use strict bankroll management.
          </div>
        </div>
      ` : ''}

      <div class="match-grid">
        ${matches.map(bet => renderBetCard(bet)).join('')}
      </div>
      
      <div style="margin-top: var(--space-lg); text-align: center; color: var(--text-tertiary); font-size: 0.875rem;">
        Showing ${showing} of ${totalAvailable} available picks • sorted by EV
      </div>
    </section>
  `;
}

export function renderLowSectionCollapsed(count) {
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
// BET CARD COMPONENT (Replaces Match Card)
// ============================================

function renderBetCard(bet) {
  // New Bet Object Structure:
  // { match_display, league, kickoff, market, pick, odds, ev, confidence, reason }

  const isPositiveEV = bet.ev > 0;

  return `
    <article class="match-card" data-id="${bet.match_id}">
      <div class="card-header">
        <span class="sport-badge">⚽ ${bet.league}</span>
        <span>${formatTime(bet.kickoff)}</span>
      </div>
      
      <div class="match-teams">
        <div class="match-title">
            ${bet.match_display}
        </div>
      </div>

      <div class="bet-market-box">
        <div class="bet-market-header">
            <span class="bet-market-label">${bet.market}</span>
            <span class="bet-odds-display">${bet.odds.toFixed(2)}</span>
        </div>
        <div class="bet-pick-name">
            ${bet.pick}
        </div>
      </div>
      
      <div class="card-stats">
        <div class="stat-box">
          <span class="stat-label">EDGE (EV)</span>
          <span class="stat-value ${isPositiveEV ? 'ev-positive' : ''}">${bet.ev.toFixed(1)}%</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">KELLY</span>
          <span class="stat-value">${bet.stake || '0%'}</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">CONFIDENCE</span>
          <span class="stat-value">${bet.confidence}%</span>
        </div>
      </div>

      <div class="bet-reason">
        "${bet.reason}"
      </div>
      
      ${bet.risk_factors && bet.risk_factors.length > 0 ? `
        <div class="bet-risks">
            ⚠️ ${bet.risk_factors.join(', ')}
        </div>
      ` : ''}

    </article>
  `;
}

// ============================================
// LOADING & ERROR STATES
// ============================================

export function renderLoadingState(progress = { current: 0, total: 0, message: '' }) {
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center;">
      <div class="spinner" style="font-size:3rem; margin-bottom:1rem; opacity:0.8;">🧠</div>
      <h2 style="font-family:var(--font-display); margin-bottom:0.5rem; font-weight:600;">PREDICT AI is Thinking...</h2>
      <p style="color:var(--text-secondary);">Scanning matches • Analyzing news • Calculating EV</p>
      ${progress.total > 0 ? `
        <div style="width:200px; height:4px; background:var(--bg-surface-elevated); margin-top:1rem; border-radius:2px; overflow:hidden">
            <div style="width:${(progress.current / progress.total) * 100}%; height:100%; background:var(--accent-primary); transition:width 0.3s"></div>
        </div>
        <p style="margin-top:0.5rem; font-size:0.8rem; color:var(--text-tertiary)">${progress.message}</p>
      ` : ''}
    </div>
  `;
}

export function renderErrorState(errorMessage) {
  // Calculate time until next refresh (9 AM, 3 PM, or 10 PM UTC+1)
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

  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; text-align:center; padding: 2rem;">
      <div style="font-size:5rem; margin-bottom:1.5rem; filter: grayscale(0.3);">⚠️</div>
      <h1 style="font-family:var(--font-display); font-size:2rem; margin-bottom:0.5rem; color: var(--text-primary);">
        System Offline
      </h1>
      <p style="color:var(--text-secondary); max-width:400px; margin-bottom:2rem; line-height:1.6;">
        ${errorMessage || 'No Predictions for now. Waiting for the next refresh to get new predictions'}
      </p>
      <p style="color:var(--text-muted); font-size:0.9rem; margin-top:1rem;">Auto-refreshes at 9 AM and 3 PM daily</p>
    </div>
  `;
}

export function renderFooter() {
  return `
    <footer style="text-align: center; padding: 2rem; color: var(--text-tertiary); font-size: 0.85rem; font-family: var(--font-body); width: 100%;">
      PREDICT Autonomous System • Powered by AI
    </footer>
  `;
}
