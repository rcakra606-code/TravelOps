/* =========================================================
   TRAVELOPS SHARED AUTH MODULE
   Provides token refresh and session management for all pages
   ========================================================= */

/* === AUTHENTICATION CHECK === */
(() => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    console.warn('No authentication found, redirecting to login...');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login.html';
    return;
  }
  
  // Verify token format (basic check)
  try {
    const userData = JSON.parse(user);
    if (!userData.username || !userData.type) {
      throw new Error('Invalid user data');
    }
  } catch (err) {
    console.error('Invalid session data:', err);
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login.html';
    return;
  }
})();

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

/**
 * Proactively refresh token if it's been more than 12 minutes since last refresh
 * This keeps us well ahead of the 30-minute expiry
 */
async function refreshTokenIfNeeded() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  
  const timeSinceRefresh = Date.now() - lastTokenRefreshTime;
  const twelveMinutes = 12 * 60 * 1000;
  
  if (timeSinceRefresh > twelveMinutes) {
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
          console.log('🔄 Token proactively refreshed');
          return true;
        }
      }
    } catch (err) {
      console.error('Proactive token refresh failed:', err);
    }
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
    alert('Sesi login telah berakhir. Silakan login kembali.');
    localStorage.clear();
    sessionStorage.clear();
    location.href = '/login.html';
    return;
  }
  
  // For 403, throw error to let caller handle it
  if (res.status === 403) {
    const errorData = await res.json().catch(() => ({ error: 'Forbidden' }));
    throw new Error(errorData.error || 'Akses ditolak');
  }
  
  if (!res.ok) throw new Error(await res.text());
  try { return await res.json(); } catch { return null; }
}

/**
 * Start automatic token refresh based on user activity
 */
let tokenRefreshInterval = null;

function startTokenRefresh() {
  // Update activity time on user interactions
  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
      lastActivityTime = Date.now();
    }, { passive: true, once: false });
  });
  
  // Check and refresh token every 2 minutes to stay ahead of 30min expiry
  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
  tokenRefreshInterval = setInterval(async () => {
    const idleTime = Date.now() - lastActivityTime;
    const tenMinutes = 10 * 60 * 1000;
    
    // Only refresh if user has been active in the last 10 minutes
    if (idleTime < tenMinutes) {
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
          }
        } else if (response.status === 401 || response.status === 403) {
          console.warn('Token expired, logging out...');
          localStorage.clear();
          sessionStorage.clear();
          alert('Sesi Anda telah berakhir. Silakan login kembali.');
          window.location.href = '/login.html';
        }
      } catch (err) {
        console.error('Token refresh failed:', err);
      }
    } else {
      console.log('⏸️ User idle, token refresh paused');
    }
  }, 2 * 60 * 1000); // Check every 2 minutes
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

// Auto-start token refresh when module loads
startTokenRefresh();
