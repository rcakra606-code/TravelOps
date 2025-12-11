// ============================================
// HELPER FUNCTIONS
// ============================================
function showNotification(message, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transform = 'translateX(100%)';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// Authenticated fetch helper
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  
  return response;
}


// ============================================
// AUTHENTICATION & ROLE CHECK
// ============================================
async function checkAuth() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login.html';
      return null;
    }
    
    const response = await fetchWithAuth('/api/me', { credentials: 'include' });
    
    if (!response.ok) {
      window.location.href = '/login.html';
      return null;
    }
    
    const user = await response.json();
    
    // Role-based access: Only admin and semi-admin can access reports
    if (user.type !== 'admin' && user.type !== 'semi-admin') {
      showNotification('Access Denied: Reports are only available for admin and semi-admin users', 'error');
      setTimeout(() => {
        window.location.href = '/single-dashboard.html';
      }, 2000);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/login.html';
    return null;
  }
}

// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let reportData = null;
let chartInstances = [];

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await checkAuth();
  if (!currentUser) return;

  // Display user info in sidebar
  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');
  if (userName) userName.textContent = currentUser.name || currentUser.username || '—';
  if (userRole) {
    const roleMap = { admin: 'Administrator', 'semi-admin': 'Semi Admin', basic: 'Staff' };
    userRole.textContent = roleMap[currentUser.type] || currentUser.type || '—';
  }

  await initializePage();
  setupEventListeners();
  setDefaultDates();
});

async function initializePage() {
  // Set report generation date
  document.getElementById('reportDate').textContent = new Date().toLocaleString();
  
  // Update hero stats
  updateHeroStats();
  
  // Setup quick report buttons
  document.querySelectorAll('.quick-report-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const reportType = btn.dataset.report;
      const period = btn.dataset.period;
      
      // Set form values
      document.getElementById('reportType').value = reportType;
      document.getElementById('quickPeriod').value = period;
      setQuickPeriod(period);
      
      // Generate report
      setTimeout(() => generateReport(), 100);
      
      // Visual feedback
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => btn.style.transform = '', 200);
    });
  });
}

function updateHeroStats() {
  // Count total reports (from localStorage or default)
  const reportCount = localStorage.getItem('totalReportsGenerated') || '0';
  document.getElementById('heroTotalReports').textContent = reportCount;
  
  // Last update time
  const lastUpdate = localStorage.getItem('lastReportTime');
  if (lastUpdate) {
    const date = new Date(parseInt(lastUpdate));
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / 60000);
    
    if (diffMinutes < 1) {
      document.getElementById('heroLastUpdate').textContent = 'Just now';
    } else if (diffMinutes < 60) {
      document.getElementById('heroLastUpdate').textContent = `${diffMinutes}m ago`;
    } else if (diffMinutes < 1440) {
      document.getElementById('heroLastUpdate').textContent = `${Math.floor(diffMinutes / 60)}h ago`;
    } else {
      document.getElementById('heroLastUpdate').textContent = `${Math.floor(diffMinutes / 1440)}d ago`;
    }
  } else {
    document.getElementById('heroLastUpdate').textContent = 'Never';
  }
}

function setupEventListeners() {
  document.getElementById('generateBtn').addEventListener('click', generateReport);
  document.getElementById('exportPdfBtn').addEventListener('click', exportToPDF);
  document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
  document.getElementById('printBtn').addEventListener('click', printReport);
  document.getElementById('refreshBtn').addEventListener('click', () => location.reload());
  
  // Quick period selector
  document.getElementById('quickPeriod').addEventListener('change', (e) => {
    setQuickPeriod(e.target.value);
  });
  
  // Dark mode toggle
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const toggleBtn = document.getElementById('darkModeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      toggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    });
  }
}

function setDefaultDates() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  document.getElementById('dateTo').valueAsDate = today;
  document.getElementById('dateFrom').valueAsDate = firstDayOfMonth;
}

