/* =========================================================
   TRAVELOPS SHARED AUTH MODULE
   Provides token refresh and session management for all pages
   ========================================================= */

/* === CONFIGURATION === */
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity = auto logout
const INACTIVITY_WARNING = 28 * 60 * 1000; // Show warning at 28 minutes (2 mins before logout)
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // Refresh token every 5 minutes if active
const TOKEN_REFRESH_THRESHOLD = 10 * 60 * 1000; // Refresh if token is older than 10 minutes
const TOKEN_EXPIRY_WARNING_MINUTES = 2; // Show token expiry warning 2 minutes before expiration
const TOKEN_EXTEND_DURATION = 15; // Extend session by 15 minutes

let sessionWarningShown = false; // Track if warning has been shown
let tokenExpiryWarningShown = false; // Track if token expiry warning has been shown
let tokenExpiryCheckInterval = null; // Interval for checking token expiry
let userActivityStatus = 'active'; // Track if user is 'active' or 'idle'
let lastUserInteraction = Date.now(); // Track last user interaction for activity status

/* === AUTHENTICATION CHECK (on DOM ready, not immediately) === */
let authCheckPassed = false;

// Clean up legacy dark mode settings
localStorage.removeItem('travelops-theme');
document.documentElement.removeAttribute('data-theme');

async function checkAuthOnLoad() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  // Skip auth check for login and logout pages
  if (window.location.pathname.includes('/login.html') || window.location.pathname.includes('/logout.html')) {
    return true;
  }
  
  if (!token || !user) {
    console.warn('No authentication found, redirecting to login...');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login.html';
    return false;
  }
  
  // Verify token with server
  try {
    const userData = JSON.parse(user);
    if (!userData.username || !userData.type) {
      throw new Error('Invalid user data');
    }
    
    // Verify token is still valid on server
    const response = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Token validation failed');
    }
    
    authCheckPassed = true;
    
    // Start token refresh and expiry monitoring after successful auth
    startTokenRefresh();
    // Fetch CSRF token for state-changing requests
    await fetchCsrfToken();
    console.log('✅ Auth check passed, token expiry monitor started');
    
    return true;
  } catch (err) {
    console.error('Invalid session data:', err);
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login.html';
    return false;
  }
}

// Run auth check when DOM is ready (delay slightly to let page load)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkAuthOnLoad, 100); // Small delay to ensure scripts load
  });
} else {
  // If already loaded, still delay slightly
  setTimeout(checkAuthOnLoad, 100);
}

/* === GLOBAL HELPERS === */
const api = p => p.startsWith('/') ? p : '/' + p;

/**
 * Escape HTML special characters to prevent XSS when rendering user data.
 * Use this on ALL user-supplied values before inserting into innerHTML.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape for use inside HTML attribute values */
function escapeAttr(str) {
  return escapeHtml(str);
}

const getHeaders = (json = true) => {
  const h = {};
  const token = localStorage.getItem('token');
  if (token) h['Authorization'] = 'Bearer ' + token;
  if (json) h['Content-Type'] = 'application/json';
  // Include CSRF token on all requests
  const csrfToken = sessionStorage.getItem('csrfToken');
  if (csrfToken) h['X-CSRF-Token'] = csrfToken;
  return h;
};

// Fetch and store CSRF token from the server
async function fetchCsrfToken() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch('/api/csrf-token', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.csrfToken) {
        sessionStorage.setItem('csrfToken', data.csrfToken);
      }
    }
  } catch (err) {
    console.warn('Failed to fetch CSRF token:', err.message);
  }
}

// Track token refresh timing
let lastTokenRefreshTime = Date.now();
let lastActivityTime = Date.now();

// Decode JWT (no signature verification) to inspect exp for diagnostics
function decodeTokenRaw(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    return payload;
  } catch { return null; }
}

function getTokenRemainingMinutes() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = decodeTokenRaw(token);
  if (!payload || !payload.exp) return null;
  const nowSec = Date.now()/1000;
  const remaining = payload.exp - nowSec;
  return Math.max(0, Math.round(remaining/60));
}

/**
 * Get token remaining seconds (more precise for countdown)
 */
function getTokenRemainingSeconds() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = decodeTokenRaw(token);
  if (!payload || !payload.exp) return null;
  const nowSec = Date.now()/1000;
  const remaining = payload.exp - nowSec;
  return Math.max(0, Math.round(remaining));
}

