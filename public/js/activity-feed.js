/**
 * Activity Feed / Recent Activity
 * Show real-time activity across the system
 */

class ActivityFeed {
  constructor() {
    this.maxItems = 50;
    this.activities = [];
    this.init();
  }

  init() {
    this.loadActivities();
    this.addStyles();
    this.addActivityButton();
    this.trackActivity();
  }

  addActivityButton() {
    setTimeout(() => {
      // Don't add on login/logout pages
      if (window.location.pathname.includes('/login.html') || window.location.pathname.includes('/logout.html')) return;
      
      // Check if already exists
      if (document.getElementById('activityFeedBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'activityFeedBtn';
      btn.className = 'activity-feed-btn';
      btn.innerHTML = '🔔';
      btn.title = 'Recent Activity';
      btn.addEventListener('click', () => this.showFeed());

      document.body.appendChild(btn);

      // Add unread badge
      const unread = this.getUnreadCount();
      if (unread > 0) {
        this.updateBadge(unread);
      }
    }, 1000);
  }

  trackActivity() {
    // Track CRUD operations
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const options = args[1] || {};
        const method = options.method?.toUpperCase() || 'GET';

        if (url?.includes('/api/') && ['POST', 'PUT', 'DELETE'].includes(method)) {
          const entity = url.split('/api/')[1]?.split('/')[0];
          const action = method === 'POST' ? 'created' : method === 'PUT' ? 'updated' : 'deleted';
          
          this.addActivity({
            type: action,
            entity: entity,
            user: localStorage.getItem('username') || 'User',
            timestamp: new Date().toISOString()
          });
        }
      } catch (e) {
        // Ignore tracking errors
      }

      return response;
    };

    // Track page views
    this.addActivity({
      type: 'viewed',
      entity: this.getPageName(),
      user: localStorage.getItem('username') || 'User',
      timestamp: new Date().toISOString()
    });
  }

  getPageName() {
    const path = window.location.pathname;
    const pageName = path.split('/').pop()?.replace('.html', '') || 'dashboard';
    return pageName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  addActivity(activity) {
    this.activities.unshift({
      ...activity,
      id: Date.now() + Math.random()
    });

    if (this.activities.length > this.maxItems) {
      this.activities = this.activities.slice(0, this.maxItems);
    }

    this.saveActivities();
    this.updateBadge(this.getUnreadCount() + 1);
  }

  loadActivities() {
    const saved = localStorage.getItem('travelops_activities');
    if (saved) {
      this.activities = JSON.parse(saved);
    }
  }

  saveActivities() {
    localStorage.setItem('travelops_activities', JSON.stringify(this.activities));
  }

  getUnreadCount() {
    const lastViewed = localStorage.getItem('travelops_activity_lastviewed') || 0;
    return this.activities.filter(a => new Date(a.timestamp).getTime() > lastViewed).length;
  }

  updateBadge(count) {
    let badge = document.getElementById('activityBadge');
    const btn = document.getElementById('activityFeedBtn');
    if (!btn) return;

    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'activityBadge';
        btn.appendChild(badge);
      }
      badge.textContent = count > 9 ? '9+' : count;
    } else if (badge) {
      badge.remove();
    }
  }

  showFeed() {
    // Mark as viewed
    localStorage.setItem('travelops_activity_lastviewed', Date.now().toString());
    this.updateBadge(0);

    document.getElementById('activityFeedModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'activityFeedModal';
    modal.className = 'activity-modal';
    modal.innerHTML = `
      <div class="activity-content">
        <div class="activity-header">
          <h3>🔔 Recent Activity</h3>
          <div class="activity-actions">
            <button class="clear-activity-btn" id="clearActivityBtn">Clear All</button>
            <button class="activity-close-btn" id="closeActivityModal">&times;</button>
          </div>
        </div>
        <div class="activity-list" id="activityList">
          ${this.activities.length === 0 ? `
            <div class="empty-activity">
              <span>📭</span>
              <p>No recent activity</p>
            </div>
          ` : this.activities.map(a => this.renderActivity(a)).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    document.getElementById('closeActivityModal')?.addEventListener('click', () => this.closeModal());
    document.getElementById('clearActivityBtn')?.addEventListener('click', () => {
      this.activities = [];
      this.saveActivities();
      document.getElementById('activityList').innerHTML = `
        <div class="empty-activity">
          <span>📭</span>
          <p>No recent activity</p>
        </div>
      `;
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });
  }

  renderActivity(activity) {
    const icons = {
      created: '➕',
      updated: '✏️',
      deleted: '🗑️',
      viewed: '👁️'
    };

    const colors = {
      created: '#10b981',
      updated: '#3b82f6',
      deleted: '#ef4444',
      viewed: '#6b7280'
    };

    const timeAgo = this.timeAgo(activity.timestamp);

    return `
      <div class="activity-item" style="--action-color: ${colors[activity.type] || '#6b7280'}">
        <span class="activity-icon">${icons[activity.type] || '📌'}</span>
        <div class="activity-details">
          <span class="activity-text">
            <strong>${activity.user}</strong> ${activity.type} 
            <span class="activity-entity">${activity.entity}</span>
          </span>
          <span class="activity-time">${timeAgo}</span>
        </div>
      </div>
    `;
  }

  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  closeModal() {
    const modal = document.getElementById('activityFeedModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  addStyles() {
    if (document.getElementById('activityFeedStyles')) return;

    const style = document.createElement('style');
    style.id = 'activityFeedStyles';
    style.textContent = `
      /* Activity Feed Button */
      .activity-feed-btn {
        position: fixed;
        bottom: 140px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        color: white;
        border: none;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
        z-index: 999;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .activity-feed-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
      }

      .activity-feed-btn #activityBadge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ef4444;
        color: white;
        font-size: 10px;
        font-weight: 700;
        min-width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
      }

      .activity-modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
        padding: 20px;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s;
        backdrop-filter: blur(4px);
      }

      .activity-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .activity-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 380px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
        transform: translateX(50px);
        transition: transform 0.3s ease;
      }

      .activity-modal.show .activity-content {
        transform: translateX(0);
      }

      .activity-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        color: white;
      }

      .activity-header h3 {
        margin: 0;
        font-size: 16px;
      }

      .activity-actions {
        display: flex;
        gap: 8px;
      }

      .clear-activity-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
      }

      .activity-close-btn {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 6px;
        font-size: 18px;
        cursor: pointer;
      }

      .activity-list {
        overflow-y: auto;
        flex: 1;
        padding: 12px;
      }

      .activity-item {
        display: flex;
        gap: 12px;
        padding: 12px;
        border-radius: 10px;
        margin-bottom: 8px;
        background: var(--bg-alt, #f9fafb);
        border-left: 3px solid var(--action-color);
      }

      .activity-icon {
        width: 32px;
        height: 32px;
        background: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
      }

      .activity-details {
        flex: 1;
        min-width: 0;
      }

      .activity-text {
        display: block;
        font-size: 13px;
        line-height: 1.4;
        color: var(--text, #1f2937);
      }

      .activity-entity {
        color: var(--primary, #3b82f6);
        font-weight: 500;
      }

      .activity-time {
        font-size: 11px;
        color: var(--text-secondary, #6b7280);
      }

      .empty-activity {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-secondary, #6b7280);
      }

      .empty-activity span {
        font-size: 48px;
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.activityFeed = new ActivityFeed();
