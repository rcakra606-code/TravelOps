/* =========================================================
   TRAVELOPS SHARED AUTH MODULE
   Provides token refresh and session management for all pages
   ========================================================= */

/* === CONFIGURATION === */
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity = auto logout
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // Refresh token every 5 minutes if active
const TOKEN_REFRESH_THRESHOLD = 10 * 60 * 1000; // Refresh if token is older than 10 minutes

/* === AUTHENTICATION CHECK (on DOM ready, not immediately) === */
let authCheckPassed = false;

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

const getHeaders = (json = true) => {
  const h = {};
  const token = localStorage.getItem('token');
  if (token) h['Authorization'] = 'Bearer ' + token;
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

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
 * Handle session expiration
 */
function handleSessionExpired() {
  localStorage.clear();
  sessionStorage.clear();
  toast.error('Session Anda telah berakhir. Silakan login kembali.');
  setTimeout(() => {
    window.location.href = '/login.html';
  }, 1500);
}

/**
 * Check for inactivity and auto-logout
 */
function checkInactivity() {
  const idleTime = Date.now() - lastActivityTime;
  
  if (idleTime > INACTIVITY_TIMEOUT) {
    console.warn('User inactive for 30 minutes, logging out...');
    localStorage.clear();
    sessionStorage.clear();
    toast.warning('Anda telah logout otomatis karena tidak aktif selama 30 menit.');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1500);
    return true;
  }
  return false;
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
    toast.error('Sesi login telah berakhir. Silakan login kembali.');
    localStorage.clear();
    sessionStorage.clear();
    setTimeout(() => {
      location.href = '/login.html';
    }, 1500);
    throw new Error('Session expired');
  }
  
  // For 403, throw error to let caller handle it
  if (res.status === 403) {
    const errorData = await res.json().catch(() => ({ error: 'Forbidden' }));
    throw new Error(errorData.error || 'Akses ditolak');
  }
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `HTTP ${res.status}`);
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
 */
function parseFormattedNumber(value) {
  return parseFloat(String(value).replace(/,/g, '')) || 0;
}

/**
 * Utility: Get current user data
 */
function getUser() {
  return JSON.parse(localStorage.getItem('user') || '{}');
}

// Export functions globally
window.fetchJson = fetchJson;
window.formatCurrency = formatCurrency;
window.formatNumberWithCommas = formatNumberWithCommas;
window.parseFormattedNumber = parseFormattedNumber;
window.getUser = getUser;
window.refreshTokenIfNeeded = refreshTokenIfNeeded;
window.startTokenRefresh = startTokenRefresh;
window.checkInactivity = checkInactivity;
window.handleSessionExpired = handleSessionExpired;

// Auto-start token refresh when module loads (after auth check)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (authCheckPassed) startTokenRefresh();
  });
} else {
  if (authCheckPassed) startTokenRefresh();
}
