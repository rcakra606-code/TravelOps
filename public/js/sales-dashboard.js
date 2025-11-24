/* =========================================================
   SALES DASHBOARD SCRIPT
   Focused analytics for sales performance and targets
   ========================================================= */

/* === GLOBAL HELPERS (auth-common.js provides shared auth) === */
const el = id => document.getElementById(id);

/* === DISPLAY USER INFO === */
(() => {
  const user = window.getUser();
  el('userName').textContent = user.name || user.username || '—';
  el('userRole').textContent = { admin: 'Administrator', semiadmin: 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';
})();

/* === CHARTS STORAGE === */
let charts = {};

/* === FILTER STATE === */
let filterState = {
  staff: 'all',
  region: 'all',
  period: 'all',
  month: '',
  year: ''
};

let regionsData = [];
let usersData = [];

/* === FILTER MANAGEMENT === */
function openSalesFilterModal() {
  const user = window.getUser();
  const isBasicUser = user.type === 'basic';
  
  const staffDropdown = isBasicUser ? '' : `
    <div class="form-group">
      <label>Staff</label>
      <select name="staff">
        <option value="all">Semua</option>
        ${usersData.map(u => `<option value="${u.name}" ${filterState.staff === u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
      </select>
    </div>
  `;
  
  window.openModal({
    title: 'Filter Sales Analytics',
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        ${staffDropdown}
        <div class="form-group">
          <label>Region</label>
          <select name="region">
            <option value="all">Semua</option>
            ${regionsData.map(r => `<option value="${r.id}" ${filterState.region == r.id ? 'selected' : ''}>${r.region_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Periode</label>
          <select name="period" id="modalFilterPeriod">
            <option value="all" ${filterState.period === 'all' ? 'selected' : ''}>Semua</option>
            <option value="month" ${filterState.period === 'month' ? 'selected' : ''}>Bulan</option>
            <option value="year" ${filterState.period === 'year' ? 'selected' : ''}>Tahun</option>
          </select>
        </div>
        <div class="form-group" id="monthGroup" style="display:${filterState.period === 'month' ? 'block' : 'none'}">
          <label>Pilih Bulan</label>
          <input type="month" name="month" value="${filterState.month || ''}">
        </div>
        <div class="form-group" id="yearGroup" style="display:${filterState.period === 'year' ? 'block' : 'none'}">
          <label>Pilih Tahun</label>
          <input type="number" name="year" min="2020" max="2100" value="${filterState.year || ''}" placeholder="YYYY">
        </div>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
        <button type="button" class="btn" data-reset-sales-filters>Reset Filters</button>
      </div>
    `,
    context: { entity: 'sales', action: 'filter' }
  });
  
  // Handle period change to show/hide month/year inputs
  setTimeout(() => {
    const periodSelect = document.getElementById('modalFilterPeriod');
    const monthGroup = document.getElementById('monthGroup');
    const yearGroup = document.getElementById('yearGroup');
    
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        monthGroup.style.display = val === 'month' ? 'block' : 'none';
        yearGroup.style.display = val === 'year' ? 'block' : 'none';
        monthGroup.style.display = val === 'month' ? 'block' : 'none';
        yearGroup.style.display = val === 'year' ? 'block' : 'none';
      });
    }
  }, 100);
}

function resetSalesFilters() {
  filterState = {
    staff: 'all',
    region: 'all',
    period: 'all',
    month: '',
    year: ''
  };
  if (window.closeModal) window.closeModal();
  renderDashboard();
}

function applySalesFilters(formData) {
  filterState.staff = formData.staff || 'all';
  filterState.region = formData.region || 'all';
  filterState.period = formData.period || 'all';
  filterState.month = formData.month || '';
  filterState.year = formData.year || '';
  
  renderDashboard();
}

async function populateFilterDropdowns() {
  try {
    const [users, regions] = await Promise.all([
      window.fetchJson('/api/users'),
      window.fetchJson('/api/regions')
    ]);
    
    usersData = users || [];
    regionsData = regions || [];
    usersData = users || [];
    regionsData = regions || [];
  } catch (err) {
    console.error('Error loading filter data:', err);
  }
}

/* === RENDER DASHBOARD === */
async function renderDashboard() {
  try {
    const user = window.getUser();
    
    let month = '';
    let year = '';
    
    if (filterState.period === 'month' && filterState.month) {
      const [y, m] = filterState.month.split('-');
      month = m;
      year = y;
    } else if (filterState.period === 'year' && filterState.year) {
      year = filterState.year;
    }
    
    let staff = filterState.staff !== 'all' ? filterState.staff : '';
    const region = filterState.region !== 'all' ? filterState.region : '';
    
    // For basic users, always filter to their own data
    if (user.type === 'basic') {
      staff = user.name || user.username;
    }
    
    const params = {};
    if (month) params.month = month;
    if (year) params.year = year;
    if (staff) params.staff = staff;
    if (region) params.region = region;
    
    const q = new URLSearchParams(params).toString();
    
    // Fetch sales data and metrics
    const [salesData, metrics] = await Promise.all([
      window.fetchJson('/api/sales' + (q ? '?' + q : '')),
      window.fetchJson('/api/metrics' + (q ? '?' + q : ''))
    ]);
    
    if (!metrics) return;
    
    // Destroy existing charts
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    
    // Update metrics
    const totalSales = metrics.sales?.total_sales || 0;
    const totalProfit = metrics.sales?.total_profit || 0;
    const targetSales = metrics.targets?.target_sales || 0;
    const targetProfit = metrics.targets?.target_profit || 0;
    const profitMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : 0;
    
    el('totalSales').textContent = window.formatCurrency(totalSales);
    el('totalProfit').textContent = window.formatCurrency(totalProfit);
    el('profitMargin').textContent = profitMargin + '%';
    el('totalTransactions').textContent = salesData?.length || 0;
    el('salesAchievement').textContent = `Target: ${(totalSales / (targetSales || 1) * 100).toFixed(1)}%`;
    el('profitAchievement').textContent = `Target: ${(totalProfit / (targetProfit || 1) * 100).toFixed(1)}%`;
    
    // Chart options
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          padding: 12
        }
      }
    };
    
    // Sales vs Target Chart
    const ctxSalesTarget = document.getElementById('chartSalesTarget')?.getContext('2d');
    if (ctxSalesTarget) {
      charts.salesTarget = new Chart(ctxSalesTarget, {
        type: 'bar',
        data: {
          labels: ['Sales', 'Target'],
          datasets: [{
            label: 'Amount (Rp)',
            data: [totalSales, targetSales],
            backgroundColor: ['#10b981', '#6b7280'],
            borderRadius: 8
          }]
        },
        options: {
          ...commonOptions,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
    
    // Profit vs Target Chart
    const ctxProfitTarget = document.getElementById('chartProfitTarget')?.getContext('2d');
    if (ctxProfitTarget) {
      charts.profitTarget = new Chart(ctxProfitTarget, {
        type: 'bar',
        data: {
          labels: ['Profit', 'Target'],
          datasets: [{
            label: 'Amount (Rp)',
            data: [totalProfit, targetProfit],
            backgroundColor: ['#3b82f6', '#6b7280'],
            borderRadius: 8
          }]
        },
        options: {
          ...commonOptions,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
    
    // Sales per Month Chart
    if (salesData) {
      const monthlyData = {};
      salesData.forEach(sale => {
        if (sale.transaction_date) {
          const month = sale.transaction_date.substring(0, 7); // YYYY-MM
          monthlyData[month] = (monthlyData[month] || 0) + (parseFloat(sale.sales_amount) || 0);
        }
      });
      
      const sortedMonths = Object.keys(monthlyData).sort();
      const ctxMonthly = document.getElementById('chartSalesMonthly')?.getContext('2d');
      if (ctxMonthly) {
        charts.monthly = new Chart(ctxMonthly, {
          type: 'line',
          data: {
            labels: sortedMonths,
            datasets: [{
              label: 'Sales (Rp)',
              data: sortedMonths.map(m => monthlyData[m]),
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.4
            }]
          },
          options: commonOptions
        });
      }
    }
    
    // Sales per Region Chart
    if (salesData) {
      const regionData = {};
      salesData.forEach(sale => {
        if (sale.region_name) {
          regionData[sale.region_name] = (regionData[sale.region_name] || 0) + (parseFloat(sale.sales_amount) || 0);
        }
      });
      
      const ctxRegion = document.getElementById('chartSalesRegion')?.getContext('2d');
      if (ctxRegion) {
        charts.region = new Chart(ctxRegion, {
          type: 'pie',
          data: {
            labels: Object.keys(regionData),
            datasets: [{
              data: Object.values(regionData),
              backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
            }]
          },
          options: commonOptions
        });
      }
    }
    
    // Top 5 Staff Chart
    if (salesData) {
      const staffData = {};
      salesData.forEach(sale => {
        if (sale.staff_name) {
          staffData[sale.staff_name] = (staffData[sale.staff_name] || 0) + (parseFloat(sale.sales_amount) || 0);
        }
      });
      
      const sortedStaff = Object.entries(staffData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      const ctxStaff = document.getElementById('chartTopStaff')?.getContext('2d');
      if (ctxStaff) {
        charts.topStaff = new Chart(ctxStaff, {
          type: 'bar',
          data: {
            labels: sortedStaff.map(s => s[0]),
            datasets: [{
              label: 'Sales (Rp)',
              data: sortedStaff.map(s => s[1]),
              backgroundColor: '#3b82f6',
              borderRadius: 8
            }]
          },
          options: {
            ...commonOptions,
            indexAxis: 'y',
            scales: {
              x: { beginAtZero: true }
            }
          }
        });
      }
    }
    
    // Profit Margin Trend
    if (salesData) {
      const monthlyMargin = {};
      salesData.forEach(sale => {
        if (sale.transaction_date) {
          const month = sale.transaction_date.substring(0, 7);
          if (!monthlyMargin[month]) {
            monthlyMargin[month] = { sales: 0, profit: 0 };
          }
          monthlyMargin[month].sales += parseFloat(sale.sales_amount) || 0;
          monthlyMargin[month].profit += parseFloat(sale.profit_amount) || 0;
        }
      });
      
      const sortedMonths = Object.keys(monthlyMargin).sort();
      const margins = sortedMonths.map(m => {
        const data = monthlyMargin[m];
        return data.sales > 0 ? ((data.profit / data.sales) * 100).toFixed(1) : 0;
      });
      
      const ctxMargin = document.getElementById('chartMarginTrend')?.getContext('2d');
      if (ctxMargin) {
        charts.margin = new Chart(ctxMargin, {
          type: 'line',
          data: {
            labels: sortedMonths,
            datasets: [{
              label: 'Profit Margin (%)',
              data: margins,
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              fill: true,
              tension: 0.4
            }]
          },
          options: commonOptions
        });
      }
    }
    
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    alert('Error loading dashboard: ' + err.message);
  }
}

/* === EXPORT CSV === */
el('exportSalesCSV')?.addEventListener('click', async () => {
  try {
    const data = await fetchJson('/api/sales');
    if (!data || !data.length) {
      alert('Tidak ada data untuk di-export');
      return;
    }
    
    const headers = ['ID', 'Transaction Date', 'Invoice No', 'Client Name', 'Sales Amount', 'Profit Amount', 'Region', 'Staff', 'Created At'];
    const rows = data.map(d => [
      d.id,
      d.transaction_date || '',
      d.invoice_no || '',
      d.client_name || '',
      d.sales_amount || 0,
      d.profit_amount || 0,
      d.region_name || '',
      d.staff_name || '',
      d.created_at || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export error:', err);
    alert('Error exporting data: ' + err.message);
  }
});

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', async () => {
  const user = window.getUser();
  
  // Set up filter button
  const filterBtn = el('salesFilterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', openSalesFilterModal);
  }
  
  // Handle modal submissions for filters
  document.addEventListener('modalSubmit', (e) => {
    const { data, context } = e.detail;
    if (context.entity === 'sales' && context.action === 'filter') {
      e.preventDefault();
      applySalesFilters(data);
      if (window.closeModal) window.closeModal();
    }
  });
  
  // Handle filter reset
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-reset-sales-filters]')) {
      resetSalesFilters();
    }
  });
  
  await populateFilterDropdowns();
  renderDashboard();
  setInterval(renderDashboard, 60000); // Refresh every minute
  
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
});
