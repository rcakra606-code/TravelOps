/**
 * Commission Calculator
 * Automatically calculate staff commission based on sales
 */

class CommissionCalculator {
  constructor() {
    this.defaultRates = {
      tours: {
        base: 3, // 3% of sale value
        bonus: 5, // 5% if above target
        senior: 5, // Senior staff bonus
        manager: 7  // Manager rate
      },
      sales: {
        base: 2,
        bonus: 4,
        senior: 3,
        manager: 5
      }
    };

    this.staffTiers = {
      junior: { multiplier: 1.0, minMonths: 0 },
      standard: { multiplier: 1.1, minMonths: 6 },
      senior: { multiplier: 1.25, minMonths: 24 },
      lead: { multiplier: 1.4, minMonths: 48 }
    };

    this.init();
  }

  init() {
    this.addStyles();
    this.addCommissionButton();
  }

  addCommissionButton() {
    setTimeout(() => {
      const headerActions = document.querySelector('.header-actions, .header > div:last-child');
      if (!headerActions) return;

      // Check if button already exists
      if (document.getElementById('commissionCalcBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'commissionCalcBtn';
      btn.className = 'btn commission-calc-btn';
      btn.innerHTML = '💰 Commission';
      btn.title = 'Calculate staff commissions';
      btn.addEventListener('click', () => this.showCalculator());

      headerActions.appendChild(btn);
    }, 1000);
  }

  async showCalculator() {
    // Remove existing modal
    document.getElementById('commissionModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'commissionModal';
    modal.className = 'commission-modal';
    modal.innerHTML = `
      <div class="commission-content">
        <div class="commission-header">
          <h3>💰 Commission Calculator</h3>
          <button class="commission-close-btn" id="closeCommissionModal">&times;</button>
        </div>
        <div class="commission-body">
          <div class="commission-tabs">
            <button class="commission-tab active" data-tab="calculate">Calculate</button>
            <button class="commission-tab" data-tab="rates">Commission Rates</button>
            <button class="commission-tab" data-tab="history">History</button>
          </div>

          <div class="tab-content" id="calculateTab">
            <div class="calc-form">
              <div class="form-group">
                <label>Staff Member</label>
                <select id="commissionStaff">
                  <option value="">Loading staff...</option>
                </select>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Period Start</label>
                  <input type="date" id="commissionStartDate">
                </div>
                <div class="form-group">
                  <label>Period End</label>
                  <input type="date" id="commissionEndDate">
                </div>
              </div>
              <button class="btn btn-primary" id="calculateCommission">
                📊 Calculate Commission
              </button>
            </div>

            <div id="commissionResults" class="commission-results" style="display: none;">
              <div class="result-header">
                <h4>Commission Summary</h4>
                <span class="period-badge" id="resultPeriod"></span>
              </div>
              
              <div class="result-cards">
                <div class="result-card">
                  <span class="result-label">Total Sales</span>
                  <span class="result-value" id="totalSalesValue">$0</span>
                </div>
                <div class="result-card">
                  <span class="result-label">Commission Rate</span>
                  <span class="result-value" id="commissionRate">0%</span>
                </div>
                <div class="result-card primary">
                  <span class="result-label">Commission Earned</span>
                  <span class="result-value" id="commissionEarned">$0</span>
                </div>
              </div>

              <div class="result-breakdown">
                <h5>Breakdown</h5>
                <table class="breakdown-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Sales</th>
                      <th>Rate</th>
                      <th>Commission</th>
                    </tr>
                  </thead>
                  <tbody id="breakdownBody"></tbody>
                </table>
              </div>

              <div class="result-actions">
                <button class="btn btn-secondary" id="exportCommission">
                  📥 Export Report
                </button>
              </div>
            </div>
          </div>

          <div class="tab-content" id="ratesTab" style="display: none;">
            <div class="rates-info">
              <h4>Current Commission Structure</h4>
              <p class="rates-subtitle">Commission rates by category and tier</p>
            </div>
            <div class="rates-grid">
              <div class="rate-category">
                <h5>🎯 Tours</h5>
                <ul>
                  <li><span>Base Rate:</span> <strong>3%</strong></li>
                  <li><span>Above Target:</span> <strong>5%</strong></li>
                  <li><span>Senior Staff:</span> <strong>5%</strong></li>
                  <li><span>Managers:</span> <strong>7%</strong></li>
                </ul>
              </div>
              <div class="rate-category">
                <h5>📈 Other Sales</h5>
                <ul>
                  <li><span>Base Rate:</span> <strong>2%</strong></li>
                  <li><span>Above Target:</span> <strong>4%</strong></li>
                  <li><span>Senior Staff:</span> <strong>3%</strong></li>
                  <li><span>Managers:</span> <strong>5%</strong></li>
                </ul>
              </div>
            </div>
            <div class="tier-info">
              <h5>Staff Tier Multipliers</h5>
              <div class="tier-grid">
                <div class="tier-card">
                  <span class="tier-name">Junior</span>
                  <span class="tier-mult">1.0x</span>
                  <span class="tier-req">< 6 months</span>
                </div>
                <div class="tier-card">
                  <span class="tier-name">Standard</span>
                  <span class="tier-mult">1.1x</span>
                  <span class="tier-req">6+ months</span>
                </div>
                <div class="tier-card">
                  <span class="tier-name">Senior</span>
                  <span class="tier-mult">1.25x</span>
                  <span class="tier-req">2+ years</span>
                </div>
                <div class="tier-card">
                  <span class="tier-name">Lead</span>
                  <span class="tier-mult">1.4x</span>
                  <span class="tier-req">4+ years</span>
                </div>
              </div>
            </div>
          </div>

          <div class="tab-content" id="historyTab" style="display: none;">
            <div class="history-list" id="commissionHistory">
              <div class="empty-history">
                <span>📋</span>
                <p>No commission history available</p>
                <small>Calculate commissions to build history</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    // Bind events
    this.bindModalEvents();
    this.loadStaffList();
    this.loadHistory();

    // Set default dates (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.getElementById('commissionStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('commissionEndDate').value = lastDay.toISOString().split('T')[0];
  }

  bindModalEvents() {
    document.getElementById('closeCommissionModal')?.addEventListener('click', () => this.closeModal());
    
    document.getElementById('commissionModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'commissionModal') this.closeModal();
    });

    // Tab switching
    document.querySelectorAll('.commission-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.commission-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const tabId = tab.dataset.tab + 'Tab';
        document.getElementById(tabId).style.display = 'block';
      });
    });

    document.getElementById('calculateCommission')?.addEventListener('click', () => this.calculate());
    document.getElementById('exportCommission')?.addEventListener('click', () => this.exportReport());
  }

  async loadStaffList() {
    try {
      const users = await window.fetchJson?.('/api/users') || [];
      const select = document.getElementById('commissionStaff');
      
      select.innerHTML = '<option value="">Select Staff Member</option>';
      users.forEach(user => {
        select.innerHTML += `<option value="${user.id}" data-role="${user.role}">${user.username}</option>`;
      });
    } catch (err) {
      console.error('Failed to load staff:', err);
      // Fallback for basic users who can't access /api/users
      const currentUser = window.getUser?.();
      if (currentUser?.type === 'basic') {
        const select = document.getElementById('commissionStaff');
        select.innerHTML = '<option value="">Select Staff Member</option>';
        select.innerHTML += `<option value="${currentUser.id || currentUser.username}" data-role="staff">${currentUser.name || currentUser.username}</option>`;
      }
    }
  }

  async calculate() {
    const staffId = document.getElementById('commissionStaff').value;
    const startDate = document.getElementById('commissionStartDate').value;
    const endDate = document.getElementById('commissionEndDate').value;

    if (!staffId || !startDate || !endDate) {
      window.toast?.error('Please fill in all fields');
      return;
    }

    const staffSelect = document.getElementById('commissionStaff');
    const staffName = staffSelect.options[staffSelect.selectedIndex].text;
    const staffRole = staffSelect.options[staffSelect.selectedIndex].dataset.role || 'staff';

    const btn = document.getElementById('calculateCommission');
    btn.innerHTML = '⏳ Calculating...';
    btn.disabled = true;

    try {
      // Fetch tours and sales data for this staff member
      const [tours, sales] = await Promise.all([
        window.fetchJson?.('/api/tours') || [],
        window.fetchJson?.('/api/sales') || []
      ]);

      // Filter by staff and date range
      const staffTours = tours.filter(t => {
        const tourDate = new Date(t.date);
        return t.staff_name === staffName && 
               tourDate >= new Date(startDate) && 
               tourDate <= new Date(endDate);
      });

      const staffSales = sales.filter(s => {
        const saleDate = new Date(s.date);
        return s.staff_name === staffName && 
               saleDate >= new Date(startDate) && 
               saleDate <= new Date(endDate);
      });

      // Calculate totals
      const tourTotal = staffTours.reduce((sum, t) => sum + (parseFloat(t.price) || 0), 0);
      const salesTotal = staffSales.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

      // Determine commission rates based on role
      const isManager = staffRole?.toLowerCase().includes('manager');
      const isSenior = staffRole?.toLowerCase().includes('senior');
      
      const tourRate = isManager ? this.defaultRates.tours.manager : 
                       isSenior ? this.defaultRates.tours.senior :
                       this.defaultRates.tours.base;
                       
      const salesRate = isManager ? this.defaultRates.sales.manager :
                        isSenior ? this.defaultRates.sales.senior :
                        this.defaultRates.sales.base;

      const tourCommission = tourTotal * (tourRate / 100);
      const salesCommission = salesTotal * (salesRate / 100);
      const totalCommission = tourCommission + salesCommission;

      // Display results
      document.getElementById('commissionResults').style.display = 'block';
      document.getElementById('resultPeriod').textContent = `${startDate} to ${endDate}`;
      document.getElementById('totalSalesValue').textContent = `$${(tourTotal + salesTotal).toLocaleString()}`;
      document.getElementById('commissionRate').textContent = `${tourRate}-${salesRate}%`;
      document.getElementById('commissionEarned').textContent = `$${totalCommission.toFixed(2)}`;

      // Breakdown
      document.getElementById('breakdownBody').innerHTML = `
        <tr>
          <td>Tours (${staffTours.length})</td>
          <td>$${tourTotal.toLocaleString()}</td>
          <td>${tourRate}%</td>
          <td>$${tourCommission.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Sales (${staffSales.length})</td>
          <td>$${salesTotal.toLocaleString()}</td>
          <td>${salesRate}%</td>
          <td>$${salesCommission.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td><strong>Total</strong></td>
          <td><strong>$${(tourTotal + salesTotal).toLocaleString()}</strong></td>
          <td>-</td>
          <td><strong>$${totalCommission.toFixed(2)}</strong></td>
        </tr>
      `;

      // Save to history
      this.saveToHistory({
        staffName,
        startDate,
        endDate,
        totalSales: tourTotal + salesTotal,
        commission: totalCommission,
        date: new Date().toISOString()
      });

    } catch (err) {
      console.error('Calculation failed:', err);
      window.toast?.error('Failed to calculate commission');
    } finally {
      btn.innerHTML = '📊 Calculate Commission';
      btn.disabled = false;
    }
  }

  saveToHistory(data) {
    const history = JSON.parse(localStorage.getItem('commissionHistory') || '[]');
    history.unshift(data);
    if (history.length > 20) history.pop(); // Keep last 20
    localStorage.setItem('commissionHistory', JSON.stringify(history));
    this.loadHistory();
  }

  loadHistory() {
    const history = JSON.parse(localStorage.getItem('commissionHistory') || '[]');
    const container = document.getElementById('commissionHistory');
    if (!container) return;

    if (history.length === 0) {
      container.innerHTML = `
        <div class="empty-history">
          <span>📋</span>
          <p>No commission history available</p>
          <small>Calculate commissions to build history</small>
        </div>
      `;
      return;
    }

    container.innerHTML = history.map(h => `
      <div class="history-item">
        <div class="history-main">
          <span class="history-staff">${h.staffName}</span>
          <span class="history-period">${h.startDate} - ${h.endDate}</span>
        </div>
        <div class="history-values">
          <span class="history-sales">$${h.totalSales?.toLocaleString()}</span>
          <span class="history-commission">$${h.commission?.toFixed(2)}</span>
        </div>
      </div>
    `).join('');
  }

  exportReport() {
    const staffName = document.getElementById('commissionStaff').options[
      document.getElementById('commissionStaff').selectedIndex
    ].text;
    const period = document.getElementById('resultPeriod').textContent;
    const totalSales = document.getElementById('totalSalesValue').textContent;
    const commission = document.getElementById('commissionEarned').textContent;

    const report = `
Commission Report
================
Staff: ${staffName}
Period: ${period}

Summary
-------
Total Sales: ${totalSales}
Commission Earned: ${commission}

Generated: ${new Date().toLocaleString()}
    `.trim();

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission-${staffName}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    window.toast?.success('Report exported');
  }

  closeModal() {
    const modal = document.getElementById('commissionModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  addStyles() {
    if (document.getElementById('commissionStyles')) return;

    const style = document.createElement('style');
    style.id = 'commissionStyles';
    style.textContent = `
      .commission-calc-btn {
        background: linear-gradient(135deg, #f59e0b, #d97706) !important;
        color: white !important;
      }

      .commission-modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s;
        backdrop-filter: blur(4px);
      }

      .commission-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .commission-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 95%;
        max-width: 600px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
      }

      .commission-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
      }

      .commission-header h3 {
        margin: 0;
        font-size: 18px;
      }

      .commission-close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }

      .commission-body {
        padding: 0;
        overflow-y: auto;
        flex: 1;
      }

      .commission-tabs {
        display: flex;
        background: var(--bg-alt, #f9fafb);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .commission-tab {
        flex: 1;
        padding: 14px;
        border: none;
        background: none;
        cursor: pointer;
        font-weight: 500;
        color: var(--text-secondary, #6b7280);
        transition: all 0.2s;
      }

      .commission-tab.active {
        color: var(--primary, #3b82f6);
        background: var(--card, #fff);
        border-bottom: 2px solid var(--primary, #3b82f6);
      }

      .tab-content {
        padding: 24px;
      }

      .calc-form .form-group {
        margin-bottom: 16px;
      }

      .calc-form label {
        display: block;
        font-weight: 500;
        margin-bottom: 6px;
        font-size: 14px;
      }

      .calc-form select,
      .calc-form input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-light, #d1d5db);
        border-radius: 8px;
        font-size: 14px;
        background: var(--input-bg, #fff);
        color: var(--text, #1f2937);
      }

      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .commission-results {
        margin-top: 24px;
        padding-top: 24px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }

      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .result-header h4 {
        margin: 0;
      }

      .period-badge {
        font-size: 12px;
        padding: 4px 10px;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 20px;
        color: var(--text-secondary, #6b7280);
      }

      .result-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }

      .result-card {
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
        text-align: center;
      }

      .result-card.primary {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
      }

      .result-label {
        display: block;
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
        margin-bottom: 4px;
      }

      .result-card.primary .result-label {
        color: rgba(255,255,255,0.8);
      }

      .result-value {
        font-size: 18px;
        font-weight: 700;
      }

      .result-breakdown h5 {
        margin: 0 0 12px 0;
        font-size: 14px;
      }

      .breakdown-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .breakdown-table th,
      .breakdown-table td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .breakdown-table th {
        background: var(--bg-alt, #f9fafb);
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        color: var(--text-secondary, #6b7280);
      }

      .breakdown-table .total-row {
        background: var(--bg-alt, #f9fafb);
      }

      .result-actions {
        margin-top: 16px;
        text-align: right;
      }

      /* Rates Tab */
      .rates-info {
        margin-bottom: 20px;
      }

      .rates-info h4 {
        margin: 0;
      }

      .rates-subtitle {
        color: var(--text-secondary, #6b7280);
        font-size: 14px;
        margin: 4px 0 0 0;
      }

      .rates-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 24px;
      }

      .rate-category {
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
      }

      .rate-category h5 {
        margin: 0 0 12px 0;
        font-size: 14px;
      }

      .rate-category ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .rate-category li {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 13px;
        border-bottom: 1px dashed var(--border-light, #e5e7eb);
      }

      .rate-category li:last-child {
        border-bottom: none;
      }

      .tier-info h5 {
        margin: 0 0 12px 0;
      }

      .tier-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }

      .tier-card {
        text-align: center;
        padding: 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
      }

      .tier-name {
        display: block;
        font-weight: 600;
        font-size: 13px;
        margin-bottom: 4px;
      }

      .tier-mult {
        display: block;
        font-size: 18px;
        font-weight: 700;
        color: var(--primary, #3b82f6);
      }

      .tier-req {
        display: block;
        font-size: 11px;
        color: var(--text-secondary, #6b7280);
        margin-top: 4px;
      }

      /* History Tab */
      .empty-history {
        text-align: center;
        padding: 40px;
        color: var(--text-secondary, #6b7280);
      }

      .empty-history span {
        font-size: 48px;
      }

      .history-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
        margin-bottom: 10px;
      }

      .history-staff {
        font-weight: 600;
        display: block;
      }

      .history-period {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }

      .history-values {
        text-align: right;
      }

      .history-sales {
        display: block;
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }

      .history-commission {
        font-weight: 700;
        color: #10b981;
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.commissionCalculator = new CommissionCalculator();
