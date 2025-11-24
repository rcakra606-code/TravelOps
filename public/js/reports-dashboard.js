import { openModal, closeModal, showNotification } from './dashboard.js';

// ============================================
// AUTHENTICATION & ROLE CHECK
// ============================================
async function checkAuth() {
  try {
    const response = await fetch('/api/me', { credentials: 'include' });
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

  await initializePage();
  setupEventListeners();
  setDefaultDates();
});

async function initializePage() {
  // Load filter dropdowns
  await loadStaffList();
  await loadRegionList();
  
  // Set report generation date
  document.getElementById('reportDate').textContent = new Date().toLocaleString();
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
// DATA LOADING
// ============================================
async function loadStaffList() {
  try {
    const response = await fetch('/api/users');
    if (!response.ok) return;
    const users = await response.json();
    
    const select = document.getElementById('filterStaff');
    select.innerHTML = '<option value="">All Staff</option>';
    users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.name;
      option.textContent = user.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load staff:', error);
  }
}

async function loadRegionList() {
  try {
    const response = await fetch('/api/regions');
    if (!response.ok) return;
    const regions = await response.json();
    
    const select = document.getElementById('filterRegion');
    select.innerHTML = '<option value="">All Regions</option>';
    regions.forEach(region => {
      const option = document.createElement('option');
      option.value = region.id;
      option.textContent = region.region_name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load regions:', error);
  }
}

// ============================================
// REPORT GENERATION
// ============================================
async function generateReport() {
  const reportType = document.getElementById('reportType').value;
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  const staff = document.getElementById('filterStaff').value;
  const region = document.getElementById('filterRegion').value;
  const groupBy = document.getElementById('groupBy').value;
  
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
      to: dateTo,
      ...(staff && { staff }),
      ...(region && { region }),
      ...(groupBy !== 'none' && { groupBy })
    });
    
    const endpoint = `/api/reports/${reportType}?${params}`;
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      throw new Error('Failed to generate report');
    }
    
    reportData = await response.json();
    
    // Render the report
    renderReport(reportType, reportData);
    
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
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Target Achievement</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatPercent(data.summary.targetAchievement || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Target: ${formatCurrency(data.summary.target || 0)}</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📊</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Average Sale</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.averageSale || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Per transaction</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📈</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Growth Rate</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatPercent(data.summary.growthRate || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">vs previous period</div>
    </div>
  `;
  
  // Charts
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📈</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Sales Trend</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="salesTrendChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">🗺️</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Sales by Region</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="salesRegionChart"></canvas>
      </div>
    </div>
  `;
  
  // Render charts
  if (data.chartData?.trend) {
    renderLineChart('salesTrendChart', 'Sales Trend', data.chartData.trend);
  }
  if (data.chartData?.byRegion) {
    renderPieChart('salesRegionChart', 'Sales by Region', data.chartData.byRegion);
  }
  
  // Data Table
  renderDataTable(data.tableData || [], [
    { key: 'date', label: 'Date' },
    { key: 'invoice_no', label: 'Invoice' },
    { key: 'staff_name', label: 'Staff' },
    { key: 'region_name', label: 'Region' },
    { key: 'sales_amount', label: 'Amount', format: 'currency' }
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
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">💵</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Revenue</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalRevenue || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Gross tour income</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📈</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Profit</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalProfit || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Net earnings</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📊</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Profit Margin</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatPercent(data.summary.profitMargin || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Average margin</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🗺️</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Tours</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.totalTours || 0}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Active tours</div>
    </div>
  `;
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📊</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Revenue vs Profit</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="revenueProfitChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">🏆</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Top Profitable Tours</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="topToursChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.revenueProfit) {
    renderBarChart('revenueProfitChart', 'Revenue vs Profit', data.chartData.revenueProfit);
  }
  if (data.chartData?.topTours) {
    renderBarChart('topToursChart', 'Top Tours', data.chartData.topTours);
  }
  
  renderDataTable(data.tableData || [], [
    { key: 'tour_code', label: 'Tour Code' },
    { key: 'departure_date', label: 'Departure', format: 'date' },
    { key: 'sales_amount', label: 'Revenue', format: 'currency' },
    { key: 'profit_amount', label: 'Profit', format: 'currency' },
    { key: 'profit_margin', label: 'Margin %', format: 'percent' },
    { key: 'jumlah_peserta', label: 'Participants' }
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
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">👤</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Sales by Staff</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="staffSalesChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📈</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Performance Comparison</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="staffComparisonChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.staffSales) {
    renderBarChart('staffSalesChart', 'Sales by Staff', data.chartData.staffSales);
  }
  
  renderDataTable(data.tableData || [], [
    { key: 'staff_name', label: 'Staff Name' },
    { key: 'total_sales', label: 'Total Sales', format: 'currency' },
    { key: 'transaction_count', label: 'Transactions' },
    { key: 'average_sale', label: 'Avg Sale', format: 'currency' },
    { key: 'tours_handled', label: 'Tours' },
    { key: 'documents_processed', label: 'Documents' }
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
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Revenue</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalRevenue || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">All sources</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📈</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Profit</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${formatCurrency(data.summary.totalProfit || 0)}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary);">Net profit</div>
    </div>
    <div class="metric-card" style="padding: 24px; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🗺️</div>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Active Tours</div>
        </div>
      </div>
      <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">${data.summary.activeTours || 0}</div>
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
      <div style="font-size: 0.9rem; color: var(--text-secondary);">${data.summary.pendingDocuments || 0} pending</div>
    </div>
  `;
  
  const chartsSection = document.getElementById('chartsSection');
  chartsSection.innerHTML = `
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">📈</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Revenue Overview</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="revenueOverviewChart"></canvas>
      </div>
    </div>
    <div class="chart-container" style="border-radius: 16px; overflow: hidden;">
      <div style="padding: 20px 24px; background: var(--bg-alt); border-bottom: 2px solid var(--border-light); display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">🧩</div>
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Business Distribution</h3>
      </div>
      <div style="padding: 24px;">
        <canvas id="distributionChart"></canvas>
      </div>
    </div>
  `;
  
  if (data.chartData?.revenueOverview) {
    renderLineChart('revenueOverviewChart', 'Revenue', data.chartData.revenueOverview);
  }
  if (data.chartData?.distribution) {
    renderPieChart('distributionChart', 'Distribution', data.chartData.distribution);
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