/**
 * Update user activity status based on recent interactions
 */
function updateActivityStatus() {
  const idleTime = Date.now() - lastUserInteraction;
  const fiveMinutes = 5 * 60 * 1000;
  userActivityStatus = idleTime < fiveMinutes ? 'active' : 'idle';
  return userActivityStatus;
}

/**
 * Check if token is near expiration and show warning
 */
function checkTokenExpiry() {
  const remainingMinutes = getTokenRemainingMinutes();
  
  // Skip if no token or warning already shown
  if (remainingMinutes === null || tokenExpiryWarningShown) return;
  
  // Show warning if token expires within warning threshold
  if (remainingMinutes <= TOKEN_EXPIRY_WARNING_MINUTES && remainingMinutes > 0) {
    tokenExpiryWarningShown = true;
    showTokenExpiryWarning();
  }
  
  // If token already expired, handle it
  if (remainingMinutes === 0) {
    handleSessionExpired('Your login session has expired. Please login again.');
  }
}

/**
 * Show token expiration warning modal with extend option
 */
function showTokenExpiryWarning() {
  // Remove any existing warning
  const existing = document.getElementById('tokenExpiryWarningOverlay');
  if (existing) existing.remove();
  
  // Check user activity status
  const activityStatus = updateActivityStatus();
  const isActive = activityStatus === 'active';
  
  const overlay = document.createElement('div');
  overlay.id = 'tokenExpiryWarningOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    animation: fadeIn 0.3s ease;
  `;
  
  let remainingSecs = getTokenRemainingSeconds() || 120;
  
  overlay.innerHTML = `
    <style>
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      .token-warning-card { animation: slideUp 0.4s ease; }
      @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      .activity-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
      .activity-active { background: #dcfce7; color: #166534; }
      .activity-idle { background: #fef3c7; color: #92400e; }
      .extend-btn { transition: all 0.2s; }
      .extend-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35); }
      .timer-ring { position: relative; width: 100px; height: 100px; }
      .timer-ring svg { transform: rotate(-90deg); }
      .timer-ring circle { fill: none; stroke-width: 8; }
      .timer-ring .bg { stroke: #e5e7eb; }
      .timer-ring .progress { stroke: #ef4444; stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
      .timer-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; font-weight: 700; color: #dc2626; }
    </style>
    <div class="token-warning-card" style="background: white; padding: 32px; border-radius: 16px; max-width: 420px; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.25);">
      <div style="margin-bottom: 20px;">
        <span style="font-size: 48px;">🔐</span>
      </div>
      
      <h3 style="margin: 0 0 8px 0; color: #111827; font-size: 22px; font-weight: 700;">Session Expiring Soon</h3>
      
      <div style="margin: 12px 0;">
        <span class="activity-badge ${isActive ? 'activity-active' : 'activity-idle'}">
          <span style="font-size: 10px;">${isActive ? '🟢' : '🟡'}</span>
          Status: ${isActive ? 'Active' : 'Idle'}
        </span>
      </div>
      
      <p style="margin: 16px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
        Your login session will expire in:
      </p>
      
      <div class="timer-ring" style="margin: 20px auto;">
        <svg width="100" height="100">
          <circle class="bg" cx="50" cy="50" r="42"></circle>
          <circle class="progress" id="tokenTimerProgress" cx="50" cy="50" r="42" 
            stroke-dasharray="264" stroke-dashoffset="0"></circle>
        </svg>
        <div class="timer-text" id="tokenExpiryCountdown">${remainingSecs}s</div>
      </div>
      
      <p style="margin: 16px 0 24px 0; color: #374151; font-size: 13px;">
        Click below to extend your session by <strong>${TOKEN_EXTEND_DURATION} minutes</strong>
      </p>
      
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button id="tokenExtendBtn" class="extend-btn" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; padding: 14px 28px; border-radius: 10px; font-size: 15px; cursor: pointer; font-weight: 600; flex: 1;">
          ⏱️ Extend ${TOKEN_EXTEND_DURATION} Minutes
        </button>
        <button id="tokenLogoutBtn" style="background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; padding: 14px 20px; border-radius: 10px; font-size: 15px; cursor: pointer; font-weight: 500;">
          Logout
        </button>
      </div>
      
      <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">
        💡 Tip: ${isActive ? 'Your session auto-refreshes while you\'re active.' : 'Move your mouse or click to stay active.'}
      </p>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Get initial values for animation
  const initialSecs = remainingSecs;
  const circumference = 264; // 2 * PI * 42
  
  // Countdown timer with visual ring
  const countdownEl = document.getElementById('tokenExpiryCountdown');
  const progressEl = document.getElementById('tokenTimerProgress');
  
  const countdownInterval = setInterval(() => {
    remainingSecs--;
    if (countdownEl) {
      countdownEl.textContent = `${remainingSecs}s`;
    }
    if (progressEl) {
      const offset = circumference * (1 - remainingSecs / initialSecs);
      progressEl.style.strokeDashoffset = offset;
    }
    if (remainingSecs <= 0) {
      clearInterval(countdownInterval);
      overlay.remove();
      handleSessionExpired('Your session has expired due to timeout.');
    }
  }, 1000);
  
  // Extend session button
  document.getElementById('tokenExtendBtn').addEventListener('click', async () => {
    clearInterval(countdownInterval);
    const btn = document.getElementById('tokenExtendBtn');
    btn.innerHTML = '⏳ Extending...';
    btn.disabled = true;
    
    try {
      const success = await refreshTokenIfNeeded(true);
      if (success) {
        tokenExpiryWarningShown = false; // Reset so warning can show again if needed
        lastActivityTime = Date.now();
        lastUserInteraction = Date.now();
        overlay.remove();
        toast.success(`Session extended by ${TOKEN_EXTEND_DURATION} minutes. You are still logged in.`);
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (err) {
      console.error('Failed to extend session:', err);
      overlay.remove();
      handleSessionExpired('Failed to extend session. Please login again.');
    }
  });
  
  // Logout button
  document.getElementById('tokenLogoutBtn').addEventListener('click', () => {
    clearInterval(countdownInterval);
    overlay.remove();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/logout.html';
  });
}

/**
 * Start token expiry monitoring
 */
function startTokenExpiryMonitor() {
  console.log('🔔 Token expiry monitor started');
  
  // Check token expiry every 30 seconds
  if (tokenExpiryCheckInterval) clearInterval(tokenExpiryCheckInterval);
  tokenExpiryCheckInterval = setInterval(checkTokenExpiry, 30 * 1000);
  
  // Also check immediately with a small delay
  setTimeout(() => {
    const remaining = getTokenRemainingMinutes();
    console.log(`[auth] Initial token check: ~${remaining}m remaining, warning threshold: ${TOKEN_EXPIRY_WARNING_MINUTES}m`);
    checkTokenExpiry();
  }, 3000);
  
  // Track user interactions for activity status
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart', 'touchmove'].forEach(event => {
    document.addEventListener(event, () => {
      lastUserInteraction = Date.now();
      userActivityStatus = 'active';
    }, { passive: true });
  });
}

// Periodic diagnostic log (every 5 minutes) to help detect premature expirations
setInterval(() => {
  const mins = getTokenRemainingMinutes();
  if (mins != null) {
    console.log(`[auth] Token remaining ~${mins}m`);
  }
}, 5 * 60 * 1000);

/**
 * Proactively refresh token if it's been more than 10 minutes since last refresh
 * This keeps us well ahead of the 30-minute expiry
 * @param {boolean} force - Force refresh regardless of time threshold
 */
async function refreshTokenIfNeeded(force = false) {
  const token = localStorage.getItem('token');
  if (!token) return false;
  
  const timeSinceRefresh = Date.now() - lastTokenRefreshTime;
  
  if (force || timeSinceRefresh > TOKEN_REFRESH_THRESHOLD) {
    try {
      const response = await fetch(api('/api/refresh'), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          lastTokenRefreshTime = Date.now();
          lastActivityTime = Date.now();
          const remaining = getTokenRemainingMinutes();
          console.log(force ? '🔄 Token force refreshed' : '🔄 Token proactively refreshed');
          if (remaining != null) console.log(`[auth] New token remaining ~${remaining}m`);
          // Refresh CSRF token with the new auth token
          await fetchCsrfToken();
          return true;
        }
      } else if (response.status === 401 || response.status === 403) {
        console.warn('Token refresh rejected, logging out...');
        handleSessionExpired();
        return false;
      }
    } catch (err) {
      console.error('Proactive token refresh failed:', err);
      return false;
    }
  }
  return false;
}

/**
 * Handle session expiration - show professional overlay with countdown and redirect
 */
function handleSessionExpired(message = 'Your session has expired. Please login again.') {
  // Prevent multiple overlays
  if (document.getElementById('sessionExpiredOverlay')) return;
  
  localStorage.clear();
  sessionStorage.clear();
  
  const overlay = document.createElement('div');
  overlay.id = 'sessionExpiredOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    animation: sessionFadeIn 0.3s ease;
  `;
  
  let countdown = 5;
  
  overlay.innerHTML = `
    <style>
      @keyframes sessionFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes sessionSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes sessionSpin { to { transform: rotate(360deg); } }
    </style>
    <div style="background: white; padding: 40px; border-radius: 16px; max-width: 420px; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.3); animation: sessionSlideUp 0.4s ease;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
      <h3 style="margin: 0 0 12px 0; color: #111827; font-size: 22px; font-weight: 700;">Session Expired</h3>
      <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">${message}</p>
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px; background: #f3f4f6; padding: 14px 20px; border-radius: 12px; margin-bottom: 20px;">
        <div style="width: 20px; height: 20px; border: 3px solid #d1d5db; border-top-color: #2563eb; border-radius: 50%; animation: sessionSpin 0.8s linear infinite;"></div>
        <span style="color: #374151; font-size: 14px;">Redirecting to login in <strong id="sessionExpiredCountdown" style="color: #2563eb;">${countdown}</strong> seconds...</span>
      </div>
      <a href="/login.html" style="color: #2563eb; font-size: 13px; text-decoration: none; font-weight: 600;">Click here to login now →</a>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const countdownInterval = setInterval(() => {
    countdown--;
    const el = document.getElementById('sessionExpiredCountdown');
    if (el) el.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      window.location.href = '/login.html';
    }
  }, 1000);
}