function setQuickPeriod(period) {
  if (!period) return;
  
  const today = new Date();
  let from, to;
  
  switch (period) {
    case 'today':
      from = to = today;
      break;
    case 'yesterday':
      from = to = new Date(today.setDate(today.getDate() - 1));
      break;
    case 'this-week':
      from = new Date(today.setDate(today.getDate() - today.getDay()));
      to = new Date();
      break;
    case 'last-week':
      from = new Date(today.setDate(today.getDate() - today.getDay() - 7));
      to = new Date(today.setDate(today.getDate() + 6));
      break;
    case 'this-month':
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date();
      break;
    case 'last-month':
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'this-quarter':
      const q = Math.floor(today.getMonth() / 3);
      from = new Date(today.getFullYear(), q * 3, 1);
      to = new Date();
      break;
    case 'last-quarter':
      const lq = Math.floor(today.getMonth() / 3) - 1;
      from = new Date(today.getFullYear(), lq * 3, 1);
      to = new Date(today.getFullYear(), lq * 3 + 3, 0);
      break;
    case 'this-year':
      from = new Date(today.getFullYear(), 0, 1);
      to = new Date();
      break;
    case 'last-year':
      from = new Date(today.getFullYear() - 1, 0, 1);
      to = new Date(today.getFullYear() - 1, 11, 31);
      break;
  }
  
  if (from && to) {
    document.getElementById('dateFrom').valueAsDate = from;
    document.getElementById('dateTo').valueAsDate = to;
  }
}



// ============================================
// REPORT GENERATION
// ============================================
async function generateReport() {
  const reportType = document.getElementById('reportType').value;
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  
  if (!dateFrom || !dateTo) {
    showNotification('Please select date range', 'error');
    return;
  }
  
  // Show loading state
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('reportPreview').style.display = 'none';
  document.getElementById('loadingState').style.display = 'block';
  
  try {
    // Fetch report data based on type
    const params = new URLSearchParams({
      from: dateFrom,
      to: dateTo
    });
    
    const endpoint = `/api/reports/${reportType}?${params}`;
    const response = await fetchWithAuth(endpoint);
    
    if (!response.ok) {
      throw new Error('Failed to generate report');
    }
    
    reportData = await response.json();
    
    // Render the report
    renderReport(reportType, reportData);
    
    // Update report counter
    const currentCount = parseInt(localStorage.getItem('totalReportsGenerated') || '0');
    localStorage.setItem('totalReportsGenerated', (currentCount + 1).toString());
    localStorage.setItem('lastReportTime', Date.now().toString());
    updateHeroStats();
    
    // Enable export buttons
    const exportButtons = ['exportPdfBtn', 'exportExcelBtn', 'exportCsvBtn', 'printBtn'];
    exportButtons.forEach(btnId => {
      const btn = document.getElementById(btnId);
      btn.disabled = false;
      btn.style.background = 'var(--card)';
      btn.style.color = 'var(--text-primary)';
      btn.style.cursor = 'pointer';
      btn.style.borderColor = 'var(--border-medium)';
    });
    
    showNotification('Report generated successfully', 'success');
  } catch (error) {
    console.error('Report generation failed:', error);
    showNotification('Failed to generate report: ' + error.message, 'error');
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
  }
}

function renderReport(reportType, data) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('reportPreview').style.display = 'block';
  
  // Update report header
  const titles = {
    'sales-summary': '📈 Sales Summary Report',
    'sales-detailed': '📋 Detailed Sales Report',
    'tours-profitability': '💰 Tours Profitability Analysis',
    'tours-participants': '👥 Tours Participation Report',
    'documents-status': '📄 Documents Status Report',
    'staff-performance': '⭐ Staff Performance Report',
    'regional-comparison': '🗺️ Regional Comparison Report',
    'executive-summary': '📊 Executive Summary Report'
  };
  
  document.getElementById('reportTitle').textContent = titles[reportType] || 'Report';
  
  const from = document.getElementById('dateFrom').value;
  const to = document.getElementById('dateTo').value;
  document.getElementById('reportPeriod').textContent = `Period: ${formatDate(from)} to ${formatDate(to)}`;
  document.getElementById('reportDate').textContent = new Date().toLocaleString();
  
  // Render based on report type
  switch (reportType) {
    case 'sales-summary':
      renderSalesSummary(data);
      break;
    case 'sales-detailed':
      renderSalesDetailed(data);
      break;
    case 'tours-profitability':
      renderToursProfitability(data);
      break;
    case 'tours-participants':
      renderToursParticipants(data);
      break;
    case 'documents-status':
      renderDocumentsStatus(data);
      break;
    case 'staff-performance':
      renderStaffPerformance(data);
      break;
    case 'regional-comparison':
      renderRegionalComparison(data);
      break;
    case 'executive-summary':
      renderExecutiveSummary(data);
      break;
  }
}

