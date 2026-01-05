/**
 * Dashboard Analytics Module
 * Real-time KPIs and metrics monitoring
 */

class DashboardAnalytics {
  constructor() {
    this.refreshInterval = 60000; // 1 minute
    this.init();
  }

  init() {
    this.addStyles();
    this.addAnalyticsWidget();
    this.startAutoRefresh();
  }

  addAnalyticsWidget() {
    setTimeout(() => {
      // Add floating analytics widget
      if (document.getElementById('analyticsWidget')) return;

      const widget = document.createElement('div');
      widget.id = 'analyticsWidget';
      widget.className = 'analytics-widget collapsed';
      widget.innerHTML = `
        <button class="analytics-toggle" id="analyticsToggle">
          <span class="toggle-icon">📈</span>
          <span class="toggle-text">Analytics</span>
        </button>
        <div class="analytics-panel" id="analyticsPanel">
          <div class="analytics-header">
            <h4>Live Metrics</h4>
            <span class="refresh-indicator" id="refreshIndicator">●</span>
          </div>
          <div class="analytics-content" id="analyticsContent">
            Loading...
          </div>
        </div>
      `;

      document.body.appendChild(widget);

      document.getElementById('analyticsToggle')?.addEventListener('click', () => {
        widget.classList.toggle('collapsed');
        if (!widget.classList.contains('collapsed')) {
          this.loadAnalytics();
        }
      });

      // Load initial data
      this.loadAnalytics();
    }, 1500);
  }

  async loadAnalytics() {
    const content = document.getElementById('analyticsContent');
    const indicator = document.getElementById('refreshIndicator');
    if (!content) return;

    indicator?.classList.add('refreshing');

    try {
      const [tours, sales, hotels, overtime] = await Promise.all([
        window.fetchJson?.('/api/tours') || [],
        window.fetchJson?.('/api/sales') || [],
        window.fetchJson?.('/api/hotel_bookings') || [],
        window.fetchJson?.('/api/overtime') || []
      ]);

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Calculate metrics
      const todayTours = tours.filter(t => new Date(t.date) >= today).length;
      const todaySales = sales.filter(s => new Date(s.date) >= today).length;
      
      const weekTours = tours.filter(t => new Date(t.date) >= thisWeek).length;
      const weekSales = sales.filter(s => new Date(s.date) >= thisWeek).length;
      
      const monthRevenue = tours.filter(t => new Date(t.date) >= thisMonth)
        .reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0) +
        sales.filter(s => new Date(s.date) >= thisMonth)
        .reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

      const pendingTours = tours.filter(t => 
        t.status?.toLowerCase() === 'pending'
      ).length;

      const upcomingTours = tours.filter(t => {
        const date = new Date(t.date);
        return date >= today && date <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      }).length;

      // Calculate trend
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastMonthRevenue = tours.filter(t => {
        const date = new Date(t.date);
        return date >= lastMonth && date <= lastMonthEnd;
      }).reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0) +
      sales.filter(s => {
        const date = new Date(s.date);
        return date >= lastMonth && date <= lastMonthEnd;
      }).reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

