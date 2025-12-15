// ============================================
// APP ENHANCEMENTS - Auto-refresh, Notifications, Error Handling
// ============================================

// ===================================================================
// NOTIFICATION SYSTEM
// ===================================================================
class NotificationManager {
  constructor() {
    this.notifications = [];
    this.badge = null;
    this.panel = null;
    this.lastFetch = 0;
    this.fetchInterval = 5 * 60 * 1000; // 5 minutes
  }
  
  async init() {
    this.createUI();
    await this.fetchNotifications();
    
    // Auto-refresh notifications
    setInterval(() => this.fetchNotifications(), this.fetchInterval);
  }
  
  createUI() {
    // Create notification bell in header
    const existingBell = document.getElementById('notificationBell');
    if (existingBell) return;
    
    const bell = document.createElement('button');
    bell.id = 'notificationBell';
    bell.className = 'notification-bell';
    bell.innerHTML = `
      <span class="bell-icon">🔔</span>
      <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
    `;
    bell.onclick = () => this.togglePanel();
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .notification-bell {
        position: fixed;
        top: 20px;
        right: 70px;
        background: var(--card, #fff);
        border: 2px solid var(--border-light, #e5e7eb);
        border-radius: 50%;
        width: 44px;
        height: 44px;
        cursor: pointer;
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .notification-bell:hover {
        transform: scale(1.1);
        border-color: var(--primary, #3b82f6);
      }
      .bell-icon { font-size: 20px; }
      .notification-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 700;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
      }
      .notification-panel {
        position: fixed;
        top: 70px;
        right: 20px;
        width: 360px;
        max-height: 480px;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        z-index: 9999;
        display: none;
        overflow: hidden;
      }
      .notification-panel.active { display: block; }
      .notification-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--bg-alt, #f8fafc);
      }
      .notification-header h3 { margin: 0; font-size: 16px; }
      .notification-list {
        max-height: 380px;
        overflow-y: auto;
      }
      .notification-item {
        padding: 14px 20px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
        cursor: pointer;
        transition: background 0.2s;
      }
      .notification-item:hover { background: var(--bg-alt, #f8fafc); }
      .notification-item:last-child { border-bottom: none; }
      .notification-item.high { border-left: 3px solid #ef4444; }
      .notification-item.medium { border-left: 3px solid #f59e0b; }
      .notification-item.low { border-left: 3px solid #10b981; }
      .notification-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
        color: var(--text-primary, #111);
      }
      .notification-message {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }
      .notification-empty {
        padding: 40px 20px;
        text-align: center;
        color: var(--text-secondary, #6b7280);
      }
      @media (max-width: 480px) {
        .notification-panel {
          width: calc(100% - 40px);
          right: 20px;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(bell);
    
    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'notification-panel';
    this.panel.innerHTML = `
      <div class="notification-header">
        <h3>🔔 Notifications</h3>
        <button onclick="notificationManager.fetchNotifications()" style="background:none;border:none;cursor:pointer;font-size:16px;">🔄</button>
      </div>
      <div class="notification-list" id="notificationList">
        <div class="notification-empty">Loading...</div>
      </div>
    `;
    document.body.appendChild(this.panel);
    
    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.panel.contains(e.target) && e.target.id !== 'notificationBell' && !e.target.closest('#notificationBell')) {
        this.panel.classList.remove('active');
      }
    });
    
    this.badge = document.getElementById('notificationBadge');
  }
  
  togglePanel() {
    this.panel.classList.toggle('active');
  }
  
  async fetchNotifications() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      this.notifications = data.notifications || [];
      this.updateUI();
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    }
  }
  
  updateUI() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    
    const highPriority = this.notifications.filter(n => n.priority === 'high').length;
    
    // Update badge
    if (this.badge) {
      if (highPriority > 0) {
        this.badge.textContent = highPriority;
        this.badge.style.display = 'flex';
      } else {
        this.badge.style.display = 'none';
      }
    }
    
    // Update list
    if (this.notifications.length === 0) {
      list.innerHTML = '<div class="notification-empty">✅ No notifications</div>';
      return;
    }
    
    list.innerHTML = this.notifications.map(n => `
      <div class="notification-item ${n.priority}" data-entity="${n.entity || ''}" data-id="${n.entityId || ''}">
        <div class="notification-title">${n.title}</div>
        <div class="notification-message">${n.message}${n.date ? ` • ${n.date}` : ''}</div>
      </div>
    `).join('');
    
    // Add click handlers to navigate to entity
    list.querySelectorAll('.notification-item').forEach(item => {
      item.onclick = () => {
        const entity = item.dataset.entity;
        if (entity) {
          window.location.href = `/${entity}-dashboard.html`;
        }
      };
    });
  }
}

// ===================================================================
// AUTO-REFRESH MANAGER
// ===================================================================
class AutoRefreshManager {
  constructor() {
    this.interval = null;
    this.refreshRate = 5 * 60 * 1000; // 5 minutes default
    this.callbacks = [];
    this.isActive = false;
    this.lastRefresh = Date.now();
  }
  
  init() {
    // Check if user has preference saved
    const savedRate = localStorage.getItem('autoRefreshRate');
    if (savedRate) {
      this.refreshRate = parseInt(savedRate) * 60 * 1000;
    }
    
    this.createUI();
    this.start();
    
    // Pause when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    });
  }
  
  createUI() {
    // Add to page if there's a refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;
    
    // Create settings dropdown
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: inline-flex; align-items: center; gap: 8px;';
    wrapper.innerHTML = `
      <select id="autoRefreshSelect" style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-light, #e5e7eb); background: var(--card, #fff); font-size: 13px;">
        <option value="0">Auto-refresh: Off</option>
        <option value="1">Every 1 min</option>
        <option value="5" selected>Every 5 min</option>
        <option value="10">Every 10 min</option>
        <option value="30">Every 30 min</option>
      </select>
      <span id="lastRefreshTime" style="font-size: 12px; color: var(--text-secondary, #6b7280);"></span>
    `;
    
    refreshBtn.parentNode.insertBefore(wrapper, refreshBtn.nextSibling);
    
    const select = document.getElementById('autoRefreshSelect');
    const savedRate = localStorage.getItem('autoRefreshRate');
    if (savedRate) select.value = savedRate;
    
    select.onchange = () => {
      const minutes = parseInt(select.value);
      localStorage.setItem('autoRefreshRate', minutes);
      this.refreshRate = minutes * 60 * 1000;
      if (minutes === 0) {
        this.stop();
      } else {
        this.start();
      }
    };
    
    this.updateTimeDisplay();
    setInterval(() => this.updateTimeDisplay(), 10000);
  }
  
  updateTimeDisplay() {
    const el = document.getElementById('lastRefreshTime');
    if (!el) return;
    
    const ago = Math.floor((Date.now() - this.lastRefresh) / 1000);
    if (ago < 60) {
      el.textContent = `Updated ${ago}s ago`;
    } else {
      el.textContent = `Updated ${Math.floor(ago / 60)}m ago`;
    }
  }
  
  onRefresh(callback) {
    this.callbacks.push(callback);
  }
  
  start() {
    if (this.refreshRate === 0) return;
    this.stop();
    this.isActive = true;
    this.interval = setInterval(() => this.doRefresh(), this.refreshRate);
  }
  
  stop() {
    this.isActive = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  
  pause() {
    this.stop();
  }
  
  resume() {
    if (localStorage.getItem('autoRefreshRate') !== '0') {
      this.start();
    }
  }
  
  doRefresh() {
    this.lastRefresh = Date.now();
    this.updateTimeDisplay();
    this.callbacks.forEach(cb => {
      try { cb(); } catch (e) { console.warn('Refresh callback error:', e); }
    });
    // Also trigger page's own refresh if available
    if (typeof window.loadData === 'function') {
      window.loadData();
    }
  }
}

// ===================================================================
// ENHANCED ERROR HANDLER
// ===================================================================
class ErrorHandler {
  constructor() {
    this.retryCount = new Map();
    this.maxRetries = 3;
  }
  
  init() {
    // Override fetch to add retry logic
    const originalFetch = window.fetch;
    window.fetch = async (url, options = {}) => {
      const key = `${options.method || 'GET'}:${url}`;
      let attempts = 0;
      
      while (attempts <= this.maxRetries) {
        try {
          const response = await originalFetch(url, options);
          
          // Success - reset retry count
          this.retryCount.delete(key);
          
          // Handle specific errors with user-friendly messages
          if (!response.ok) {
            const errorData = await response.clone().json().catch(() => ({}));
            this.handleError(response.status, errorData, url);
          }
          
          return response;
        } catch (err) {
          attempts++;
          
          if (attempts > this.maxRetries) {
            this.showError('Network error. Please check your connection and try again.');
            throw err;
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(r => setTimeout(r, Math.pow(2, attempts) * 500));
        }
      }
    };
    
    // Add offline indicator
    this.createOfflineIndicator();
    
    window.addEventListener('online', () => this.updateOnlineStatus(true));
    window.addEventListener('offline', () => this.updateOnlineStatus(false));
  }
  
  handleError(status, data, url) {
    let message = data.error || 'An error occurred';
    
    switch (status) {
      case 400:
        message = data.error || 'Invalid request. Please check your input.';
        break;
      case 401:
        message = 'Session expired. Please log in again.';
        break;
      case 403:
        message = 'You do not have permission to perform this action.';
        break;
      case 404:
        message = 'The requested resource was not found.';
        break;
      case 423:
        message = data.error || 'Account is locked. Contact administrator.';
        break;
      case 429:
        message = 'Too many requests. Please wait a moment.';
        break;
      case 500:
        message = 'Server error. Please try again later.';
        break;
    }
    
    // Don't show error for background requests
    if (!url.includes('/api/notifications') && !url.includes('/api/refresh')) {
      this.showError(message);
    }
  }
  
  showError(message) {
    // Use existing notification system if available
    if (typeof showNotification === 'function') {
      showNotification(message, 'error');
    } else {
      // Fallback toast
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ef4444;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        animation: slideUp 0.3s ease;
      `;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }
  }
  
  createOfflineIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'offlineIndicator';
    indicator.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #f59e0b;
      color: white;
      text-align: center;
      padding: 8px;
      font-weight: 600;
      z-index: 10001;
      display: none;
    `;
    indicator.textContent = '⚠️ You are offline. Some features may not work.';
    document.body.appendChild(indicator);
  }
  
  updateOnlineStatus(isOnline) {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
      indicator.style.display = isOnline ? 'none' : 'block';
    }
    
    if (isOnline && typeof window.loadData === 'function') {
      // Refresh data when coming back online
      setTimeout(() => window.loadData(), 1000);
    }
  }
}

// ===================================================================
// INITIALIZE ALL ENHANCEMENTS
// ===================================================================
const notificationManager = new NotificationManager();
const autoRefreshManager = new AutoRefreshManager();
const errorHandler = new ErrorHandler();

document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if user is logged in
  const token = localStorage.getItem('token');
  if (!token) return;
  
  // Wait a bit for main page to load
  setTimeout(() => {
    notificationManager.init();
    autoRefreshManager.init();
    errorHandler.init();
  }, 500);
});

// Export for use in other scripts
window.notificationManager = notificationManager;
window.autoRefreshManager = autoRefreshManager;
window.errorHandler = errorHandler;