// ============================================
// REPORT RENDERERS
// ============================================
function renderSalesSummary(data) {
  // Clear previous charts
  destroyCharts();
  
  // Summary Metrics
  const metrics = document.getElementById('summaryMetrics');
  metrics.innerHTML = `
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">💰</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Sales</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalSales || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">${data.summary.salesCount || 0} transactions</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🎯</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Profit</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalProfit || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Net profit earned</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📊</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Profit Margin</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatPercent((data.summary.profitMargin || 0) / 100)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Average margin</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📈</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Average Sale</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.averageSale || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Per transaction</div>
    </div>
  `;
  
  // Charts
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📈</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Sales & Profit Trend by Month</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="salesTrendChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">👥</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Staff Performance Comparison</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="staffComparisonChart"></canvas>
      </div>
    </div>
  `;
  
  // Render charts with new data structure
  if (data.chartData?.trend) {
    renderMultiLineChart('salesTrendChart', 'Sales & Profit by Month', data.chartData.trend);
  }
  if (data.chartData?.byStaff) {
    renderStaffComparisonChart('staffComparisonChart', data.chartData.byStaff);
  }
  
  // Data Table
  renderDataTable(data.tableData || [], [
    { key: 'month', label: 'Month' },
    { key: 'staff_name', label: 'Staff' },
    { key: 'region_name', label: 'Region' },
    { key: 'sales_amount', label: 'Sales', format: 'currency' },
    { key: 'profit_amount', label: 'Profit', format: 'currency' }
  ]);
}

function renderSalesDetailed(data) {
  destroyCharts();
  
  const metrics = document.getElementById('summaryMetrics');
  metrics.innerHTML = `
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📋</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Transactions</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalCount || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">All transactions</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">✅</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Completed</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.completedCount || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Confirmed payments</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">⏳</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Pending</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.pendingCount || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Awaiting confirmation</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">💰</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Revenue</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalRevenue || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Gross income</div>
    </div>
  `;
  
  renderDataTable(data.tableData || [], [
    { key: 'invoice_no', label: 'Invoice No' },
    { key: 'unique_code', label: 'Code' },
    { key: 'staff_name', label: 'Staff' },
    { key: 'region_name', label: 'Region' },
    { key: 'sales_amount', label: 'Amount', format: 'currency' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Date', format: 'date' }
  ]);
}

function renderToursProfitability(data) {
  destroyCharts();
  
  const metrics = document.getElementById('summaryMetrics');
  metrics.innerHTML = `
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🗺️</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Tours</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalTours || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Active tours</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">👥</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Participants</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalParticipants || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Total travelers</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">💵</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Revenue</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalRevenue || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Gross income</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📈</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Profit</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalProfit || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Net profit</div>
    </div>
  `;
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden; grid-column: 1 / -1;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">🗺️</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Top 10 Tours by Tour Code</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="destinationChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.byDestination) {
    renderTourDestinationChart('destinationChart', data.chartData.byDestination);
  }
  
  renderDataTable(data.tableData || [], [
    { key: 'tour_code', label: 'Tour Code' },
    { key: 'booking_code', label: 'Booking Code' },
    { key: 'lead_passenger', label: 'Lead Passenger' },
    { key: 'departure_date', label: 'Departure', format: 'date' },
    { key: 'jumlah_peserta', label: 'Participants' },
    { key: 'staff_name', label: 'Staff' },
    { key: 'region_name', label: 'Region' }
  ]);
}

function renderToursParticipants(data) {
  destroyCharts();
  
  const metrics = document.getElementById('summaryMetrics');
  metrics.innerHTML = `
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">👥</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Participants</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalParticipants || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">All tour participants</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🗺️</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Tours</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalTours || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Active tours</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📏</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Average per Tour</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${(data.summary.averagePerTour || 0).toFixed(1)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Participants/tour</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🎯</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Occupancy Rate</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatPercent(data.summary.occupancyRate || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Capacity utilization</div>
    </div>
  `;
  
  renderDataTable(data.tableData || [], [
    { key: 'tour_code', label: 'Tour Code' },
    { key: 'lead_passenger', label: 'Lead Passenger' },
    { key: 'departure_date', label: 'Departure', format: 'date' },
    { key: 'jumlah_peserta', label: 'Participants' },
    { key: 'staff_name', label: 'Staff' },
    { key: 'region_name', label: 'Region' }
  ]);
}

function renderDocumentsStatus(data) {
  destroyCharts();
  
  const metrics = document.getElementById('summaryMetrics');
  metrics.innerHTML = `
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📄</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Documents</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalDocuments || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">All documents</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">✅</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Completed</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.completedCount || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Finished processing</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🔄</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">In Progress</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.inProgressCount || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Currently processing</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">⏱️</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Avg Processing Time</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${(data.summary.avgProcessingDays || 0).toFixed(1)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Days average</div>
    </div>
  `;
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📊</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Documents by Process Type</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="processTypeChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📅</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Processing Timeline</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="timelineChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.byProcessType) {
    renderPieChart('processTypeChart', 'By Process Type', data.chartData.byProcessType);
  }
  
  renderDataTable(data.tableData || [], [
    { key: 'guest_name', label: 'Guest Name' },
    { key: 'process_type', label: 'Process Type' },
    { key: 'receive_date', label: 'Received', format: 'date' },
    { key: 'estimated_done', label: 'Est. Done', format: 'date' },
    { key: 'staff_name', label: 'Staff' },
    { key: 'status', label: 'Status' }
  ]);
}

function renderStaffPerformance(data) {
  destroyCharts();
  
  const metrics = document.getElementById('summaryMetrics');
  metrics.innerHTML = `
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">👥</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Staff</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalStaff || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Active staff members</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">💰</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Sales</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalSales || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Combined revenue</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📈</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Profit</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalProfit || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Combined profit</div>
    </div>
  `;
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">👤</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Staff Sales & Profit Comparison</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="staffSalesChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📊</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Transaction Count</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="staffTransactionsChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.staffSales) {
    renderStaffComparisonChart('staffSalesChart', data.chartData.staffSales);
  }
  if (data.chartData?.staffTransactions) {
    renderBarChart('staffTransactionsChart', 'Transactions', data.chartData.staffTransactions);
  }
  
  renderDataTable(data.tableData || [], [
    { key: 'staff_name', label: 'Staff Name' },
    { key: 'region_name', label: 'Region' },
    { key: 'total_sales', label: 'Total Sales', format: 'currency' },
    { key: 'total_profit', label: 'Total Profit', format: 'currency' },
    { key: 'transaction_count', label: 'Transactions' },
    { key: 'average_sale', label: 'Avg Sale', format: 'currency' },
    { key: 'profit_margin', label: 'Margin %', format: 'percent' }
  ]);
}

function renderRegionalComparison(data) {
  destroyCharts();
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">🌍</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Revenue by Region</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="regionRevenueChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📊</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Regional Performance</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="regionPerformanceChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.regionRevenue) {
    renderBarChart('regionRevenueChart', 'Revenue by Region', data.chartData.regionRevenue);
  }
  
  renderDataTable(data.tableData || [], [
    { key: 'region_name', label: 'Region' },
    { key: 'total_sales', label: 'Sales', format: 'currency' },
    { key: 'total_tours', label: 'Tours' },
    { key: 'total_participants', label: 'Participants' },
    { key: 'market_share', label: 'Market Share', format: 'percent' }
  ]);
}

function renderExecutiveSummary(data) {
  destroyCharts();
  
  const metrics = document.getElementById('summaryMetrics');
  metrics.innerHTML = `
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">💵</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Sales</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalSales || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">${data.summary.transactionCount || 0} transactions</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📈</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Profit</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalProfit || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">${formatPercent((data.summary.profitMargin || 0) / 100)} margin</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🗺️</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Active Tours</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalTours || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">${data.summary.totalParticipants || 0} participants</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📄</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Documents</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalDocuments || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">${data.summary.pendingDocuments || 0} pending • ${data.summary.completedDocuments || 0} completed</div>
    </div>
  `;
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden; grid-column: 1 / -1;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">🏆</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Top Performing Staff</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="topStaffChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.topStaff) {
    renderBarChart('topStaffChart', 'Top Staff by Sales', data.chartData.topStaff);
  }
  
  // Show top staff in table
  if (data.topStaff && data.topStaff.length > 0) {
    renderDataTable(data.topStaff, [
      { key: 'staff_name', label: 'Staff Name' },
      { key: 'total_sales', label: 'Total Sales', format: 'currency' }
    ]);
  } else {
    document.getElementById('reportTableBody').innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 40px; color: var(--text-secondary);">No data available</td></tr>';
  }
}

// ============================================
// CHART HELPERS
// ============================================
function destroyCharts() {
  chartInstances.forEach(chart => chart.destroy());
  chartInstances = [];
}

function renderLineChart(canvasId, label, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.labels || [],
      datasets: [{
        label: label,
        data: data.values || [],
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      }
    }
  });
  
  chartInstances.push(chart);
}

function renderMultiLineChart(canvasId, label, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.labels || [],
      datasets: [
        {
          label: 'Sales',
          data: data.sales || [],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Profit',
          data: data.profit || [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top' }
      }
    }
  });
  
  chartInstances.push(chart);
}

function renderStaffComparisonChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels || [],
      datasets: [
        {
          label: 'Sales',
          data: data.sales || [],
          backgroundColor: '#2563eb'
        },
        {
          label: 'Profit',
          data: data.profit || [],
          backgroundColor: '#10b981'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top' }
      }
    }
  });
  
  chartInstances.push(chart);
}

function renderTourDestinationChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels || [],
      datasets: [
        {
          label: 'Tour Count',
          data: data.tourCount || [],
          backgroundColor: '#2563eb'
        },
        {
          label: 'Participants',
          data: data.participants || [],
          backgroundColor: '#10b981'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top' }
      }
    }
  });
  
  chartInstances.push(chart);
}

function renderBarChart(canvasId, label, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels || [],
      datasets: [{
        label: label,
        data: data.values || [],
        backgroundColor: '#2563eb'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      }
    }
  });
  
  chartInstances.push(chart);
}

function renderPieChart(canvasId, label, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const colors = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#db2777', '#0ea5e9'];
  
  const chart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: data.labels || [],
      datasets: [{
        label: label,
        data: data.values || [],
        backgroundColor: colors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true
    }
  });
  
  chartInstances.push(chart);
}

// ============================================
// TABLE RENDERER
// ============================================
function renderDataTable(data, columns) {
  const thead = document.getElementById('reportTableHead');
  const tbody = document.getElementById('reportTableBody');
  
  // Headers
  thead.innerHTML = `<tr>${columns.map(col => `<th>${col.label}</th>`).join('')}</tr>`;
  
  // Rows
  tbody.innerHTML = data.map(row => `
    <tr>
      ${columns.map(col => {
        let value = row[col.key];
        if (col.format === 'currency') value = formatCurrency(value);
        else if (col.format === 'percent') value = formatPercent(value);
        else if (col.format === 'date') value = formatDate(value);
        return `<td>${value || '-'}</td>`;
      }).join('')}
    </tr>
  `).join('');
}

// ============================================
// EXPORT FUNCTIONS
// ============================================
async function exportToPDF() {
  if (!reportData) return;
  
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('TravelOps Report', 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    const reportTitle = document.getElementById('reportTitle').textContent;
    doc.text(reportTitle, 105, 25, { align: 'center' });
    
    doc.setFontSize(10);
    const period = document.getElementById('reportPeriod').textContent;
    doc.text(period, 105, 32, { align: 'center' });
    
    // Table
    const table = document.getElementById('reportTable');
    if (table) {
      doc.autoTable({
        html: table,
        startY: 40,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] }
      });
    }
    
    // Save
    const filename = `report-${new Date().getTime()}.pdf`;
    doc.save(filename);
    
    showNotification('PDF exported successfully', 'success');
  } catch (error) {
    console.error('PDF export failed:', error);
    showNotification('Failed to export PDF', 'error');
  }
}

async function exportToExcel() {
  showNotification('Excel export requires backend implementation with exceljs', 'info');
  // This would need backend API endpoint to generate Excel file
}

async function exportToCSV() {
  if (!reportData || !reportData.tableData) return;
  
  try {
    const table = document.getElementById('reportTable');
    const rows = Array.from(table.querySelectorAll('tr'));
    
    const csv = rows.map(row => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map(cell => `"${cell.textContent}"`).join(',');
    }).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('CSV exported successfully', 'success');
  } catch (error) {
    console.error('CSV export failed:', error);
    showNotification('Failed to export CSV', 'error');
  }
}

function printReport() {
  window.print();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(value) {
  if (!value && value !== 0) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  if (!value && value !== 0) return '0%';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
