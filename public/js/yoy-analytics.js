// ============================================
// YEAR-OVER-YEAR ANALYTICS MODULE
// Compare performance across different years
// ============================================

class YearOverYearAnalytics {
  constructor() {
    this.salesData = [];
    this.toursData = [];
    this.currentYear = new Date().getFullYear();
    this.comparisonYear = this.currentYear - 1;
    this.chartInstances = {};
  }
  
  async loadData() {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [salesRes, toursRes] = await Promise.all([
        fetch('/api/sales', { headers }),
        fetch('/api/tours', { headers })
      ]);
      
      this.salesData = await salesRes.json() || [];
      this.toursData = await toursRes.json() || [];
      
      return { success: true };
    } catch (err) {
      console.error('Failed to load YoY data:', err);
      return { success: false, error: err.message };
    }
  }
  
  getAvailableYears() {
    const years = new Set();
    
    this.salesData.forEach(s => {
      if (s.tgl_transfer) years.add(new Date(s.tgl_transfer).getFullYear());
    });
    
    this.toursData.forEach(t => {
      if (t.departure_date) years.add(new Date(t.departure_date).getFullYear());
    });
    
    return Array.from(years).sort((a, b) => b - a);
  }
  
  // Filter data by year
  filterByYear(data, dateField, year) {
    return data.filter(item => {
      if (!item[dateField]) return false;
      return new Date(item[dateField]).getFullYear() === year;
    });
  }
  
  // Get monthly breakdown
  getMonthlyData(data, dateField, valueField, year) {
    const monthly = Array(12).fill(0);
    
    data.forEach(item => {
      if (!item[dateField]) return;
      const date = new Date(item[dateField]);
      if (date.getFullYear() !== year) return;
      
      const month = date.getMonth();
      const value = parseFloat(item[valueField]) || 0;
      monthly[month] += value;
    });
    
    return monthly;
  }
  
  // Calculate YoY comparison metrics
  calculateComparison(year1, year2) {
    const metrics = {
      sales: {
        current: { total: 0, count: 0, monthly: [] },
        previous: { total: 0, count: 0, monthly: [] },
        change: { total: 0, count: 0 }
      },
      tours: {
        current: { total: 0, count: 0, pax: 0, monthly: [] },
        previous: { total: 0, count: 0, pax: 0, monthly: [] },
        change: { total: 0, count: 0, pax: 0 }
      }
    };
    
    // Sales metrics
    const salesYear1 = this.filterByYear(this.salesData, 'tgl_transfer', year1);
    const salesYear2 = this.filterByYear(this.salesData, 'tgl_transfer', year2);
    
    metrics.sales.current.count = salesYear1.length;
    metrics.sales.current.total = salesYear1.reduce((sum, s) => sum + (parseFloat(s.nominal) || 0), 0);
    metrics.sales.current.monthly = this.getMonthlyData(this.salesData, 'tgl_transfer', 'nominal', year1);
    
    metrics.sales.previous.count = salesYear2.length;
    metrics.sales.previous.total = salesYear2.reduce((sum, s) => sum + (parseFloat(s.nominal) || 0), 0);
    metrics.sales.previous.monthly = this.getMonthlyData(this.salesData, 'tgl_transfer', 'nominal', year2);
    
    // Tours metrics
    const toursYear1 = this.filterByYear(this.toursData, 'departure_date', year1);
    const toursYear2 = this.filterByYear(this.toursData, 'departure_date', year2);
    
    metrics.tours.current.count = toursYear1.length;
    metrics.tours.current.total = toursYear1.reduce((sum, t) => sum + (parseFloat(t.total_nominal_sales) || 0), 0);
    metrics.tours.current.pax = toursYear1.reduce((sum, t) => sum + (parseInt(t.jumlah_peserta) || 0), 0);
    metrics.tours.current.monthly = this.getMonthlyData(this.toursData, 'departure_date', 'total_nominal_sales', year1);
    
    metrics.tours.previous.count = toursYear2.length;
    metrics.tours.previous.total = toursYear2.reduce((sum, t) => sum + (parseFloat(t.total_nominal_sales) || 0), 0);
    metrics.tours.previous.pax = toursYear2.reduce((sum, t) => sum + (parseInt(t.jumlah_peserta) || 0), 0);
    metrics.tours.previous.monthly = this.getMonthlyData(this.toursData, 'departure_date', 'total_nominal_sales', year2);
    
    // Calculate percentage changes
    metrics.sales.change.total = this.calcPercentChange(metrics.sales.previous.total, metrics.sales.current.total);
    metrics.sales.change.count = this.calcPercentChange(metrics.sales.previous.count, metrics.sales.current.count);
    
    metrics.tours.change.total = this.calcPercentChange(metrics.tours.previous.total, metrics.tours.current.total);
    metrics.tours.change.count = this.calcPercentChange(metrics.tours.previous.count, metrics.tours.current.count);
    metrics.tours.change.pax = this.calcPercentChange(metrics.tours.previous.pax, metrics.tours.current.pax);
    
    return metrics;
  }
  
  calcPercentChange(oldVal, newVal) {
    if (oldVal === 0) return newVal > 0 ? 100 : 0;
    return ((newVal - oldVal) / oldVal * 100).toFixed(1);
  }
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }
  
  formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num);
  }
  
  // Render YoY dashboard widget
  renderWidget(containerId, year1 = null, year2 = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    year1 = year1 || this.currentYear;
    year2 = year2 || this.comparisonYear;
    
    const metrics = this.calculateComparison(year1, year2);
    const years = this.getAvailableYears();
    
    container.innerHTML = `
      <div class="yoy-widget">
        <div class="yoy-header">
          <h3>📊 Year-over-Year Analytics</h3>
          <div class="yoy-year-selector">
            <select id="yoyYear1" class="yoy-select">
              ${years.map(y => `<option value="${y}" ${y === year1 ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
            <span>vs</span>
            <select id="yoyYear2" class="yoy-select">
              ${years.map(y => `<option value="${y}" ${y === year2 ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
        </div>
        
        <div class="yoy-metrics-grid">
          <div class="yoy-metric-card">
            <div class="yoy-metric-label">Sales Revenue</div>
            <div class="yoy-metric-value">${this.formatCurrency(metrics.sales.current.total)}</div>
            <div class="yoy-metric-change ${parseFloat(metrics.sales.change.total) >= 0 ? 'positive' : 'negative'}">
              ${parseFloat(metrics.sales.change.total) >= 0 ? '↑' : '↓'} ${Math.abs(metrics.sales.change.total)}%
              <span>vs ${year2}</span>
            </div>
            <div class="yoy-metric-previous">
              ${year2}: ${this.formatCurrency(metrics.sales.previous.total)}
            </div>
          </div>
          
          <div class="yoy-metric-card">
            <div class="yoy-metric-label">Sales Transactions</div>
            <div class="yoy-metric-value">${this.formatNumber(metrics.sales.current.count)}</div>
            <div class="yoy-metric-change ${parseFloat(metrics.sales.change.count) >= 0 ? 'positive' : 'negative'}">
              ${parseFloat(metrics.sales.change.count) >= 0 ? '↑' : '↓'} ${Math.abs(metrics.sales.change.count)}%
              <span>vs ${year2}</span>
            </div>
            <div class="yoy-metric-previous">
              ${year2}: ${this.formatNumber(metrics.sales.previous.count)}
            </div>
          </div>
          
          <div class="yoy-metric-card">
            <div class="yoy-metric-label">Tour Revenue</div>
            <div class="yoy-metric-value">${this.formatCurrency(metrics.tours.current.total)}</div>
            <div class="yoy-metric-change ${parseFloat(metrics.tours.change.total) >= 0 ? 'positive' : 'negative'}">
              ${parseFloat(metrics.tours.change.total) >= 0 ? '↑' : '↓'} ${Math.abs(metrics.tours.change.total)}%
              <span>vs ${year2}</span>
            </div>
            <div class="yoy-metric-previous">
              ${year2}: ${this.formatCurrency(metrics.tours.previous.total)}
            </div>
          </div>
          
          <div class="yoy-metric-card">
            <div class="yoy-metric-label">Total Passengers</div>
            <div class="yoy-metric-value">${this.formatNumber(metrics.tours.current.pax)}</div>
            <div class="yoy-metric-change ${parseFloat(metrics.tours.change.pax) >= 0 ? 'positive' : 'negative'}">
              ${parseFloat(metrics.tours.change.pax) >= 0 ? '↑' : '↓'} ${Math.abs(metrics.tours.change.pax)}%
              <span>vs ${year2}</span>
            </div>
            <div class="yoy-metric-previous">
              ${year2}: ${this.formatNumber(metrics.tours.previous.pax)}
            </div>
          </div>
        </div>
        
        <div class="yoy-chart-container">
          <h4>Monthly Revenue Comparison</h4>
          <canvas id="yoyChart"></canvas>
        </div>
      </div>
    `;
    
    this.addStyles();
    this.bindEvents(containerId, year1, year2);
    this.renderChart(metrics, year1, year2);
  }
  
  addStyles() {
    if (document.getElementById('yoyStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'yoyStyles';
    style.textContent = `
      .yoy-widget {
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .yoy-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 16px;
      }
      .yoy-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      .yoy-year-selector {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .yoy-select {
        padding: 8px 16px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        background: var(--bg-alt, #fff);
        font-size: 14px;
        cursor: pointer;
      }
      .yoy-select:focus {
        outline: none;
        border-color: var(--primary, #3b82f6);
      }
      .yoy-metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .yoy-metric-card {
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
        padding: 20px;
      }
      .yoy-metric-label {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
        margin-bottom: 8px;
      }
      .yoy-metric-value {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .yoy-metric-change {
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .yoy-metric-change.positive { color: #10b981; }
      .yoy-metric-change.negative { color: #ef4444; }
      .yoy-metric-change span {
        font-weight: 400;
        color: var(--text-secondary, #6b7280);
        font-size: 12px;
      }
      .yoy-metric-previous {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
        margin-top: 8px;
      }
      .yoy-chart-container {
        margin-top: 24px;
      }
      .yoy-chart-container h4 {
        margin: 0 0 16px 0;
        font-size: 16px;
      }
      #yoyChart {
        max-height: 300px;
      }
    `;
    document.head.appendChild(style);
  }
  
  bindEvents(containerId, year1, year2) {
    document.getElementById('yoyYear1')?.addEventListener('change', (e) => {
      const newYear1 = parseInt(e.target.value);
      this.renderWidget(containerId, newYear1, year2);
    });
    
    document.getElementById('yoyYear2')?.addEventListener('change', (e) => {
      const newYear2 = parseInt(e.target.value);
      this.renderWidget(containerId, year1, newYear2);
    });
  }
  
  renderChart(metrics, year1, year2) {
    const ctx = document.getElementById('yoyChart')?.getContext('2d');
    if (!ctx) return;
    
    // Destroy existing chart
    if (this.chartInstances.yoy) {
      this.chartInstances.yoy.destroy();
    }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Combine sales and tour revenue
    const currentData = metrics.sales.current.monthly.map((v, i) => v + metrics.tours.current.monthly[i]);
    const previousData = metrics.sales.previous.monthly.map((v, i) => v + metrics.tours.previous.monthly[i]);
    
    this.chartInstances.yoy = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: `${year1}`,
            data: currentData.map(v => v / 1000000), // Convert to millions
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4
          },
          {
            label: `${year2}`,
            data: previousData.map(v => v / 1000000),
            borderColor: '#9ca3af',
            backgroundColor: 'rgba(156, 163, 175, 0.1)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                return `${ctx.dataset.label}: ${(ctx.raw).toFixed(1)}M IDR`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Revenue (Millions IDR)'
            }
          }
        }
      }
    });
  }
}

// Export
window.YearOverYearAnalytics = YearOverYearAnalytics;