      const trend = lastMonthRevenue > 0 ? 
        ((monthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1) : 0;

      content.innerHTML = `
        <div class="metric-row">
          <div class="mini-metric">
            <span class="metric-icon">📅</span>
            <div class="metric-data">
              <span class="metric-value">${todayTours + todaySales}</span>
              <span class="metric-label">Today</span>
            </div>
          </div>
          <div class="mini-metric">
            <span class="metric-icon">📊</span>
            <div class="metric-data">
              <span class="metric-value">${weekTours + weekSales}</span>
              <span class="metric-label">This Week</span>
            </div>
          </div>
        </div>

        <div class="metric-row">
          <div class="mini-metric highlight">
            <span class="metric-icon">💰</span>
            <div class="metric-data">
              <span class="metric-value">$${(monthRevenue / 1000).toFixed(1)}k</span>
              <span class="metric-label">Month Revenue</span>
            </div>
          </div>
          <div class="mini-metric ${trend >= 0 ? 'positive' : 'negative'}">
            <span class="metric-icon">${trend >= 0 ? '📈' : '📉'}</span>
            <div class="metric-data">
              <span class="metric-value">${trend >= 0 ? '+' : ''}${trend}%</span>
              <span class="metric-label">vs Last Month</span>
            </div>
          </div>
        </div>

        <div class="metric-divider"></div>

        <div class="alert-metrics">
          ${pendingTours > 0 ? `
            <div class="alert-metric warning">
              <span>⏳ ${pendingTours} pending tours</span>
            </div>
          ` : ''}
          ${upcomingTours > 0 ? `
            <div class="alert-metric info">
              <span>📆 ${upcomingTours} tours this week</span>
            </div>
          ` : ''}
        </div>

        <div class="analytics-timestamp">
          Updated: ${now.toLocaleTimeString()}
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="analytics-error">Failed to load</div>`;
    } finally {
      indicator?.classList.remove('refreshing');
    }
  }

  startAutoRefresh() {
    setInterval(() => {
      const widget = document.getElementById('analyticsWidget');
      if (widget && !widget.classList.contains('collapsed')) {
        this.loadAnalytics();
      }
    }, this.refreshInterval);
  }

  addStyles() {
    if (document.getElementById('dashboardAnalyticsStyles')) return;

    const style = document.createElement('style');
    style.id = 'dashboardAnalyticsStyles';
    style.textContent = `
      .analytics-widget {
        position: fixed;
        bottom: 140px;
        right: 24px;
        z-index: 998;
        transition: all 0.3s ease;
      }

      .analytics-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
        font-weight: 600;
        transition: all 0.2s;
      }

      .analytics-widget.collapsed .analytics-panel {
        display: none;
      }

      .analytics-widget:not(.collapsed) .analytics-toggle {
        border-radius: 12px 12px 0 0;
      }

      .analytics-panel {
        background: var(--card, #fff);
        border-radius: 0 0 12px 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        width: 280px;
        overflow: hidden;
      }

      .analytics-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--bg-alt, #f8fafc);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .analytics-header h4 {
        margin: 0;
        font-size: 14px;
      }

      .refresh-indicator {
        color: #10b981;
        font-size: 12px;
      }

      .refresh-indicator.refreshing {
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }

      .analytics-content {
        padding: 16px;
      }

      .metric-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }

      .mini-metric {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: var(--bg-alt, #f8fafc);
        border-radius: 10px;
      }

      .mini-metric.highlight {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
      }

      .mini-metric.positive {
        background: #dcfce7;
      }

      .mini-metric.negative {
        background: #fee2e2;
      }

      .metric-icon {
        font-size: 20px;
      }

      .metric-data {
        display: flex;
        flex-direction: column;
      }

      .mini-metric .metric-value {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
      }

      .mini-metric .metric-label {
        font-size: 10px;
        opacity: 0.8;
      }

      .metric-divider {
        height: 1px;
        background: var(--border-light, #e5e7eb);
        margin: 12px 0;
      }

      .alert-metrics {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .alert-metric {
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
      }

      .alert-metric.warning {
        background: #fef3c7;
        color: #92400e;
      }

      .alert-metric.info {
        background: #dbeafe;
        color: #1e40af;
      }

      .analytics-timestamp {
        margin-top: 12px;
        font-size: 10px;
        color: var(--text-secondary, #94a3b8);
        text-align: center;
      }

      /* Dark mode */
      [data-theme="dark"] .analytics-panel {
        background: var(--card, #1e293b);
      }

      [data-theme="dark"] .analytics-header {
        background: var(--bg-alt, #0f172a);
      }

      [data-theme="dark"] .mini-metric {
        background: var(--bg-alt, #0f172a);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.dashboardAnalytics = new DashboardAnalytics();
