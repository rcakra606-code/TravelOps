// ============================================
// DASHBOARD WIDGETS MODULE
// Customizable drag-and-drop widget layout
// ============================================

class DashboardWidgets {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.widgets = [];
    this.layout = [];
    this.editMode = false;
    this.draggedWidget = null;
    this.storageKey = 'dashboard_widget_layout';
    
    this.availableWidgets = {
      'quick-stats': {
        id: 'quick-stats',
        title: 'Quick Stats',
        icon: '📊',
        size: 'full',
        component: 'QuickStats'
      },
      'recent-tours': {
        id: 'recent-tours',
        title: 'Recent Tours',
        icon: '✈️',
        size: 'half',
        component: 'RecentTours'
      },
      'recent-sales': {
        id: 'recent-sales',
        title: 'Recent Sales',
        icon: '💰',
        size: 'half',
        component: 'RecentSales'
      },
      'tour-calendar': {
        id: 'tour-calendar',
        title: 'Tour Calendar',
        icon: '📅',
        size: 'half',
        component: 'TourCalendar'
      },
      'staff-leaderboard': {
        id: 'staff-leaderboard',
        title: 'Staff Leaderboard',
        icon: '🏆',
        size: 'half',
        component: 'StaffLeaderboard'
      },
      'yoy-analytics': {
        id: 'yoy-analytics',
        title: 'Year-over-Year',
        icon: '📈',
        size: 'full',
        component: 'YoYAnalytics'
      },
      'upcoming-departures': {
        id: 'upcoming-departures',
        title: 'Upcoming Departures',
        icon: '🛫',
        size: 'half',
        component: 'UpcomingDepartures'
      },
      'pending-documents': {
        id: 'pending-documents',
        title: 'Pending Documents',
        icon: '📄',
        size: 'half',
        component: 'PendingDocuments'
      }
    };
  }
  
  init() {
    this.loadLayout();
    this.render();
    this.addStyles();
  }
  
  loadLayout() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.layout = JSON.parse(saved);
      } else {
        // Default layout
        this.layout = ['quick-stats', 'recent-tours', 'recent-sales', 'upcoming-departures'];
      }
    } catch (e) {
      this.layout = ['quick-stats', 'recent-tours', 'recent-sales'];
    }
  }
  
  saveLayout() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.layout));
  }
  
  render() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="widgets-header">
        <h2>Dashboard</h2>
        <div class="widgets-actions">
          <button class="widget-btn" id="addWidgetBtn">
            <span>➕</span> Add Widget
          </button>
          <button class="widget-btn" id="editLayoutBtn">
            <span>✏️</span> Edit Layout
          </button>
        </div>
      </div>
      <div class="widgets-grid ${this.editMode ? 'edit-mode' : ''}" id="widgetsGrid">
        ${this.renderWidgets()}
      </div>
      <div class="widget-selector" id="widgetSelector" style="display: none;">
        <div class="selector-overlay"></div>
        <div class="selector-content">
          <h3>Add Widget</h3>
          <div class="selector-grid">
            ${this.renderWidgetOptions()}
          </div>
          <button class="selector-close" id="closeSelector">Close</button>
        </div>
      </div>
    `;
    
    this.bindEvents();
    this.initializeWidgetComponents();
  }
  
  renderWidgets() {
    return this.layout.map((widgetId, index) => {
      const widget = this.availableWidgets[widgetId];
      if (!widget) return '';
      
      return `
        <div class="widget-card ${widget.size}" 
             data-widget-id="${widget.id}" 
             data-index="${index}"
             draggable="${this.editMode}">
          <div class="widget-header">
            <span class="widget-icon">${widget.icon}</span>
            <span class="widget-title">${widget.title}</span>
            ${this.editMode ? `
              <div class="widget-controls">
                <button class="widget-control drag-handle" title="Drag to reorder">⠿</button>
                <button class="widget-control remove-widget" data-id="${widget.id}" title="Remove">✕</button>
              </div>
            ` : ''}
          </div>
          <div class="widget-content" id="widget-content-${widget.id}">
            <div class="widget-loading">Loading...</div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  renderWidgetOptions() {
    const activeIds = new Set(this.layout);
    
    return Object.values(this.availableWidgets).map(widget => {
      const isActive = activeIds.has(widget.id);
      
      return `
        <div class="widget-option ${isActive ? 'active' : ''}" data-add-widget="${widget.id}">
          <span class="option-icon">${widget.icon}</span>
          <span class="option-title">${widget.title}</span>
          <span class="option-status">${isActive ? '✓ Added' : '+ Add'}</span>
        </div>
      `;
    }).join('');
  }
  
  bindEvents() {
    // Add widget button
    document.getElementById('addWidgetBtn')?.addEventListener('click', () => {
      document.getElementById('widgetSelector').style.display = 'flex';
    });
    
    // Edit layout button
    document.getElementById('editLayoutBtn')?.addEventListener('click', () => {
      this.editMode = !this.editMode;
      document.getElementById('editLayoutBtn').innerHTML = this.editMode 
        ? '<span>✓</span> Done Editing' 
        : '<span>✏️</span> Edit Layout';
      this.render();
    });
    
    // Close selector
    document.getElementById('closeSelector')?.addEventListener('click', () => {
      document.getElementById('widgetSelector').style.display = 'none';
    });
    
    document.querySelector('.selector-overlay')?.addEventListener('click', () => {
      document.getElementById('widgetSelector').style.display = 'none';
    });
    
    // Widget options
    document.querySelectorAll('[data-add-widget]').forEach(el => {
      el.addEventListener('click', () => {
        const widgetId = el.dataset.addWidget;
        if (this.layout.includes(widgetId)) {
          this.layout = this.layout.filter(id => id !== widgetId);
        } else {
          this.layout.push(widgetId);
        }
        this.saveLayout();
        this.render();
      });
    });
    
    // Remove widget buttons
    document.querySelectorAll('.remove-widget').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const widgetId = el.dataset.id;
        this.layout = this.layout.filter(id => id !== widgetId);
        this.saveLayout();
        this.render();
      });
    });
    
    // Drag and drop
    if (this.editMode) {
      this.initDragAndDrop();
    }
  }
  
  initDragAndDrop() {
    const grid = document.getElementById('widgetsGrid');
    const cards = grid?.querySelectorAll('.widget-card');
    
    cards?.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        this.draggedWidget = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        this.draggedWidget = null;
      });
      
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedWidget && this.draggedWidget !== card) {
          card.classList.add('drag-over');
        }
      });
      
      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });
      
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        
        if (this.draggedWidget && this.draggedWidget !== card) {
          const fromIndex = parseInt(this.draggedWidget.dataset.index);
          const toIndex = parseInt(card.dataset.index);
          
          // Swap positions
          const temp = this.layout[fromIndex];
          this.layout[fromIndex] = this.layout[toIndex];
          this.layout[toIndex] = temp;
          
          this.saveLayout();
          this.render();
        }
      });
    });
  }
  
  async initializeWidgetComponents() {
    for (const widgetId of this.layout) {
      const widget = this.availableWidgets[widgetId];
      if (!widget) continue;
      
      const contentEl = document.getElementById(`widget-content-${widgetId}`);
      if (!contentEl) continue;
      
      try {
        switch (widget.component) {
          case 'QuickStats':
            await this.renderQuickStats(contentEl);
            break;
          case 'RecentTours':
            await this.renderRecentTours(contentEl);
            break;
          case 'RecentSales':
            await this.renderRecentSales(contentEl);
            break;
          case 'UpcomingDepartures':
            await this.renderUpcomingDepartures(contentEl);
            break;
          case 'PendingDocuments':
            await this.renderPendingDocuments(contentEl);
            break;
          case 'TourCalendar':
            contentEl.id = 'tourCalendarWidget';
            if (window.TourCalendar) {
              new TourCalendar('tourCalendarWidget');
            } else {
              contentEl.innerHTML = '<div class="widget-empty">Calendar module not loaded</div>';
            }
            break;
          case 'StaffLeaderboard':
            contentEl.id = 'staffLeaderboardWidget';
            if (window.StaffLeaderboard) {
              const lb = new StaffLeaderboard('staffLeaderboardWidget');
              lb.init();
            } else {
              contentEl.innerHTML = '<div class="widget-empty">Leaderboard module not loaded</div>';
            }
            break;
          case 'YoYAnalytics':
            contentEl.id = 'yoyAnalyticsWidget';
            if (window.YearOverYearAnalytics) {
              const yoy = new YearOverYearAnalytics();
              await yoy.loadData();
              yoy.renderWidget('yoyAnalyticsWidget');
            } else {
              contentEl.innerHTML = '<div class="widget-empty">Analytics module not loaded</div>';
            }
            break;
          default:
            contentEl.innerHTML = '<div class="widget-empty">Widget not configured</div>';
        }
      } catch (err) {
        contentEl.innerHTML = `<div class="widget-error">Error loading widget</div>`;
        console.error(`Error loading widget ${widgetId}:`, err);
      }
    }
  }
  
  async fetchAPI(endpoint) {
    const token = localStorage.getItem('token');
    const res = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  }
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  }
  
  async renderQuickStats(el) {
    const [tours, sales] = await Promise.all([
      this.fetchAPI('/api/tours'),
      this.fetchAPI('/api/sales')
    ]);
    
    const now = new Date();
    const thisMonth = tours.filter(t => {
      if (!t.departure_date) return false;
      const d = new Date(t.departure_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    
    const totalSales = sales.reduce((s, sale) => s + (parseFloat(sale.nominal) || 0), 0);
    const totalPax = tours.reduce((s, t) => s + (parseInt(t.jumlah_peserta) || 0), 0);
    
    el.innerHTML = `
      <div class="quick-stats-grid">
        <div class="quick-stat">
          <span class="quick-stat-icon">✈️</span>
          <div class="quick-stat-info">
            <span class="quick-stat-value">${tours.length}</span>
            <span class="quick-stat-label">Total Tours</span>
          </div>
        </div>
        <div class="quick-stat">
          <span class="quick-stat-icon">📅</span>
          <div class="quick-stat-info">
            <span class="quick-stat-value">${thisMonth.length}</span>
            <span class="quick-stat-label">This Month</span>
          </div>
        </div>
        <div class="quick-stat">
          <span class="quick-stat-icon">💰</span>
          <div class="quick-stat-info">
            <span class="quick-stat-value">${this.formatCurrency(totalSales)}</span>
            <span class="quick-stat-label">Total Sales</span>
          </div>
        </div>
        <div class="quick-stat">
          <span class="quick-stat-icon">👥</span>
          <div class="quick-stat-info">
            <span class="quick-stat-value">${totalPax}</span>
            <span class="quick-stat-label">Total Passengers</span>
          </div>
        </div>
      </div>
    `;
  }
  
  async renderRecentTours(el) {
    const tours = await this.fetchAPI('/api/tours');
    const recent = tours.slice(0, 5);
    
    el.innerHTML = `
      <div class="recent-list">
        ${recent.map(t => `
          <div class="recent-item">
            <span class="recent-icon">✈️</span>
            <div class="recent-info">
              <span class="recent-title">${t.tour_code || t.booking_code || 'Tour'}</span>
              <span class="recent-subtitle">${t.lead_passenger || 'N/A'} • ${t.jumlah_peserta || 0} pax</span>
            </div>
            <span class="recent-date">${t.departure_date ? new Date(t.departure_date).toLocaleDateString() : '-'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  async renderRecentSales(el) {
    const sales = await this.fetchAPI('/api/sales');
    const recent = sales.slice(0, 5);
    
    el.innerHTML = `
      <div class="recent-list">
        ${recent.map(s => `
          <div class="recent-item">
            <span class="recent-icon">💰</span>
            <div class="recent-info">
              <span class="recent-title">${s.sales_name || s.customer_name || 'Sale'}</span>
              <span class="recent-subtitle">${this.formatCurrency(s.nominal || 0)}</span>
            </div>
            <span class="recent-date">${s.tgl_transfer ? new Date(s.tgl_transfer).toLocaleDateString() : '-'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  async renderUpcomingDepartures(el) {
    const tours = await this.fetchAPI('/api/tours');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const upcoming = tours
      .filter(t => t.departure_date && new Date(t.departure_date) >= now)
      .sort((a, b) => new Date(a.departure_date) - new Date(b.departure_date))
      .slice(0, 5);
    
    el.innerHTML = `
      <div class="recent-list">
        ${upcoming.length === 0 ? '<div class="widget-empty">No upcoming departures</div>' : ''}
        ${upcoming.map(t => {
          const depDate = new Date(t.departure_date);
          const daysUntil = Math.ceil((depDate - now) / (1000 * 60 * 60 * 24));
          const urgency = daysUntil <= 3 ? 'urgent' : daysUntil <= 7 ? 'soon' : 'normal';
          
          return `
            <div class="recent-item">
              <span class="countdown-badge ${urgency}">${daysUntil}d</span>
              <div class="recent-info">
                <span class="recent-title">${t.tour_code || t.booking_code || 'Tour'}</span>
                <span class="recent-subtitle">${t.lead_passenger || 'N/A'} • ${t.staff_name || 'N/A'}</span>
              </div>
              <span class="recent-date">${depDate.toLocaleDateString()}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  async renderPendingDocuments(el) {
    try {
      const docs = await this.fetchAPI('/api/documents');
      const pending = docs.filter(d => d.status === 'pending' || !d.status).slice(0, 5);
      
      el.innerHTML = `
        <div class="recent-list">
          ${pending.length === 0 ? '<div class="widget-empty">No pending documents</div>' : ''}
          ${pending.map(d => `
            <div class="recent-item">
              <span class="recent-icon">📄</span>
              <div class="recent-info">
                <span class="recent-title">${d.name || d.type || 'Document'}</span>
                <span class="recent-subtitle">${d.customer_name || d.tour_code || 'N/A'}</span>
              </div>
              <span class="status-badge pending">Pending</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      el.innerHTML = '<div class="widget-empty">Documents not available</div>';
    }
  }
  
  addStyles() {
    if (document.getElementById('dashboardWidgetsStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'dashboardWidgetsStyles';
    style.textContent = `
      .widgets-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
      }
      .widgets-header h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
      }
      .widgets-actions {
        display: flex;
        gap: 12px;
      }
      .widget-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        background: var(--card, #fff);
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .widget-btn:hover {
        background: var(--bg-alt, #f9fafb);
        border-color: var(--primary, #3b82f6);
      }
      .widgets-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
      }
      .widgets-grid.edit-mode .widget-card {
        cursor: grab;
      }
      .widgets-grid.edit-mode .widget-card.dragging {
        opacity: 0.5;
        cursor: grabbing;
      }
      .widgets-grid.edit-mode .widget-card.drag-over {
        border: 2px dashed var(--primary, #3b82f6);
      }
      .widget-card {
        background: var(--card, #fff);
        border-radius: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        overflow: hidden;
        transition: all 0.2s;
      }
      .widget-card.full {
        grid-column: span 2;
      }
      .widget-card.half {
        grid-column: span 1;
      }
      .widget-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
        background: var(--bg-alt, #f9fafb);
      }
      .widget-icon {
        font-size: 20px;
      }
      .widget-title {
        flex: 1;
        font-weight: 600;
        font-size: 15px;
      }
      .widget-controls {
        display: flex;
        gap: 4px;
      }
      .widget-control {
        width: 28px;
        height: 28px;
        border: none;
        background: var(--border-light, #e5e7eb);
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .widget-control:hover {
        background: var(--primary, #3b82f6);
        color: white;
      }
      .widget-content {
        padding: 20px;
        min-height: 150px;
      }
      .widget-loading, .widget-empty, .widget-error {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100px;
        color: var(--text-secondary, #6b7280);
      }
      .widget-error { color: #ef4444; }
      
      /* Widget selector */
      .widget-selector {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .selector-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.5);
      }
      .selector-content {
        position: relative;
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 24px;
        width: 90%;
        max-width: 500px;
      }
      .selector-content h3 {
        margin: 0 0 20px 0;
      }
      .selector-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }
      .widget-option {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border: 2px solid var(--border-light, #e5e7eb);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .widget-option:hover {
        border-color: var(--primary, #3b82f6);
      }
      .widget-option.active {
        background: #d1fae5;
        border-color: #10b981;
      }
      .option-icon { font-size: 24px; }
      .option-title { flex: 1; font-weight: 500; }
      .option-status { font-size: 12px; color: var(--text-secondary); }
      .widget-option.active .option-status { color: #059669; }
      .selector-close {
        width: 100%;
        padding: 12px;
        border: none;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
      }
      
      /* Quick stats */
      .quick-stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
      }
      .quick-stat {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
      }
      .quick-stat-icon { font-size: 28px; }
      .quick-stat-info { display: flex; flex-direction: column; }
      .quick-stat-value { font-size: 20px; font-weight: 700; }
      .quick-stat-label { font-size: 12px; color: var(--text-secondary); }
      
      /* Recent list */
      .recent-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .recent-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
      }
      .recent-icon { font-size: 20px; }
      .recent-info { flex: 1; display: flex; flex-direction: column; }
      .recent-title { font-weight: 500; font-size: 14px; }
      .recent-subtitle { font-size: 12px; color: var(--text-secondary); }
      .recent-date { font-size: 12px; color: var(--text-secondary); }
      .countdown-badge {
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
      }
      .countdown-badge.urgent { background: #fee2e2; color: #dc2626; }
      .countdown-badge.soon { background: #fef3c7; color: #d97706; }
      .countdown-badge.normal { background: #d1fae5; color: #059669; }
      .status-badge.pending { background: #fef3c7; color: #d97706; padding: 4px 10px; border-radius: 20px; font-size: 11px; }
      
      @media (max-width: 768px) {
        .widgets-grid {
          grid-template-columns: 1fr;
        }
        .widget-card.full, .widget-card.half {
          grid-column: span 1;
        }
        .quick-stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .selector-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Export
window.DashboardWidgets = DashboardWidgets;
