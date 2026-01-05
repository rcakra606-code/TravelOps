/**
 * Staff Management Module
 * Manage staff, roles, permissions, and workload
 */

class StaffManagement {
  constructor() {
    this.init();
  }

  init() {
    this.addStyles();
    this.addManagementButton();
  }

  addManagementButton() {
    setTimeout(() => {
      const header = document.querySelector('.header-actions, .header > div:last-child');
      if (!header || document.getElementById('staffMgmtBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'staffMgmtBtn';
      btn.className = 'btn staff-mgmt-btn';
      btn.innerHTML = '👥 Staff';
      btn.title = 'Staff Management';
      btn.addEventListener('click', () => this.showStaffPanel());
      header.appendChild(btn);
    }, 1000);
  }

  async showStaffPanel() {
    document.getElementById('staffMgmtModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'staffMgmtModal';
    modal.className = 'staff-mgmt-modal';
    modal.innerHTML = `
      <div class="staff-mgmt-content">
        <div class="staff-mgmt-header">
          <h3>👥 Staff Management</h3>
          <button class="staff-close-btn" id="closeStaffMgmt">&times;</button>
        </div>
        <div class="staff-mgmt-body">
          <div class="staff-tabs">
            <button class="staff-tab active" data-tab="overview">Overview</button>
            <button class="staff-tab" data-tab="workload">Workload</button>
            <button class="staff-tab" data-tab="schedule">Schedule</button>
            <button class="staff-tab" data-tab="targets">Targets</button>
          </div>

          <div class="staff-tab-content" id="overviewTab">
            <div class="staff-summary" id="staffSummary">
              Loading...
            </div>
          </div>

          <div class="staff-tab-content" id="workloadTab" style="display:none;">
            <div class="workload-content" id="workloadContent">
              Loading...
            </div>
          </div>

          <div class="staff-tab-content" id="scheduleTab" style="display:none;">
            <div class="schedule-content" id="scheduleContent">
              Loading...
            </div>
          </div>

          <div class="staff-tab-content" id="targetsTab" style="display:none;">
            <div class="targets-content" id="targetsContent">
              Loading...
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    this.bindEvents();
    this.loadOverview();
  }

  bindEvents() {
    document.getElementById('closeStaffMgmt')?.addEventListener('click', () => this.closeModal());
    document.getElementById('staffMgmtModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'staffMgmtModal') this.closeModal();
    });

    document.querySelectorAll('.staff-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.staff-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.staff-tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const tabId = tab.dataset.tab + 'Tab';
        document.getElementById(tabId).style.display = 'block';
        
        // Load tab content
        switch(tab.dataset.tab) {
          case 'overview': this.loadOverview(); break;
          case 'workload': this.loadWorkload(); break;
          case 'schedule': this.loadSchedule(); break;
          case 'targets': this.loadTargets(); break;
        }
      });
    });
  }

  async loadOverview() {
    const container = document.getElementById('staffSummary');
    
    try {
      const [users, tours, sales] = await Promise.all([
        window.fetchJson?.('/api/users') || [],
        window.fetchJson?.('/api/tours') || [],
        window.fetchJson?.('/api/sales') || []
      ]);

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Staff stats
      const staffStats = users.map(user => {
        const userTours = tours.filter(t => t.staff_name === user.username);
        const userSales = sales.filter(s => s.staff_name === user.username);
        
        const monthTours = userTours.filter(t => new Date(t.date) >= thisMonth);
        const monthSales = userSales.filter(s => new Date(s.date) >= thisMonth);
        
        const totalRevenue = userTours.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0) +
                            userSales.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

        return {
          ...user,
          totalTours: userTours.length,
          totalSales: userSales.length,
          monthTours: monthTours.length,
          monthSales: monthSales.length,
          totalRevenue,
          status: this.getStaffStatus(user, monthTours.length + monthSales.length)
        };
      }).sort((a, b) => b.totalRevenue - a.totalRevenue);

      const activeStaff = staffStats.filter(s => s.status === 'active').length;
      const totalStaff = staffStats.length;

      container.innerHTML = `
        <div class="staff-overview-kpis">
          <div class="staff-kpi">
            <span class="kpi-value">${totalStaff}</span>
            <span class="kpi-label">Total Staff</span>
          </div>
          <div class="staff-kpi active">
            <span class="kpi-value">${activeStaff}</span>
            <span class="kpi-label">Active This Month</span>
          </div>
          <div class="staff-kpi">
            <span class="kpi-value">${users.filter(u => u.role === 'admin').length}</span>
            <span class="kpi-label">Admins</span>
          </div>
        </div>

        <div class="staff-list-container">
          <h4>Staff Directory</h4>
          <div class="staff-list">
            ${staffStats.map(s => `
              <div class="staff-card ${s.status}">
                <div class="staff-avatar">${s.username.charAt(0).toUpperCase()}</div>
                <div class="staff-info">
                  <div class="staff-name">${s.username}</div>
                  <div class="staff-role">${s.role || 'Staff'}</div>
                </div>
                <div class="staff-metrics">
                  <div class="metric">
                    <span class="metric-value">${s.monthTours + s.monthSales}</span>
                    <span class="metric-label">This Month</span>
                  </div>
                  <div class="metric">
                    <span class="metric-value">$${s.totalRevenue.toLocaleString()}</span>
                    <span class="metric-label">Total Revenue</span>
                  </div>
                </div>
                <div class="staff-status-badge ${s.status}">${s.status}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error">Failed to load staff data</div>`;
    }
  }

  async loadWorkload() {
    const container = document.getElementById('workloadContent');
    
    try {
      const [users, tours, sales] = await Promise.all([
        window.fetchJson?.('/api/users') || [],
        window.fetchJson?.('/api/tours') || [],
        window.fetchJson?.('/api/sales') || []
      ]);

      const now = new Date();
      const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const workload = users.map(user => {
        const weekTours = tours.filter(t => 
          t.staff_name === user.username && new Date(t.date) >= thisWeek
        ).length;
        const weekSales = sales.filter(s => 
          s.staff_name === user.username && new Date(s.date) >= thisWeek
        ).length;
        
        const total = weekTours + weekSales;
        const capacity = 20; // Assumed weekly capacity
        const utilization = (total / capacity * 100).toFixed(0);

        return {
          name: user.username,
          tours: weekTours,
          sales: weekSales,
          total,
          utilization: Math.min(utilization, 100),
          overloaded: total > capacity
        };
      }).sort((a, b) => b.total - a.total);

      const avgWorkload = workload.length > 0 ?
        workload.reduce((sum, w) => sum + w.total, 0) / workload.length : 0;

      container.innerHTML = `
        <div class="workload-header">
          <h4>Weekly Workload Distribution</h4>
          <span class="avg-workload">Avg: ${avgWorkload.toFixed(1)} tasks/staff</span>
        </div>

        <div class="workload-chart">
          ${workload.map(w => `
            <div class="workload-bar-container">
              <div class="workload-label">${w.name}</div>
              <div class="workload-bar">
                <div class="workload-fill ${w.overloaded ? 'overloaded' : ''}" 
                     style="width: ${w.utilization}%">
                  ${w.total}
                </div>
              </div>
              <div class="workload-util">${w.utilization}%</div>
            </div>
          `).join('')}
        </div>

        <div class="workload-legend">
          <div class="legend-item">
            <span class="legend-dot normal"></span> Normal Load (< 80%)
          </div>
          <div class="legend-item">
            <span class="legend-dot warning"></span> High Load (80-100%)
          </div>
          <div class="legend-item">
            <span class="legend-dot overloaded"></span> Overloaded (> 100%)
          </div>
        </div>

        ${workload.some(w => w.overloaded) ? `
          <div class="workload-alert">
            ⚠️ <strong>${workload.filter(w => w.overloaded).length}</strong> staff members are overloaded. Consider redistributing tasks.
          </div>
        ` : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="error">Failed to load workload data</div>`;
    }
  }

  async loadSchedule() {
    const container = document.getElementById('scheduleContent');
    
    try {
      const [tours, users] = await Promise.all([
        window.fetchJson?.('/api/tours') || [],
        window.fetchJson?.('/api/users') || []
      ]);

      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Group tours by date
      const upcomingTours = tours
        .filter(t => {
          const date = new Date(t.date);
          return date >= today && date <= nextWeek;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      const toursByDate = {};
      upcomingTours.forEach(tour => {
        const date = new Date(tour.date).toLocaleDateString('en-US', { 
          weekday: 'short', month: 'short', day: 'numeric' 
        });
        if (!toursByDate[date]) toursByDate[date] = [];
        toursByDate[date].push(tour);
      });

      container.innerHTML = `
        <div class="schedule-header">
          <h4>Upcoming Week Schedule</h4>
          <span class="schedule-count">${upcomingTours.length} tours scheduled</span>
        </div>

        <div class="schedule-timeline">
          ${Object.entries(toursByDate).map(([date, dayTours]) => `
            <div class="schedule-day">
              <div class="day-header">
                <span class="day-date">${date}</span>
                <span class="day-count">${dayTours.length} tours</span>
              </div>
              <div class="day-tours">
                ${dayTours.map(tour => `
                  <div class="tour-slot">
                    <div class="tour-time">${tour.time || '09:00'}</div>
                    <div class="tour-details">
                      <div class="tour-name">${tour.tour_name || 'Tour'}</div>
                      <div class="tour-staff">👤 ${tour.staff_name || 'Unassigned'}</div>
                    </div>
                    <div class="tour-pax">${tour.pax || 0} pax</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('') || '<div class="no-schedule">No tours scheduled for the next 7 days</div>'}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error">Failed to load schedule</div>`;
    }
  }

  async loadTargets() {
    const container = document.getElementById('targetsContent');
    
    try {
      const [users, tours, sales, targets] = await Promise.all([
        window.fetchJson?.('/api/users') || [],
        window.fetchJson?.('/api/tours') || [],
        window.fetchJson?.('/api/sales') || [],
        window.fetchJson?.('/api/targets') || []
      ]);

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const staffTargets = users.map(user => {
        const userTarget = targets.find(t => 
          t.staff_name === user.username && 
          new Date(t.month || t.date).getMonth() === now.getMonth()
        );
        
        const monthTours = tours.filter(t => 
          t.staff_name === user.username && new Date(t.date) >= thisMonth
        );
        const monthSales = sales.filter(s => 
          s.staff_name === user.username && new Date(s.date) >= thisMonth
        );

        const actualRevenue = monthTours.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0) +
                             monthSales.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
        
        const targetAmount = parseFloat(userTarget?.target_amount || userTarget?.amount) || 10000;
        const progress = (actualRevenue / targetAmount * 100).toFixed(0);

        return {
          name: user.username,
          target: targetAmount,
          actual: actualRevenue,
          progress: Math.min(progress, 150),
          achieved: actualRevenue >= targetAmount
        };
      }).sort((a, b) => b.progress - a.progress);

      const achievedCount = staffTargets.filter(s => s.achieved).length;

      container.innerHTML = `
        <div class="targets-header">
          <h4>Monthly Target Progress</h4>
          <span class="achieved-count">${achievedCount}/${staffTargets.length} achieved</span>
        </div>

        <div class="targets-list">
          ${staffTargets.map(s => `
            <div class="target-card ${s.achieved ? 'achieved' : ''}">
              <div class="target-info">
                <div class="target-name">${s.name}</div>
                <div class="target-values">
                  <span class="actual">$${s.actual.toLocaleString()}</span>
                  <span class="separator">/</span>
                  <span class="target">$${s.target.toLocaleString()}</span>
                </div>
              </div>
              <div class="target-progress">
                <div class="progress-bar">
                  <div class="progress-fill ${s.achieved ? 'achieved' : s.progress >= 80 ? 'close' : ''}" 
                       style="width: ${Math.min(s.progress, 100)}%"></div>
                </div>
                <span class="progress-text">${s.progress}%</span>
              </div>
              ${s.achieved ? '<span class="achieved-badge">✓ Achieved</span>' : ''}
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error">Failed to load targets</div>`;
    }
  }

  getStaffStatus(user, monthlyActivity) {
    if (monthlyActivity > 5) return 'active';
    if (monthlyActivity > 0) return 'moderate';
    return 'inactive';
  }

  closeModal() {
    const modal = document.getElementById('staffMgmtModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  addStyles() {
    if (document.getElementById('staffMgmtStyles')) return;

    const style = document.createElement('style');
    style.id = 'staffMgmtStyles';
    style.textContent = `
      .staff-mgmt-btn {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important;
        color: white !important;
      }

      .staff-mgmt-modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s;
        backdrop-filter: blur(4px);
      }

      .staff-mgmt-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .staff-mgmt-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 95%;
        max-width: 900px;
        height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0,0,0,0.4);
      }

      .staff-mgmt-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
      }

      .staff-mgmt-header h3 { margin: 0; }

      .staff-close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }

      .staff-mgmt-body {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .staff-tabs {
        display: flex;
        background: var(--bg-alt, #f9fafb);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .staff-tab {
        flex: 1;
        padding: 14px;
        border: none;
        background: none;
        cursor: pointer;
        font-weight: 500;
        color: var(--text-secondary, #6b7280);
      }

      .staff-tab.active {
        color: #8b5cf6;
        background: var(--card, #fff);
        border-bottom: 2px solid #8b5cf6;
      }

      .staff-tab-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      /* Overview */
      .staff-overview-kpis {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }

      .staff-kpi {
        background: var(--bg-alt, #f9fafb);
        padding: 20px;
        border-radius: 12px;
        text-align: center;
      }

      .staff-kpi.active {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
      }

      .staff-kpi .kpi-value {
        display: block;
        font-size: 32px;
        font-weight: 700;
      }

      .staff-kpi .kpi-label {
        font-size: 13px;
        opacity: 0.8;
      }

      .staff-list-container h4 {
        margin: 0 0 16px 0;
      }

      .staff-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .staff-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
        border-left: 4px solid transparent;
      }

      .staff-card.active { border-left-color: #10b981; }
      .staff-card.moderate { border-left-color: #f59e0b; }
      .staff-card.inactive { border-left-color: #ef4444; }

      .staff-avatar {
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: 700;
      }

      .staff-info {
        flex: 1;
      }

      .staff-name {
        font-weight: 600;
        font-size: 15px;
      }

      .staff-role {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }

      .staff-metrics {
        display: flex;
        gap: 24px;
      }

      .staff-metrics .metric {
        text-align: center;
      }

      .staff-metrics .metric-value {
        display: block;
        font-weight: 700;
        font-size: 16px;
      }

      .staff-metrics .metric-label {
        font-size: 11px;
        color: var(--text-secondary, #6b7280);
      }

      .staff-status-badge {
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
      }

      .staff-status-badge.active { background: #dcfce7; color: #16a34a; }
      .staff-status-badge.moderate { background: #fef3c7; color: #d97706; }
      .staff-status-badge.inactive { background: #fee2e2; color: #dc2626; }

      /* Workload */
      .workload-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }

      .workload-header h4 { margin: 0; }

      .workload-bar-container {
        display: grid;
        grid-template-columns: 100px 1fr 50px;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }

      .workload-bar {
        height: 28px;
        background: var(--bg-alt, #e5e7eb);
        border-radius: 6px;
        overflow: hidden;
      }

      .workload-fill {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6, #a78bfa);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 12px;
        transition: width 0.5s ease;
      }

      .workload-fill.overloaded {
        background: linear-gradient(90deg, #ef4444, #f87171);
      }

      .workload-legend {
        display: flex;
        gap: 20px;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }

      .legend-dot {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 6px;
      }

      .legend-dot.normal { background: #a78bfa; }
      .legend-dot.warning { background: #f59e0b; }
      .legend-dot.overloaded { background: #ef4444; }

      .workload-alert {
        margin-top: 16px;
        padding: 12px 16px;
        background: #fef3c7;
        border-radius: 8px;
        color: #92400e;
      }

      /* Schedule */
      .schedule-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      .schedule-day {
        margin-bottom: 20px;
      }

      .day-header {
        display: flex;
        justify-content: space-between;
        padding: 10px 14px;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 8px;
        margin-bottom: 10px;
      }

      .day-date {
        font-weight: 600;
      }

      .tour-slot {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 16px;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        margin-bottom: 8px;
      }

      .tour-time {
        font-weight: 600;
        color: #8b5cf6;
      }

      .tour-details {
        flex: 1;
      }

      .tour-name {
        font-weight: 500;
      }

      .tour-staff {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }

      .tour-pax {
        background: var(--bg-alt, #f3f4f6);
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 13px;
      }

      /* Targets */
      .targets-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      .achieved-count {
        background: #dcfce7;
        color: #16a34a;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: 600;
      }

      .target-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
        margin-bottom: 12px;
      }

      .target-card.achieved {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid #10b981;
      }

      .target-info {
        width: 180px;
      }

      .target-name {
        font-weight: 600;
      }

      .target-values {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }

      .target-progress {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .progress-bar {
        flex: 1;
        height: 10px;
        background: var(--border-light, #e5e7eb);
        border-radius: 5px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6, #a78bfa);
        border-radius: 5px;
        transition: width 0.5s ease;
      }

      .progress-fill.achieved {
        background: linear-gradient(90deg, #10b981, #34d399);
      }

      .progress-fill.close {
        background: linear-gradient(90deg, #f59e0b, #fbbf24);
      }

      .progress-text {
        width: 50px;
        font-weight: 600;
        text-align: right;
      }

      .achieved-badge {
        background: #10b981;
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
      }

      /* Dark mode */
      [data-theme="dark"] .staff-mgmt-content {
        background: var(--card, #1e293b);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.staffManagement = new StaffManagement();
