/**
 * Recent Items Manager
 * Track and display recently viewed/edited records
 */

class RecentItems {
  constructor() {
    this.storageKey = 'travelops_recent_items';
    this.maxItems = 10;
    this.panel = null;
    this.init();
  }

  init() {
    this.createPanel();
    this.createToggleButton();
    this.loadFromStorage();
  }

  /**
   * Add item to recent history
   */
  add(item) {
    const {
      type,      // e.g., 'sales', 'tours', 'documents'
      id,
      title,
      subtitle,
      url,
      icon
    } = item;

    const recentItem = {
      type,
      id,
      title,
      subtitle,
      url: url || `/${type}-dashboard.html`,
      icon: icon || this.getDefaultIcon(type),
      timestamp: Date.now()
    };

    let items = this.getItems();
    
    // Remove existing entry for same item
    items = items.filter(i => !(i.type === type && i.id === id));
    
    // Add to beginning
    items.unshift(recentItem);
    
    // Limit to max items
    items = items.slice(0, this.maxItems);
    
    this.saveToStorage(items);
    this.renderItems();
  }

  /**
   * Get all recent items
   */
  getItems() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey)) || [];
    } catch {
      return [];
    }
  }

  /**
   * Save items to storage
   */
  saveToStorage(items) {
    localStorage.setItem(this.storageKey, JSON.stringify(items));
  }

  /**
   * Load items from storage
   */
  loadFromStorage() {
    this.renderItems();
  }

  /**
   * Clear all recent items
   */
  clear() {
    localStorage.removeItem(this.storageKey);
    this.renderItems();
    if (window.toast) {
      window.toast.success('Recent items cleared');
    }
  }

  /**
   * Get default icon for entity type
   */
  getDefaultIcon(type) {
    const icons = {
      sales: '💰',
      tours: '🧳',
      documents: '📄',
      tracking: '📦',
      targets: '🎯',
      telecom: '📞',
      hotel: '🏨',
      hotel_bookings: '🏨',
      overtime: '⏰',
      cruise: '🚢',
      outstanding: '📋',
      users: '👤',
      regions: '🌍'
    };
    return icons[type] || '📝';
  }

  /**
   * Create the recent items panel
   */
  createPanel() {
    if (document.getElementById('recentItemsPanel')) {
      this.panel = document.getElementById('recentItemsPanel');
      return;
    }

    this.panel = document.createElement('div');
    this.panel.id = 'recentItemsPanel';
    this.panel.className = 'recent-items-panel';
    this.panel.innerHTML = `
      <div class="recent-items-header">
        <h4>🕐 Recent Items</h4>
        <div class="recent-items-actions">
          <button class="recent-clear-btn" title="Clear history">🗑️</button>
          <button class="recent-close-btn" title="Close">&times;</button>
        </div>
      </div>
      <div class="recent-items-list"></div>
      <div class="recent-items-empty">
        <span class="empty-icon">📭</span>
        <p>No recent items yet</p>
        <small>Your recently viewed items will appear here</small>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Add styles
    this.addStyles();

    // Event listeners
    this.panel.querySelector('.recent-close-btn').addEventListener('click', () => this.close());
    this.panel.querySelector('.recent-clear-btn').addEventListener('click', () => this.clear());

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (this.panel.classList.contains('visible') && 
          !this.panel.contains(e.target) && 
          !e.target.closest('.recent-items-toggle')) {
        this.close();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panel.classList.contains('visible')) {
        this.close();
      }
    });
  }

  /**
   * Create toggle button
   */
  createToggleButton() {
    if (document.querySelector('.recent-items-toggle')) return;

    const btn = document.createElement('button');
    btn.className = 'recent-items-toggle';
    btn.innerHTML = '🕐';
    btn.title = 'Recent Items (Alt+R)';
    btn.setAttribute('aria-label', 'Recent Items');

    btn.addEventListener('click', () => this.toggle());

    document.body.appendChild(btn);

    // Keyboard shortcut Alt+R
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'r') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Render recent items list
   */
  renderItems() {
    const items = this.getItems();
    const list = this.panel.querySelector('.recent-items-list');
    const empty = this.panel.querySelector('.recent-items-empty');

    if (items.length === 0) {
      list.style.display = 'none';
      empty.style.display = 'flex';
      return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';

    list.innerHTML = items.map((item, index) => `
      <a href="${this.escapeHtml(item.url)}${item.id ? `?highlight=${item.id}` : ''}" 
         class="recent-item" 
         style="animation-delay: ${index * 0.05}s">
        <span class="recent-item-icon">${item.icon}</span>
        <div class="recent-item-info">
          <span class="recent-item-title">${this.escapeHtml(item.title)}</span>
          ${item.subtitle ? `<span class="recent-item-subtitle">${this.escapeHtml(item.subtitle)}</span>` : ''}
        </div>
        <span class="recent-item-time">${this.formatTime(item.timestamp)}</span>
      </a>
    `).join('');
  }

  /**
   * Format relative time
   */
  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
  }

  /**
   * Toggle panel visibility
   */
  toggle() {
    if (this.panel.classList.contains('visible')) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open panel
   */
  open() {
    this.renderItems();
    this.panel.classList.add('visible');
  }

  /**
   * Close panel
   */
  close() {
    this.panel.classList.remove('visible');
  }

  addStyles() {
    if (document.getElementById('recent-items-styles')) return;

    const style = document.createElement('style');
    style.id = 'recent-items-styles';
    style.textContent = `
      .recent-items-toggle {
        position: fixed;
        bottom: 80px;
        right: 24px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-size: 22px;
        cursor: pointer;
        z-index: 999;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .recent-items-toggle:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      }

      .recent-items-panel {
        position: fixed;
        top: 0;
        right: -400px;
        width: 380px;
        max-width: 100vw;
        height: 100vh;
        background: var(--card, #fff);
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
      }

      .recent-items-panel.visible {
        right: 0;
      }

      .recent-items-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .recent-items-header h4 {
        margin: 0;
        font-size: 18px;
        color: var(--text-primary, #1f2937);
      }

      .recent-items-actions {
        display: flex;
        gap: 8px;
      }

      .recent-items-actions button {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background 0.2s;
      }

      .recent-items-actions button:hover {
        background: var(--bg-alt, #f3f4f6);
      }

      .recent-items-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }

      .recent-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 10px;
        text-decoration: none;
        color: inherit;
        transition: background 0.2s;
        animation: fadeInRight 0.3s ease backwards;
      }

      .recent-item:hover {
        background: var(--bg-alt, #f3f4f6);
      }

      .recent-item-icon {
        font-size: 24px;
        flex-shrink: 0;
      }

      .recent-item-info {
        flex: 1;
        min-width: 0;
      }

      .recent-item-title {
        display: block;
        font-weight: 600;
        color: var(--text-primary, #1f2937);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .recent-item-subtitle {
        display: block;
        font-size: 12px;
        color: var(--muted, #6b7280);
        margin-top: 2px;
      }

      .recent-item-time {
        font-size: 11px;
        color: var(--muted, #6b7280);
        flex-shrink: 0;
      }

      .recent-items-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--muted, #6b7280);
        padding: 40px;
        text-align: center;
      }

      .recent-items-empty .empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }

      .recent-items-empty p {
        margin: 0 0 4px 0;
        font-weight: 600;
      }

      .recent-items-empty small {
        opacity: 0.7;
      }

      @keyframes fadeInRight {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* Dark mode */
      [data-theme="dark"] .recent-items-toggle {
        background: var(--card, #1e293b);
        border-color: var(--border-light, #334155);
      }

      [data-theme="dark"] .recent-items-panel {
        background: var(--card, #1e293b);
      }

      [data-theme="dark"] .recent-item:hover {
        background: #334155;
      }

      /* Mobile */
      @media (max-width: 768px) {
        .recent-items-panel {
          width: 100%;
        }
        
        .recent-items-toggle {
          bottom: 20px;
          right: 20px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Global instance
window.recentItems = new RecentItems();
