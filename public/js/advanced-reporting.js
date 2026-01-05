/**
 * Advanced Reporting Module
 * Enhanced analytics and report generation for management
 */

class AdvancedReporting {
  constructor() {
    this.reportTypes = [
      { id: 'performance', name: 'Staff Performance', icon: '👤' },
      { id: 'revenue', name: 'Revenue Analysis', icon: '💰' },
      { id: 'trends', name: 'Trend Analysis', icon: '📈' },
      { id: 'comparison', name: 'Period Comparison', icon: '⚖️' },
      { id: 'forecast', name: 'Sales Forecast', icon: '🔮' },
      { id: 'summary', name: 'Executive Summary', icon: '📋' }
    ];
    this.init();
  }

  init() {
    this.addStyles();
    this.addReportButton();
  }

  addReportButton() {
    setTimeout(() => {
      const header = document.querySelector('.header-actions, .header > div:last-child');
      if (!header || document.getElementById('advancedReportBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'advancedReportBtn';
      btn.className = 'btn advanced-report-btn';
      btn.innerHTML = '📊 Reports';
      btn.title = 'Advanced Reports & Analytics';
      btn.addEventListener('click', () => this.showReportCenter());
      header.appendChild(btn);
    }, 1000);
  }

  async showReportCenter() {
    document.getElementById('reportCenterModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'reportCenterModal';
    modal.className = 'report-center-modal';
    modal.innerHTML = `
      <div class="report-center-content">
        <div class="report-center-header">
          <h3>📊 Report Center</h3>
          <button class="report-close-btn" id="closeReportCenter">&times;</button>
        </div>
        <div class="report-center-body">
          <div class="report-sidebar">
            <div class="report-menu">
              ${this.reportTypes.map((r, i) => `
                <button class="report-menu-item ${i === 0 ? 'active' : ''}" data-report="${r.id}">
                  <span class="report-icon">${r.icon}</span>
                  <span>${r.name}</span>
                </button>
              `).join('')}
            </div>
            <div class="report-date-range">
              <label>Date Range</label>
              <select id="reportDateRange">
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month" selected>This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
              <div id="customDateRange" style="display:none; margin-top:10px;">
                <input type="date" id="reportStartDate">
                <input type="date" id="reportEndDate">
              </div>
            </div>
          </div>
          <div class="report-main">
            <div class="report-content" id="reportContent">
              <div class="loading-report">Loading report...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    this.bindReportEvents();
    this.loadReport('performance');
  }

  bindReportEvents() {
    document.getElementById('closeReportCenter')?.addEventListener('click', () => this.closeModal());
    document.getElementById('reportCenterModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'reportCenterModal') this.closeModal();
    });

    document.querySelectorAll('.report-menu-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.report-menu-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadReport(btn.dataset.report);
      });
    });

    document.getElementById('reportDateRange')?.addEventListener('change', (e) => {
      const customRange = document.getElementById('customDateRange');
      customRange.style.display = e.target.value === 'custom' ? 'block' : 'none';
      
      const activeReport = document.querySelector('.report-menu-item.active')?.dataset.report;
      if (activeReport) this.loadReport(activeReport);
    });
  }

  async loadReport(type) {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="loading-report">⏳ Generating report...</div>';

    try {
      const dateRange = this.getDateRange();
      
      switch(type) {
        case 'performance':
          await this.renderPerformanceReport(dateRange);
          break;
        case 'revenue':
          await this.renderRevenueReport(dateRange);
          break;
        case 'trends':
          await this.renderTrendsReport(dateRange);
          break;
        case 'comparison':
          await this.renderComparisonReport(dateRange);
          break;
        case 'forecast':
          await this.renderForecastReport(dateRange);
          break;
        case 'summary':
          await this.renderSummaryReport(dateRange);
          break;
      }
    } catch (err) {
      content.innerHTML = `<div class="report-error">❌ Failed to load report: ${err.message}</div>`;
    }
  }

  getDateRange() {
    const range = document.getElementById('reportDateRange')?.value || 'month';
    const now = new Date();
    let start, end = now;

    switch(range) {
      case 'today':
        start = new Date(now.setHours(0,0,0,0));
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        start = new Date(document.getElementById('reportStartDate')?.value || now);
        end = new Date(document.getElementById('reportEndDate')?.value || now);
        break;
    }

    return { start, end: new Date(), label: range };
  }

  async renderPerformanceReport(dateRange) {
    const [tours, sales, users] = await Promise.all([
      window.fetchJson?.('/api/tours') || [],
      window.fetchJson?.('/api/sales') || [],
      window.fetchJson?.('/api/users') || []
    ]);

    // Calculate staff metrics
    const staffMetrics = {};
    users.forEach(u => {
      staffMetrics[u.username] = {
        name: u.username,
        role: u.role,
        tours: 0,
        tourRevenue: 0,
        sales: 0,
        salesRevenue: 0
      };
    });

    tours.forEach(t => {
      const date = new Date(t.date);
      if (date >= dateRange.start && date <= dateRange.end) {
        const staff = t.staff_name || 'Unknown';
        if (!staffMetrics[staff]) {
          staffMetrics[staff] = { name: staff, tours: 0, tourRevenue: 0, sales: 0, salesRevenue: 0 };
        }
        staffMetrics[staff].tours++;
        staffMetrics[staff].tourRevenue += parseFloat(t.price) || 0;
      }
    });

    sales.forEach(s => {
      const date = new Date(s.date);
      if (date >= dateRange.start && date <= dateRange.end) {
        const staff = s.staff_name || 'Unknown';
        if (!staffMetrics[staff]) {
          staffMetrics[staff] = { name: staff, tours: 0, tourRevenue: 0, sales: 0, salesRevenue: 0 };
        }
        staffMetrics[staff].sales++;
        staffMetrics[staff].salesRevenue += parseFloat(s.price) || 0;
      }
    });

    const sorted = Object.values(staffMetrics)
      .filter(s => s.tours > 0 || s.sales > 0)
      .sort((a, b) => (b.tourRevenue + b.salesRevenue) - (a.tourRevenue + a.salesRevenue));

    const topPerformer = sorted[0] || { name: 'N/A', tourRevenue: 0, salesRevenue: 0 };
    const totalRevenue = sorted.reduce((sum, s) => sum + s.tourRevenue + s.salesRevenue, 0);

    document.getElementById('reportContent').innerHTML = `
      <div class="report-header">
        <h4>👤 Staff Performance Report</h4>
        <span class="report-period">${dateRange.label}</span>
      </div>
      
      <div class="report-kpis">
        <div class="kpi-card">
          <span class="kpi-label">Total Staff Active</span>
          <span class="kpi-value">${sorted.length}</span>
        </div>
        <div class="kpi-card highlight">
          <span class="kpi-label">Top Performer</span>
          <span class="kpi-value">${topPerformer.name}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Revenue</span>
          <span class="kpi-value">$${totalRevenue.toLocaleString()}</span>
        </div>
      </div>

      <div class="report-table-container">
        <table class="report-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Staff</th>
              <th>Tours</th>
              <th>Tour Revenue</th>
              <th>Sales</th>
              <th>Sales Revenue</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((s, i) => `
              <tr class="${i === 0 ? 'top-performer' : ''}">
                <td>${i + 1}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.tours}</td>
                <td>$${s.tourRevenue.toLocaleString()}</td>
                <td>${s.sales}</td>
                <td>$${s.salesRevenue.toLocaleString()}</td>
                <td><strong>$${(s.tourRevenue + s.salesRevenue).toLocaleString()}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="report-actions">
        <button class="btn btn-secondary" onclick="window.advancedReporting.exportReport('performance')">
          📥 Export CSV
        </button>
      </div>
    `;
  }

  async renderRevenueReport(dateRange) {
    const [tours, sales] = await Promise.all([
      window.fetchJson?.('/api/tours') || [],
      window.fetchJson?.('/api/sales') || []
    ]);

    // Group by category/type
    const revenueByCategory = {};
    const revenueByMonth = {};

    tours.forEach(t => {
      const date = new Date(t.date);
      if (date >= dateRange.start && date <= dateRange.end) {
        const category = t.tour_type || t.region || 'Tours';
        const month = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        
        revenueByCategory[category] = (revenueByCategory[category] || 0) + (parseFloat(t.price) || 0);
        revenueByMonth[month] = (revenueByMonth[month] || 0) + (parseFloat(t.price) || 0);
      }
    });

    sales.forEach(s => {
      const date = new Date(s.date);
      if (date >= dateRange.start && date <= dateRange.end) {
        const category = s.category || 'Other Sales';
        const month = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        
        revenueByCategory[category] = (revenueByCategory[category] || 0) + (parseFloat(s.price) || 0);
        revenueByMonth[month] = (revenueByMonth[month] || 0) + (parseFloat(s.price) || 0);
      }
    });

    const totalRevenue = Object.values(revenueByCategory).reduce((a, b) => a + b, 0);
    const categories = Object.entries(revenueByCategory).sort((a, b) => b[1] - a[1]);

    document.getElementById('reportContent').innerHTML = `
      <div class="report-header">
        <h4>💰 Revenue Analysis</h4>
        <span class="report-period">${dateRange.label}</span>
      </div>
      
      <div class="report-kpis">
        <div class="kpi-card highlight">
          <span class="kpi-label">Total Revenue</span>
          <span class="kpi-value">$${totalRevenue.toLocaleString()}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Avg per Transaction</span>
          <span class="kpi-value">$${(totalRevenue / Math.max(tours.length + sales.length, 1)).toFixed(0)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Top Category</span>
          <span class="kpi-value">${categories[0]?.[0] || 'N/A'}</span>
        </div>
      </div>

      <div class="report-charts">
        <div class="chart-container">
          <h5>Revenue by Category</h5>
          <div class="bar-chart">
            ${categories.slice(0, 6).map(([cat, val]) => `
              <div class="bar-row">
                <span class="bar-label">${cat}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${(val / totalRevenue * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-value">$${val.toLocaleString()}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="report-actions">
        <button class="btn btn-secondary" onclick="window.advancedReporting.exportReport('revenue')">
          📥 Export CSV
        </button>
      </div>
    `;
  }

  async renderTrendsReport(dateRange) {
    const [tours, sales] = await Promise.all([
      window.fetchJson?.('/api/tours') || [],
      window.fetchJson?.('/api/sales') || []
    ]);

    // Daily trends
    const dailyData = {};
    const weekdayData = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    [...tours, ...sales].forEach(item => {
      const date = new Date(item.date);
      if (date >= dateRange.start && date <= dateRange.end) {
        const day = date.toISOString().split('T')[0];
        dailyData[day] = (dailyData[day] || 0) + 1;
        weekdayData[weekdays[date.getDay()]]++;
      }
    });

    const sortedDays = Object.entries(dailyData).sort((a, b) => a[0].localeCompare(b[0]));
    const busiestWeekday = Object.entries(weekdayData).sort((a, b) => b[1] - a[1])[0];
    const avgDaily = sortedDays.length > 0 ? 
      sortedDays.reduce((sum, [, v]) => sum + v, 0) / sortedDays.length : 0;

    document.getElementById('reportContent').innerHTML = `
      <div class="report-header">
        <h4>📈 Trend Analysis</h4>
        <span class="report-period">${dateRange.label}</span>
      </div>
      
      <div class="report-kpis">
        <div class="kpi-card">
          <span class="kpi-label">Total Transactions</span>
          <span class="kpi-value">${Object.values(dailyData).reduce((a, b) => a + b, 0)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Avg Daily</span>
          <span class="kpi-value">${avgDaily.toFixed(1)}</span>
        </div>
        <div class="kpi-card highlight">
          <span class="kpi-label">Busiest Day</span>
          <span class="kpi-value">${busiestWeekday?.[0] || 'N/A'}</span>
        </div>
      </div>

      <div class="report-charts">
        <div class="chart-container">
          <h5>Activity by Day of Week</h5>
          <div class="bar-chart horizontal">
            ${weekdays.map(day => `
              <div class="bar-row">
                <span class="bar-label">${day}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${(weekdayData[day] / Math.max(...Object.values(weekdayData), 1) * 100).toFixed(1)}%"></div>
                </div>
                <span class="bar-value">${weekdayData[day]}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="trend-insights">
        <h5>📊 Insights</h5>
        <ul>
          <li><strong>${busiestWeekday?.[0]}</strong> is your busiest day with ${busiestWeekday?.[1]} transactions</li>
          <li>Average of <strong>${avgDaily.toFixed(1)}</strong> transactions per day</li>
          <li>Data covers <strong>${sortedDays.length}</strong> active days</li>
        </ul>
      </div>
    `;
  }

  async renderComparisonReport(dateRange) {
    const [tours, sales] = await Promise.all([
      window.fetchJson?.('/api/tours') || [],
      window.fetchJson?.('/api/sales') || []
    ]);

    // Current period
    const currentTours = tours.filter(t => {
      const date = new Date(t.date);
      return date >= dateRange.start && date <= dateRange.end;
    });
    const currentSales = sales.filter(s => {
      const date = new Date(s.date);
      return date >= dateRange.start && date <= dateRange.end;
    });

    // Previous period (same duration before start)
    const duration = dateRange.end - dateRange.start;
    const prevStart = new Date(dateRange.start - duration);
    const prevEnd = new Date(dateRange.start);

    const prevTours = tours.filter(t => {
      const date = new Date(t.date);
      return date >= prevStart && date < prevEnd;
    });
    const prevSales = sales.filter(s => {
      const date = new Date(s.date);
      return date >= prevStart && date < prevEnd;
    });

    const currentRevenue = [...currentTours, ...currentSales].reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0);
    const prevRevenue = [...prevTours, ...prevSales].reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0);
    const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100) : 0;

    const currentCount = currentTours.length + currentSales.length;
    const prevCount = prevTours.length + prevSales.length;
    const countChange = prevCount > 0 ? ((currentCount - prevCount) / prevCount * 100) : 0;

    document.getElementById('reportContent').innerHTML = `
      <div class="report-header">
        <h4>⚖️ Period Comparison</h4>
        <span class="report-period">vs Previous Period</span>
      </div>
      
      <div class="comparison-grid">
        <div class="comparison-card">
          <h5>Revenue</h5>
          <div class="comparison-values">
            <div class="current-value">
              <span class="label">Current</span>
              <span class="value">$${currentRevenue.toLocaleString()}</span>
            </div>
            <div class="change-indicator ${revenueChange >= 0 ? 'positive' : 'negative'}">
              ${revenueChange >= 0 ? '↑' : '↓'} ${Math.abs(revenueChange).toFixed(1)}%
            </div>
            <div class="previous-value">
              <span class="label">Previous</span>
              <span class="value">$${prevRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div class="comparison-card">
          <h5>Transactions</h5>
          <div class="comparison-values">
            <div class="current-value">
              <span class="label">Current</span>
              <span class="value">${currentCount}</span>
            </div>
            <div class="change-indicator ${countChange >= 0 ? 'positive' : 'negative'}">
              ${countChange >= 0 ? '↑' : '↓'} ${Math.abs(countChange).toFixed(1)}%
            </div>
            <div class="previous-value">
              <span class="label">Previous</span>
              <span class="value">${prevCount}</span>
            </div>
          </div>
        </div>

        <div class="comparison-card">
          <h5>Tours</h5>
          <div class="comparison-values">
            <div class="current-value">
              <span class="label">Current</span>
              <span class="value">${currentTours.length}</span>
            </div>
            <div class="change-indicator ${currentTours.length >= prevTours.length ? 'positive' : 'negative'}">
              ${currentTours.length >= prevTours.length ? '↑' : '↓'} 
              ${prevTours.length > 0 ? Math.abs((currentTours.length - prevTours.length) / prevTours.length * 100).toFixed(1) : 0}%
            </div>
            <div class="previous-value">
              <span class="label">Previous</span>
              <span class="value">${prevTours.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="comparison-summary">
        <h5>Summary</h5>
        <p>
          ${revenueChange >= 0 ? '📈 Revenue increased' : '📉 Revenue decreased'} by 
          <strong>${Math.abs(revenueChange).toFixed(1)}%</strong> compared to the previous period.
          ${countChange >= 0 ? 'Transaction volume also grew' : 'Transaction volume declined'} by 
          <strong>${Math.abs(countChange).toFixed(1)}%</strong>.
        </p>
      </div>
    `;
  }

  async renderForecastReport(dateRange) {
    const [tours, sales] = await Promise.all([
      window.fetchJson?.('/api/tours') || [],
      window.fetchJson?.('/api/sales') || []
    ]);

    // Calculate monthly averages
    const monthlyData = {};
    [...tours, ...sales].forEach(item => {
      const date = new Date(item.date);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[month]) {
        monthlyData[month] = { count: 0, revenue: 0 };
      }
      monthlyData[month].count++;
      monthlyData[month].revenue += parseFloat(item.price) || 0;
    });

    const months = Object.keys(monthlyData).sort();
    const avgMonthlyRevenue = months.length > 0 ?
      Object.values(monthlyData).reduce((sum, m) => sum + m.revenue, 0) / months.length : 0;
    const avgMonthlyCount = months.length > 0 ?
      Object.values(monthlyData).reduce((sum, m) => sum + m.count, 0) / months.length : 0;

    // Simple linear projection
    const lastThreeMonths = months.slice(-3);
    const recentAvg = lastThreeMonths.length > 0 ?
      lastThreeMonths.reduce((sum, m) => sum + monthlyData[m].revenue, 0) / lastThreeMonths.length : avgMonthlyRevenue;

    const growth = avgMonthlyRevenue > 0 ? (recentAvg - avgMonthlyRevenue) / avgMonthlyRevenue : 0;
    const nextMonthForecast = recentAvg * (1 + growth * 0.5);
    const quarterForecast = nextMonthForecast * 3;

    document.getElementById('reportContent').innerHTML = `
      <div class="report-header">
        <h4>🔮 Sales Forecast</h4>
        <span class="report-period">Based on historical data</span>
      </div>
      
      <div class="report-kpis">
        <div class="kpi-card">
          <span class="kpi-label">Avg Monthly Revenue</span>
          <span class="kpi-value">$${avgMonthlyRevenue.toLocaleString()}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Avg Monthly Transactions</span>
          <span class="kpi-value">${avgMonthlyCount.toFixed(0)}</span>
        </div>
        <div class="kpi-card highlight">
          <span class="kpi-label">Growth Trend</span>
          <span class="kpi-value">${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div class="forecast-cards">
        <div class="forecast-card">
          <div class="forecast-period">Next Month</div>
          <div class="forecast-value">$${nextMonthForecast.toLocaleString()}</div>
          <div class="forecast-note">Projected revenue</div>
        </div>
        <div class="forecast-card">
          <div class="forecast-period">Next Quarter</div>
          <div class="forecast-value">$${quarterForecast.toLocaleString()}</div>
          <div class="forecast-note">3-month projection</div>
        </div>
      </div>

      <div class="forecast-disclaimer">
        <p>⚠️ <strong>Note:</strong> Forecasts are based on historical trends and may not account for seasonal variations, market changes, or external factors.</p>
      </div>
    `;
  }

  async renderSummaryReport(dateRange) {
    const [tours, sales, hotels, overtime] = await Promise.all([
      window.fetchJson?.('/api/tours') || [],
      window.fetchJson?.('/api/sales') || [],
      window.fetchJson?.('/api/hotel_bookings') || [],
      window.fetchJson?.('/api/overtime') || []
    ]);

    const filterByDate = (items) => items.filter(i => {
      const date = new Date(i.date);
      return date >= dateRange.start && date <= dateRange.end;
    });

    const periodTours = filterByDate(tours);
    const periodSales = filterByDate(sales);
    const periodHotels = filterByDate(hotels);
    const periodOvertime = filterByDate(overtime);

    const tourRevenue = periodTours.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
    const salesRevenue = periodSales.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
    const hotelCost = periodHotels.reduce((sum, h) => sum + (parseFloat(h.total_cost) || 0), 0);
    const overtimeCost = periodOvertime.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);

    const totalRevenue = tourRevenue + salesRevenue;
    const totalCost = hotelCost + overtimeCost;
    const netProfit = totalRevenue - totalCost;

    document.getElementById('reportContent').innerHTML = `
      <div class="report-header">
        <h4>📋 Executive Summary</h4>
        <span class="report-period">${dateRange.label}</span>
      </div>
      
      <div class="summary-grid">
        <div class="summary-section revenue">
          <h5>💰 Revenue</h5>
          <div class="summary-total">$${totalRevenue.toLocaleString()}</div>
          <div class="summary-breakdown">
            <div class="breakdown-item">
              <span>Tours (${periodTours.length})</span>
              <span>$${tourRevenue.toLocaleString()}</span>
            </div>
            <div class="breakdown-item">
              <span>Sales (${periodSales.length})</span>
              <span>$${salesRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div class="summary-section costs">
          <h5>📉 Costs</h5>
          <div class="summary-total">$${totalCost.toLocaleString()}</div>
          <div class="summary-breakdown">
            <div class="breakdown-item">
              <span>Hotels (${periodHotels.length})</span>
              <span>$${hotelCost.toLocaleString()}</span>
            </div>
            <div class="breakdown-item">
              <span>Overtime (${periodOvertime.length})</span>
              <span>$${overtimeCost.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div class="summary-section profit ${netProfit >= 0 ? 'positive' : 'negative'}">
          <h5>📊 Net Profit</h5>
          <div class="summary-total">${netProfit >= 0 ? '+' : ''}$${netProfit.toLocaleString()}</div>
          <div class="profit-margin">
            Margin: ${totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      <div class="summary-highlights">
        <h5>Key Highlights</h5>
        <ul>
          <li>Total of <strong>${periodTours.length + periodSales.length}</strong> transactions completed</li>
          <li>Average transaction value: <strong>$${((tourRevenue + salesRevenue) / Math.max(periodTours.length + periodSales.length, 1)).toFixed(0)}</strong></li>
          <li>Profit margin: <strong>${totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : 0}%</strong></li>
        </ul>
      </div>

      <div class="report-actions">
        <button class="btn btn-secondary" onclick="window.advancedReporting.exportReport('summary')">
          📥 Export Report
        </button>
        <button class="btn btn-primary" onclick="window.print()">
          🖨️ Print
        </button>
      </div>
    `;
  }

  exportReport(type) {
    window.toast?.success(`Exporting ${type} report...`);
    // CSV export logic would go here
  }

  closeModal() {
    const modal = document.getElementById('reportCenterModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  addStyles() {
    if (document.getElementById('advancedReportingStyles')) return;

    const style = document.createElement('style');
    style.id = 'advancedReportingStyles';
    style.textContent = `
      .advanced-report-btn {
        background: linear-gradient(135deg, #0ea5e9, #0284c7) !important;
        color: white !important;
      }

      .report-center-modal {
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

      .report-center-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .report-center-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 95%;
        max-width: 1000px;
        height: 85vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0,0,0,0.4);
      }

      .report-center-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        background: linear-gradient(135deg, #0ea5e9, #0284c7);
        color: white;
      }

      .report-center-header h3 { margin: 0; }

      .report-close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }

      .report-center-body {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      .report-sidebar {
        width: 220px;
        background: var(--bg-alt, #f8fafc);
        border-right: 1px solid var(--border-light, #e2e8f0);
        display: flex;
        flex-direction: column;
        padding: 16px;
      }

      .report-menu {
        flex: 1;
      }

      .report-menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 12px 14px;
        border: none;
        background: none;
        border-radius: 10px;
        cursor: pointer;
        font-size: 14px;
        color: var(--text, #334155);
        margin-bottom: 4px;
        transition: all 0.2s;
      }

      .report-menu-item:hover {
        background: var(--card, #fff);
      }

      .report-menu-item.active {
        background: #0ea5e9;
        color: white;
      }

      .report-icon {
        font-size: 16px;
      }

      .report-date-range {
        padding-top: 16px;
        border-top: 1px solid var(--border-light, #e2e8f0);
      }

      .report-date-range label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--text-secondary, #64748b);
      }

      .report-date-range select,
      .report-date-range input {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid var(--border-light, #e2e8f0);
        border-radius: 8px;
        font-size: 13px;
        margin-bottom: 6px;
      }

      .report-main {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }

      .report-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .report-header h4 {
        margin: 0;
        font-size: 20px;
      }

      .report-period {
        background: var(--bg-alt, #f1f5f9);
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 13px;
        color: var(--text-secondary, #64748b);
      }

      .report-kpis {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }

      .kpi-card {
        background: var(--bg-alt, #f8fafc);
        padding: 20px;
        border-radius: 12px;
        text-align: center;
      }

      .kpi-card.highlight {
        background: linear-gradient(135deg, #0ea5e9, #0284c7);
        color: white;
      }

      .kpi-label {
        display: block;
        font-size: 12px;
        color: var(--text-secondary, #64748b);
        margin-bottom: 6px;
      }

      .kpi-card.highlight .kpi-label {
        color: rgba(255,255,255,0.8);
      }

      .kpi-value {
        font-size: 24px;
        font-weight: 700;
      }

      .report-table-container {
        overflow-x: auto;
        margin-bottom: 20px;
      }

      .report-table {
        width: 100%;
        border-collapse: collapse;
      }

      .report-table th,
      .report-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid var(--border-light, #e2e8f0);
      }

      .report-table th {
        background: var(--bg-alt, #f8fafc);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-secondary, #64748b);
      }

      .report-table tr.top-performer {
        background: rgba(14, 165, 233, 0.1);
      }

      .bar-chart {
        padding: 10px 0;
      }

      .bar-row {
        display: grid;
        grid-template-columns: 120px 1fr 80px;
        gap: 12px;
        align-items: center;
        margin-bottom: 10px;
      }

      .bar-label {
        font-size: 13px;
        font-weight: 500;
      }

      .bar-track {
        height: 24px;
        background: var(--bg-alt, #e2e8f0);
        border-radius: 6px;
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #0ea5e9, #06b6d4);
        border-radius: 6px;
        transition: width 0.5s ease;
      }

      .bar-value {
        font-size: 13px;
        font-weight: 600;
        text-align: right;
      }

      .comparison-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        margin-bottom: 24px;
      }

      .comparison-card {
        background: var(--bg-alt, #f8fafc);
        padding: 20px;
        border-radius: 12px;
      }

      .comparison-card h5 {
        margin: 0 0 16px 0;
        font-size: 14px;
        color: var(--text-secondary, #64748b);
      }

      .comparison-values {
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: center;
      }

      .current-value, .previous-value {
        text-align: center;
      }

      .current-value .label, .previous-value .label {
        display: block;
        font-size: 11px;
        color: var(--text-secondary, #64748b);
      }

      .current-value .value {
        font-size: 24px;
        font-weight: 700;
      }

      .previous-value .value {
        font-size: 16px;
        color: var(--text-secondary, #64748b);
      }

      .change-indicator {
        padding: 6px 14px;
        border-radius: 20px;
        font-weight: 700;
        font-size: 14px;
      }

      .change-indicator.positive {
        background: #dcfce7;
        color: #16a34a;
      }

      .change-indicator.negative {
        background: #fee2e2;
        color: #dc2626;
      }

      .forecast-cards {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        margin-bottom: 20px;
      }

      .forecast-card {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
        padding: 24px;
        border-radius: 16px;
        text-align: center;
      }

      .forecast-period {
        font-size: 14px;
        opacity: 0.8;
        margin-bottom: 8px;
      }

      .forecast-value {
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .forecast-note {
        font-size: 12px;
        opacity: 0.7;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        margin-bottom: 24px;
      }

      .summary-section {
        background: var(--bg-alt, #f8fafc);
        padding: 20px;
        border-radius: 12px;
      }

      .summary-section h5 {
        margin: 0 0 12px 0;
        font-size: 14px;
      }

      .summary-total {
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 16px;
      }

      .summary-section.profit.positive .summary-total {
        color: #16a34a;
      }

      .summary-section.profit.negative .summary-total {
        color: #dc2626;
      }

      .summary-breakdown {
        border-top: 1px solid var(--border-light, #e2e8f0);
        padding-top: 12px;
      }

      .breakdown-item {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        padding: 4px 0;
      }

      .report-actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
      }

      .loading-report {
        text-align: center;
        padding: 60px;
        color: var(--text-secondary, #64748b);
      }

      /* Dark mode */
      [data-theme="dark"] .report-center-content {
        background: var(--card, #1e293b);
      }

      [data-theme="dark"] .report-sidebar {
        background: var(--bg-alt, #0f172a);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.advancedReporting = new AdvancedReporting();