/**
 * Handle session invalidated (logged in from another device)
 */
function handleSessionInvalidated() {
  // Prevent multiple overlays
  if (document.getElementById('sessionInvalidatedOverlay')) return;
  
  localStorage.clear();
  sessionStorage.clear();
  
  let countdown = 5;
  
  const overlay = document.createElement('div');
  overlay.id = 'sessionInvalidatedOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    animation: sessionFadeIn 0.3s ease;
  `;
  
  overlay.innerHTML = `
    <style>
      @keyframes sessionFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes sessionSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes sessionSpin { to { transform: rotate(360deg); } }
    </style>
    <div style="background: white; padding: 40px; border-radius: 16px; max-width: 420px; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.3); animation: sessionSlideUp 0.4s ease;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
      <h3 style="margin: 0 0 12px 0; color: #dc2626; font-size: 22px; font-weight: 700;">Session Terminated</h3>
      <p style="margin: 0 0 8px 0; color: #374151; font-size: 14px; line-height: 1.6;">
        Your account has been logged in from another device.<br>
        For security, this session has been terminated.
      </p>
      <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 13px;">
        If this wasn't you, please change your password immediately.
      </p>
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px; background: #fef2f2; padding: 14px 20px; border-radius: 12px; margin-bottom: 20px;">
        <div style="width: 20px; height: 20px; border: 3px solid #fecaca; border-top-color: #dc2626; border-radius: 50%; animation: sessionSpin 0.8s linear infinite;"></div>
        <span style="color: #374151; font-size: 14px;">Redirecting to login in <strong id="sessionInvalidCountdown" style="color: #dc2626;">${countdown}</strong> seconds...</span>
      </div>
      <a href="/login.html" style="color: #2563eb; font-size: 13px; text-decoration: none; font-weight: 600;">Click here to login now →</a>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const countdownInterval = setInterval(() => {
    countdown--;
    const el = document.getElementById('sessionInvalidCountdown');
    if (el) el.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      window.location.href = '/login.html';
    }
  }, 1000);
}

