// ============================================
// STAFF LEADERBOARD MODULE
// Enhanced staff performance tracking
// ============================================

class StaffLeaderboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.salesData = [];
    this.toursData = [];
    this.period = 'month'; // month, quarter, year, all
    this.metric = 'revenue'; // revenue, transactions, tours, pax
  }
  
  async init() {
    await this.loadData();
    this.render();
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
    } catch (err) {
      console.error('Failed to load leaderboard data:', err);
    }
  }
  
  getDateRange(period) {
    const now = new Date();
    const start = new Date();
    
    switch (period) {
      case 'month':
        start.setMonth(now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start.setMonth(quarter * 3, 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'year':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'all':
        start.setFullYear(2000);
        break;
    }
    
    return { start, end: now };
  }
  
  filterByPeriod(data, dateField) {
    const { start, end } = this.getDateRange(this.period);
    
    return data.filter(item => {
      if (!item[dateField]) return false;
      const date = new Date(item[dateField]);
      return date >= start && date <= end;
    });
  }
  
  calculateLeaderboard() {
    const { start, end } = this.getDateRange(this.period);
    
    // Filter data by period
    const filteredSales = this.filterByPeriod(this.salesData, 'tgl_transfer');
    const filteredTours = this.filterByPeriod(this.toursData, 'departure_date');
    
    // Group by staff
    const staffMap = new Map();
    
    // Process sales
    filteredSales.forEach(sale => {
      const staffName = sale.sales_name || sale.staff_name || 'Unknown';
      if (!staffMap.has(staffName)) {
        staffMap.set(staffName, {
          name: staffName,
          salesRevenue: 0,
          salesCount: 0,
          tourRevenue: 0,
          tourCount: 0,
          pax: 0,
          avgDealSize: 0,
          regions: new Set()
        });
      }
      const staff = staffMap.get(staffName);
      staff.salesRevenue += parseFloat(sale.nominal) || 0;
      staff.salesCount += 1;
      if (sale.region) staff.regions.add(sale.region);
    });
    
    // Process tours
    filteredTours.forEach(tour => {
      const staffName = tour.staff_name || 'Unknown';
      if (!staffMap.has(staffName)) {
        staffMap.set(staffName, {
          name: staffName,
          salesRevenue: 0,
          salesCount: 0,
          tourRevenue: 0,
          tourCount: 0,
          pax: 0,
          avgDealSize: 0,
          regions: new Set()
        });
      }
      const staff = staffMap.get(staffName);
      staff.tourRevenue += parseFloat(tour.total_nominal_sales) || 0;
      staff.tourCount += 1;
      staff.pax += parseInt(tour.jumlah_peserta) || 0;
    });
    
    // Calculate totals and sort
    const leaderboard = Array.from(staffMap.values()).map(staff => {
      staff.totalRevenue = staff.salesRevenue + staff.tourRevenue;
      staff.totalTransactions = staff.salesCount + staff.tourCount;
      staff.avgDealSize = staff.totalTransactions > 0 ? staff.totalRevenue / staff.totalTransactions : 0;
      staff.regions = Array.from(staff.regions);
      return staff;
    });
    
    // Sort based on metric
    return leaderboard.sort((a, b) => {
      switch (this.metric) {
        case 'revenue': return b.totalRevenue - a.totalRevenue;
        case 'transactions': return b.totalTransactions - a.totalTransactions;
        case 'tours': return b.tourCount - a.tourCount;
        case 'pax': return b.pax - a.pax;
        default: return b.totalRevenue - a.totalRevenue;
      }
    });
  }
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }
  
  formatCompact(amount) {
    if (amount >= 1000000000) return (amount / 1000000000).toFixed(1) + 'B';
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
    return amount.toString();
  }
  
  getRankBadge(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }
  
  getPerformanceLevel(staff, maxRevenue) {
    const ratio = staff.totalRevenue / maxRevenue;
    if (ratio >= 0.8) return { level: 'Elite', color: '#8b5cf6' };
    if (ratio >= 0.6) return { level: 'Star', color: '#f59e0b' };
    if (ratio >= 0.4) return { level: 'Pro', color: '#3b82f6' };
    return { level: 'Rising', color: '#6b7280' };
  }
  
  render() {
    if (!this.container) return;
    
    const leaderboard = this.calculateLeaderboard();
    const maxRevenue = leaderboard[0]?.totalRevenue || 1;
    
    this.container.innerHTML = `
      <div class="leaderboard-widget">
        <div class="leaderboard-header">
          <h3>🏆 Staff Leaderboard</h3>
          <div class="leaderboard-filters">
            <select id="lbPeriod" class="lb-select">
              <option value="month" ${this.period === 'month' ? 'selected' : ''}>This Month</option>
              <option value="quarter" ${this.period === 'quarter' ? 'selected' : ''}>This Quarter</option>
              <option value="year" ${this.period === 'year' ? 'selected' : ''}>This Year</option>
              <option value="all" ${this.period === 'all' ? 'selected' : ''}>All Time</option>
            </select>
            <select id="lbMetric" class="lb-select">
              <option value="revenue" ${this.metric === 'revenue' ? 'selected' : ''}>By Revenue</option>
              <option value="transactions" ${this.metric === 'transactions' ? 'selected' : ''}>By Transactions</option>
              <option value="tours" ${this.metric === 'tours' ? 'selected' : ''}>By Tours</option>
              <option value="pax" ${this.metric === 'pax' ? 'selected' : ''}>By Passengers</option>
            </select>
          </div>
        </div>
        
        <div class="leaderboard-top3">
          ${this.renderTop3(leaderboard.slice(0, 3), maxRevenue)}
        </div>
        
        <div class="leaderboard-list">
          ${this.renderList(leaderboard.slice(3), maxRevenue)}
        </div>
        
        <div class="leaderboard-summary">
          <div class="summary-item">
            <span class="summary-label">Total Team Revenue</span>
            <span class="summary-value">${this.formatCurrency(leaderboard.reduce((s, l) => s + l.totalRevenue, 0))}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Avg per Staff</span>
            <span class="summary-value">${this.formatCurrency(leaderboard.length > 0 ? leaderboard.reduce((s, l) => s + l.totalRevenue, 0) / leaderboard.length : 0)}</span>
          </div>
        </div>
      </div>
    `;
    
    this.addStyles();
    this.bindEvents();
  }
  
  renderTop3(top3, maxRevenue) {
    if (top3.length === 0) {
      return '<div class="no-data">No data for this period</div>';
    }
    
    // Reorder for display: 2nd, 1st, 3rd
    const displayOrder = [];
    if (top3[1]) displayOrder.push({ ...top3[1], rank: 2 });
    if (top3[0]) displayOrder.push({ ...top3[0], rank: 1 });
    if (top3[2]) displayOrder.push({ ...top3[2], rank: 3 });
    
    return displayOrder.map(staff => {
      const perf = this.getPerformanceLevel(staff, maxRevenue);
      const isFirst = staff.rank === 1;
      
      return `
        <div class="top3-card ${isFirst ? 'first' : ''}" data-rank="${staff.rank}">
          <div class="top3-rank">${this.getRankBadge(staff.rank)}</div>
          <div class="top3-avatar" style="background-color: ${perf.color}20; border-color: ${perf.color}">
            ${staff.name.charAt(0).toUpperCase()}
          </div>
          <div class="top3-name">${staff.name}</div>
          <div class="top3-value">${this.formatCompact(staff.totalRevenue)}</div>
          <div class="top3-badge" style="background-color: ${perf.color}20; color: ${perf.color}">
            ${perf.level}
          </div>
          <div class="top3-stats">
            <span title="Sales">${staff.salesCount} 💰</span>
            <span title="Tours">${staff.tourCount} ✈️</span>
            <span title="Passengers">${staff.pax} 👥</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  renderList(staffList, maxRevenue) {
    if (staffList.length === 0) return '';
    
    return staffList.map((staff, index) => {
      const rank = index + 4;
      const perf = this.getPerformanceLevel(staff, maxRevenue);
      const progressWidth = (staff.totalRevenue / maxRevenue * 100).toFixed(0);
      
      return `
        <div class="lb-list-item">
          <div class="lb-rank">${rank}</div>
          <div class="lb-avatar" style="background-color: ${perf.color}20; color: ${perf.color}">
            ${staff.name.charAt(0).toUpperCase()}
          </div>
          <div class="lb-info">
            <div class="lb-name">${staff.name}</div>
            <div class="lb-progress-bar">
              <div class="lb-progress" style="width: ${progressWidth}%; background-color: ${perf.color}"></div>
            </div>
          </div>
          <div class="lb-metrics">
            <span>${this.formatCompact(staff.totalRevenue)}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  addStyles() {
    if (document.getElementById('leaderboardStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'leaderboardStyles';
    style.textContent = `
      .leaderboard-widget {
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .leaderboard-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 12px;
      }
      .leaderboard-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      .leaderboard-filters {
        display: flex;
        gap: 8px;
      }
      .lb-select {
        padding: 8px 12px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        background: var(--bg-alt, #fff);
        font-size: 13px;
        cursor: pointer;
      }
      .leaderboard-top3 {
        display: flex;
        justify-content: center;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 32px;
        padding: 20px 0;
      }
      .top3-card {
        text-align: center;
        padding: 20px 16px;
        border-radius: 16px;
        background: var(--bg-alt, #f9fafb);
        min-width: 120px;
        transition: transform 0.2s;
      }
      .top3-card:hover {
        transform: translateY(-4px);
      }
      .top3-card.first {
        transform: scale(1.1);
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        box-shadow: 0 4px 20px rgba(245, 158, 11, 0.2);
      }
      .top3-card.first:hover {
        transform: scale(1.1) translateY(-4px);
      }
      .top3-card[data-rank="2"], .top3-card[data-rank="3"] {
        margin-top: 20px;
      }
      .top3-rank {
        font-size: 28px;
        margin-bottom: 8px;
      }
      .top3-avatar {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        font-weight: 700;
        margin: 0 auto 12px;
        border: 3px solid;
      }
      .top3-name {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100px;
      }
      .top3-value {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .top3-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .top3-stats {
        display: flex;
        justify-content: center;
        gap: 8px;
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }
      .leaderboard-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 24px;
      }
      .lb-list-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
        transition: background 0.2s;
      }
      .lb-list-item:hover {
        background: var(--border-light, #e5e7eb);
      }
      .lb-rank {
        width: 24px;
        text-align: center;
        font-weight: 600;
        color: var(--text-secondary, #6b7280);
      }
      .lb-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
      }
      .lb-info {
        flex: 1;
      }
      .lb-name {
        font-weight: 500;
        font-size: 14px;
        margin-bottom: 4px;
      }
      .lb-progress-bar {
        height: 6px;
        background: var(--border-light, #e5e7eb);
        border-radius: 3px;
        overflow: hidden;
      }
      .lb-progress {
        height: 100%;
        border-radius: 3px;
        transition: width 0.5s ease;
      }
      .lb-metrics {
        font-weight: 600;
        font-size: 14px;
      }
      .leaderboard-summary {
        display: flex;
        gap: 24px;
        padding-top: 20px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }
      .summary-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .summary-label {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }
      .summary-value {
        font-size: 16px;
        font-weight: 600;
      }
      .no-data {
        text-align: center;
        padding: 40px;
        color: var(--text-secondary, #6b7280);
      }
      
      @media (max-width: 640px) {
        .leaderboard-top3 {
          flex-direction: column;
          align-items: center;
        }
        .top3-card.first {
          transform: scale(1);
          order: -1;
        }
        .top3-card[data-rank="2"], .top3-card[data-rank="3"] {
          margin-top: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  bindEvents() {
    document.getElementById('lbPeriod')?.addEventListener('change', (e) => {
      this.period = e.target.value;
      this.render();
    });
    
    document.getElementById('lbMetric')?.addEventListener('change', (e) => {
      this.metric = e.target.value;
      this.render();
    });
  }
}

// Export
window.StaffLeaderboard = StaffLeaderboard;