/**
 * Check for inactivity and auto-logout
 */
function checkInactivity() {
  const idleTime = Date.now() - lastActivityTime;
  
  // Show warning 2 minutes before logout
  if (idleTime > INACTIVITY_WARNING && !sessionWarningShown) {
    sessionWarningShown = true;
    showSessionWarning();
  }
  
  if (idleTime > INACTIVITY_TIMEOUT) {
    console.warn('User inactive for 30 minutes, logging out...');
    handleSessionExpired('You have been logged out automatically due to 30 minutes of inactivity.');
    return true;
  }
  return false;
}

/**
 * Show session timeout warning with countdown
 */
function showSessionWarning() {
  const warningOverlay = document.createElement('div');
  warningOverlay.id = 'sessionWarningOverlay';
  warningOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;
  
  const remainingMs = INACTIVITY_TIMEOUT - (Date.now() - lastActivityTime);
  let remainingSecs = Math.ceil(remainingMs / 1000);
  
  warningOverlay.innerHTML = `
    <div style="background: white; padding: 32px; border-radius: 12px; max-width: 400px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
      <h3 style="margin: 0 0 12px 0; color: #111827; font-size: 20px;">Session Timeout Warning</h3>
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 15px;">You will be logged out due to inactivity in:</p>
      <div id="sessionCountdown" style="font-size: 36px; font-weight: bold; color: #dc2626; margin: 16px 0;">${remainingSecs}s</div>
      <button id="sessionStayBtn" style="background: #2563eb; color: white; border: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: 600;">
        Stay Logged In
      </button>
    </div>
  `;
  
  document.body.appendChild(warningOverlay);
  
  // Countdown timer
  const countdownInterval = setInterval(() => {
    remainingSecs--;
    const countdownEl = document.getElementById('sessionCountdown');
    if (countdownEl) {
      countdownEl.textContent = `${remainingSecs}s`;
    }
    if (remainingSecs <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);
  
  // Stay logged in button
  document.getElementById('sessionStayBtn').addEventListener('click', () => {
    clearInterval(countdownInterval);
    lastActivityTime = Date.now();
    sessionWarningShown = false;
    warningOverlay.remove();
    toast.success('Session extended. You are still logged in.');
  });
}

/**
 * Enhanced fetch with automatic token refresh and error handling
 */
async function fetchJson(url, opts = {}) {
  // Update activity timestamp on any API call
  lastActivityTime = Date.now();
  
  // Proactively refresh token if needed before making the request
  if (!url.includes('/api/refresh') && !url.includes('/api/login')) {
    await refreshTokenIfNeeded();
  }
  
  opts.headers = { 
    ...(opts.headers || {}), 
    ...getHeaders(!!opts.body),
    // Prevent caching for metrics endpoint to ensure fresh data
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache'
  };
  
  if (opts.body && typeof opts.body === 'object' && opts.headers['Content-Type'] === 'application/json') {
    opts.body = JSON.stringify(opts.body);
  }
  
  const res = await fetch(api(url), opts);
  
  // Only logout on 401 (invalid/expired token), not 403 (forbidden by permission)
  if (res.status === 401) {
    // Check if session was invalidated (logged in from another device)
    try {
      const errorData = await res.clone().json();
      if (errorData.code === 'SESSION_INVALIDATED') {
        handleSessionInvalidated();
        throw new Error('Session invalidated');
      }
    } catch (e) {
      if (e.message === 'Session invalidated') throw e;
    }
    
    // Try one token refresh before giving up
    if (!url.includes('/api/refresh') && !url.includes('/api/login')) {
      console.log('🔄 Got 401, attempting token refresh...');
      const refreshed = await refreshTokenIfNeeded(true); // Force refresh
      if (refreshed) {
        console.log('✅ Token refreshed, retrying request...');
        // Retry the request with new token
        opts.headers = { 
          ...(opts.headers || {}), 
          ...getHeaders(!!opts.body)
        };
        const retryRes = await fetch(api(url), opts);
        if (retryRes.ok) {
          try { return await retryRes.json(); } catch { return null; }
        }
      }
    }
    
    // If refresh failed or this is a refresh/login endpoint, logout
    console.warn('Token refresh failed or not applicable, logging out...');
    handleSessionExpired('Your session has expired. Please login again.');
    throw new Error('Session expired');
  }
  
  // For 403, throw error to let caller handle it
  if (res.status === 403) {
    const errorData = await res.json().catch(() => ({ error: 'Forbidden' }));
    throw new Error(errorData.error || 'Akses ditolak');
  }
  
  if (!res.ok) {
    // Try to parse error response as JSON first (for validation errors like duplicate tour_code)
    const errorData = await res.json().catch(async () => {
      // Fallback to text if not JSON
      const errorText = await res.text();
      return { error: errorText || `HTTP ${res.status}` };
    });
    throw new Error(errorData.error || errorData.message || `HTTP ${res.status}`);
  }
  try { return await res.json(); } catch { return null; }
}

/**
 * Start automatic token refresh based on user activity
 */
let tokenRefreshInterval = null;
let inactivityCheckInterval = null;

function startTokenRefresh() {
  // Update activity time on user interactions
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
      lastActivityTime = Date.now();
    }, { passive: true, once: false });
  });
  
  // Check and refresh token every 5 minutes
  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
  tokenRefreshInterval = setInterval(async () => {
    // First check inactivity
    if (checkInactivity()) return;
    
    const idleTime = Date.now() - lastActivityTime;
    const fiveMinutes = 5 * 60 * 1000;
    
    // Only refresh if user has been active in the last 5 minutes
    if (idleTime < fiveMinutes) {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await fetch(api('/api/refresh'), {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            localStorage.setItem('token', data.token);
            lastTokenRefreshTime = Date.now();
            const idleMinutes = Math.floor(idleTime / 60000);
            console.log(`🔄 Token refreshed (idle: ${idleMinutes}m)`);
            const remaining = getTokenRemainingMinutes();
            if (remaining != null) console.log(`[auth] Post-refresh remaining ~${remaining}m`);
          }
        } else if (response.status === 401 || response.status === 403) {
          handleSessionExpired();
        }
      } catch (err) {
        console.error('Token refresh failed:', err);
      }
    } else {
      const idleMinutes = Math.floor(idleTime / 60000);
      console.log(`⏸️ User idle for ${idleMinutes}m, token refresh paused`);
    }
  }, TOKEN_REFRESH_INTERVAL);
  
  // Check inactivity every minute
  if (inactivityCheckInterval) clearInterval(inactivityCheckInterval);
  inactivityCheckInterval = setInterval(() => {
    checkInactivity();
  }, 60 * 1000); // Check every minute
  
  // Start token expiry monitoring
  startTokenExpiryMonitor();
}

/**
 * Utility: Format currency for Indonesian locale
 */
function formatCurrency(v) {
  try { return 'Rp ' + Number(v || 0).toLocaleString('id-ID'); }
  catch { return v; }
}

/**
 * Utility: Format number with commas
 */
function formatNumberWithCommas(value) {
  const numStr = String(value).replace(/[^\d.]/g, '');
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * Utility: Parse formatted number
 * Handles both Indonesian format (dot as thousand separator: 439.000.000)
 * and International format (comma as thousand separator: 439,000,000)
 */
function parseFormattedNumber(value) {
  let val = String(value);
  
  // Handle Indonesian format (dots as thousand separators)
  if (val.includes('.') && !val.includes(',')) {
    // Multiple dots = definitely thousand separators (e.g., 439.000.000)
    if ((val.match(/\./g) || []).length > 1) {
      val = val.replace(/\./g, '');
    } 
    // Single dot followed by exactly 3 digits at end = thousand separator (e.g., 439.000)
    else if (/\.\d{3}$/.test(val)) {
      val = val.replace(/\./g, '');
    }
    // Otherwise keep as decimal point (e.g., 439.50)
  } else {
    // International format - remove commas
    val = val.replace(/,/g, '');
  }
  
  return parseFloat(val) || 0;
}

// Expose globally
window.parseFormattedNumber = parseFormattedNumber;

/**
 * Utility: Get current user data
 */
function getUser() {
  return JSON.parse(localStorage.getItem('user') || '{}');
}

// Export functions globally (for non-module scripts)
window.api = api;
window.getHeaders = getHeaders;
window.fetchJson = fetchJson;
window.fetchCsrfToken = fetchCsrfToken;
window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
window.formatCurrency = formatCurrency;
window.formatNumberWithCommas = formatNumberWithCommas;
window.parseFormattedNumber = parseFormattedNumber;
window.getUser = getUser;
window.refreshTokenIfNeeded = refreshTokenIfNeeded;
window.startTokenRefresh = startTokenRefresh;
window.checkInactivity = checkInactivity;
window.handleSessionExpired = handleSessionExpired;
window.checkTokenExpiry = checkTokenExpiry;
window.startTokenExpiryMonitor = startTokenExpiryMonitor;
window.getTokenRemainingMinutes = getTokenRemainingMinutes;
window.getTokenRemainingSeconds = getTokenRemainingSeconds;

// Token refresh and expiry monitoring is now started in checkAuthOnLoad() after successful auth
