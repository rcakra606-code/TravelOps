/* =========================================================
   CORPORATE DASHBOARD SCRIPT
   Corporate account management and sales analysis
   ========================================================= */

// Wait for auth-common.js to load
await new Promise(resolve => {
  const checkReady = () => {
    if (window.getUser && window.fetchJson && window.toast) {
      resolve();
    } else {
      setTimeout(checkReady, 50);
    }
  };
  checkReady();
});

const getUser = window.getUser;
const fetchJson = window.fetchJson;
const toast = window.toast;

const el = id => document.getElementById(id);
const user = getUser();

// Data stores
let corporateAccounts = [];
let corporateSales = [];
let charts = {};
let editingCorporateId = null;

// Display user info
el('userName').textContent = user.name || user.username || '—';
el('userRole').textContent = { admin: 'Administrator', 'semi-admin': 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';

// Show admin settings link for admin users
if (user.type === 'admin' || user.type === 'semi-admin') {
  const adminLink = el('adminSettingsLink');
  if (adminLink) adminLink.style.display = 'block';
}

/* === UTILITY FUNCTIONS === */
function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

function formatCompactCurrency(value) {
  const num = parseFloat(value) || 0;
  if (num >= 1000000000) return 'Rp ' + (num / 1000000000).toFixed(1) + 'B';
  if (num >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return 'Rp ' + (num / 1000).toFixed(1) + 'K';
  return 'Rp ' + num.toLocaleString('id-ID');
}

function formatPercent(value) {
  const num = parseFloat(value) || 0;
  return (num >= 0 ? '+' : '') + num.toFixed(1) + '%';
}

/* === TAB MANAGEMENT === */
function initTabs() {
  // Main tabs
  document.querySelectorAll('.corporate-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      
      // Update tab buttons
      document.querySelectorAll('.corporate-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update tab content
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      el(`tab-${tabId}`).classList.add('active');
      
      // Load data for specific tabs
      if (tabId === 'sales') {
        loadSalesComparison();
        populateMonthCompareDropdown();
      }
    });
  });
  
  // Sub-tabs
  document.querySelectorAll('.sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const subtabId = tab.dataset.subtab;
      
      // Update sub-tab buttons
      document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update sub-tab content
      document.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
      el(`subtab-${subtabId}`).classList.add('active');
    });
  });
}

/* === LOCAL STORAGE DATA MANAGEMENT === */
function loadCorporateData() {
  try {
    corporateAccounts = JSON.parse(localStorage.getItem('corporateAccounts') || '[]');
  } catch {
    corporateAccounts = [];
  }
}

function saveCorporateData() {
  localStorage.setItem('corporateAccounts', JSON.stringify(corporateAccounts));
}

/* === DASHBOARD SUMMARY === */
async function loadDashboardSummary() {
  loadCorporateData();
  
  // Update cards
  el('totalAccounts').textContent = corporateAccounts.length;
  el('activeContracts').textContent = corporateAccounts.filter(c => c.status === 'active').length;
  
  // Calculate YTD revenue and profit
  const currentYear = new Date().getFullYear();
  let totalRevenue = 0;
  let totalProfit = 0;
  let lastYearRevenue = 0;
  let lastYearProfit = 0;
  
  corporateAccounts.forEach(corp => {
    if (corp.sales) {
      corp.sales.forEach(sale => {
        if (sale.year === currentYear) {
          totalRevenue += parseFloat(sale.amount) || 0;
          totalProfit += parseFloat(sale.profit) || 0;
        } else if (sale.year === currentYear - 1) {
          lastYearRevenue += parseFloat(sale.amount) || 0;
          lastYearProfit += parseFloat(sale.profit) || 0;
        }
      });
    }
  });
  
  el('totalRevenue').textContent = formatCompactCurrency(totalRevenue);
  el('totalProfit').textContent = formatCompactCurrency(totalProfit);
  
  // Calculate trends
  const revenueTrendValue = lastYearRevenue > 0 ? ((totalRevenue - lastYearRevenue) / lastYearRevenue * 100) : 0;
  const profitTrendValue = lastYearProfit > 0 ? ((totalProfit - lastYearProfit) / lastYearProfit * 100) : 0;
  
  const revenueTrendEl = el('revenueTrend');
  revenueTrendEl.textContent = `${revenueTrendValue >= 0 ? '↑' : '↓'} ${Math.abs(revenueTrendValue).toFixed(1)}% vs last year`;
  revenueTrendEl.className = `card-trend ${revenueTrendValue >= 0 ? 'positive' : 'negative'}`;
  
  const profitTrendEl = el('profitTrend');
  profitTrendEl.textContent = `${profitTrendValue >= 0 ? '↑' : '↓'} ${Math.abs(profitTrendValue).toFixed(1)}% vs last year`;
  profitTrendEl.className = `card-trend ${profitTrendValue >= 0 ? 'positive' : 'negative'}`;
  
  // Render charts
  renderRevenueChart();
  renderTopAccountsChart();
  renderRecentTransactions();
}

function renderRevenueChart() {
  const ctx = el('revenueChart')?.getContext('2d');
  if (!ctx) return;
  
  if (charts.revenue) charts.revenue.destroy();
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;
  
  // Calculate monthly data
  const currentYearData = new Array(12).fill(0);
  const lastYearData = new Array(12).fill(0);
  
  corporateAccounts.forEach(corp => {
    if (corp.sales) {
      corp.sales.forEach(sale => {
        const month = parseInt(sale.month) - 1;
        if (month >= 0 && month < 12) {
          if (sale.year === currentYear) {
            currentYearData[month] += parseFloat(sale.amount) || 0;
          } else if (sale.year === lastYear) {
            lastYearData[month] += parseFloat(sale.amount) || 0;
          }
        }
      });
    }
  });
  
  charts.revenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: `${currentYear}`,
          data: currentYearData,
          borderColor: '#4361ee',
          backgroundColor: 'rgba(67, 97, 238, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: `${lastYear}`,
          data: lastYearData,
          borderColor: '#adb5bd',
          backgroundColor: 'rgba(173, 181, 189, 0.1)',
          fill: true,
          tension: 0.4,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => formatCompactCurrency(value)
          }
        }
      }
    }
  });
}

function renderTopAccountsChart() {
  const ctx = el('topAccountsChart')?.getContext('2d');
  if (!ctx) return;
  
  if (charts.topAccounts) charts.topAccounts.destroy();
  
  const currentYear = new Date().getFullYear();
  
  // Calculate total sales per corporate for current year
  const corpTotals = corporateAccounts.map(corp => {
    let total = 0;
    if (corp.sales) {
      corp.sales.forEach(sale => {
        if (sale.year === currentYear) {
          total += parseFloat(sale.amount) || 0;
        }
      });
    }
    return { name: corp.corporate_name || corp.account_code, total };
  }).sort((a, b) => b.total - a.total).slice(0, 5);
  
  charts.topAccounts = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: corpTotals.map(c => c.name),
      datasets: [{
        label: 'Revenue',
        data: corpTotals.map(c => c.total),
        backgroundColor: ['#4361ee', '#7209b7', '#f72585', '#4cc9f0', '#06d6a0']
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: value => formatCompactCurrency(value)
          }
        }
      }
    }
  });
}

function renderRecentTransactions() {
  const tbody = el('recentTransactionsBody');
  if (!tbody) return;
  
  // Collect all transactions and sort by date
  const transactions = [];
  corporateAccounts.forEach(corp => {
    if (corp.sales) {
      corp.sales.forEach(sale => {
        transactions.push({
          date: `${sale.year}-${String(sale.month).padStart(2, '0')}-01`,
          corporate: corp.corporate_name || corp.account_code,
          type: sale.type || 'General',
          amount: parseFloat(sale.amount) || 0,
          profit: parseFloat(sale.profit) || 0
        });
      });
    }
  });
  
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  
  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No transactions yet</td></tr>';
    return;
  }
  
  tbody.innerHTML = transactions.slice(0, 10).map(t => `
    <tr>
      <td>${t.date}</td>
      <td>${t.corporate}</td>
      <td>${t.type}</td>
      <td>${formatCurrency(t.amount)}</td>
      <td>${formatCurrency(t.profit)}</td>
    </tr>
  `).join('');
}

/* === CORPORATE LIST === */
function renderCorporateList() {
  const tbody = el('corporateListBody');
  if (!tbody) return;
  
  if (corporateAccounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No corporate accounts yet</td></tr>';
    return;
  }
  
  tbody.innerHTML = corporateAccounts.map((corp, idx) => `
    <tr>
      <td>${corp.account_code || '—'}</td>
      <td>${corp.corporate_name || '—'}</td>
      <td>${corp.address || '—'}</td>
      <td>${formatCurrency(corp.credit_limit || 0)}</td>
      <td><span class="status-badge ${corp.status === 'active' ? 'status-active' : 'status-pending'}">${corp.status || 'active'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editCorporate(${idx})">✏️ Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCorporate(${idx})">🗑️ Delete</button>
      </td>
    </tr>
  `).join('');
}

let selectedCorporateIdx = null;

function updateCorporateSelects() {
  const selects = [el('serviceFeeCorpSelect'), el('airlinesCorpSelect'), el('salesFilterCorp'), el('globalCorporateSelect'), el('salesCorporateSelect')];
  
  selects.forEach(select => {
    if (!select) return;
    const currentValue = select.value;
    const firstOption = select.querySelector('option:first-child');
    select.innerHTML = '';
    if (firstOption) select.appendChild(firstOption.cloneNode(true));
    
    corporateAccounts.forEach((corp, idx) => {
      const option = document.createElement('option');
      option.value = idx;
      option.textContent = `${corp.account_code} - ${corp.corporate_name}`;
      select.appendChild(option);
    });
    
    select.value = currentValue;
  });
}

/* === GLOBAL CORPORATE SELECTOR === */
function selectCorporate(idx) {
  selectedCorporateIdx = idx;
  
  // Update all sub-tab selectors
  if (el('serviceFeeCorpSelect')) {
    el('serviceFeeCorpSelect').value = idx;
    loadServiceFees(idx);
  }
  if (el('airlinesCorpSelect')) {
    el('airlinesCorpSelect').value = idx;
    loadAirlines(idx);
  }
  
  // Update info display
  const infoEl = el('selectedCorporateInfo');
  if (infoEl && idx !== '' && corporateAccounts[idx]) {
    const corp = corporateAccounts[idx];
    infoEl.textContent = `Credit Limit: ${formatCurrency(corp.credit_limit || 0)} | Status: ${corp.status || 'active'}`;
  } else if (infoEl) {
    infoEl.textContent = '';
  }
  
  // Load corporate detail if on detail tab
  if (idx !== '' && corporateAccounts[idx]) {
    loadCorporateDetailForm(idx);
  }
}

function loadCorporateDetailForm(idx) {
  const corp = corporateAccounts[idx];
  if (!corp) return;
  
  const form = el('corporateDetailForm');
  if (!form) return;
  
  form.account_code.value = corp.account_code || '';
  form.corporate_name.value = corp.corporate_name || '';
  form.address.value = corp.address || '';
  form.office_email.value = corp.office_email || '';
  form.credit_limit.value = corp.credit_limit || 0;
  form.contract_link.value = corp.contract_link || '';
  form.remarks.value = corp.remarks || '';
  
  // Load PIC Bookers
  const picList = el('picBookersList');
  if (picList) {
    picList.innerHTML = '';
    if (corp.pic_bookers && corp.pic_bookers.length > 0) {
      corp.pic_bookers.forEach(pic => addPicBookerRow(pic));
    } else {
      addPicBookerRow();
    }
  }
}

/* === CORPORATE MODAL === */
function openCorporateModal(editIdx = null) {
  editingCorporateId = editIdx;
  const modal = el('corporateModal');
  const form = el('quickCorporateForm');
  const title = el('corporateModalTitle');
  
  if (editIdx !== null && corporateAccounts[editIdx]) {
    title.textContent = 'Edit Corporate Account';
    const corp = corporateAccounts[editIdx];
    form.account_code.value = corp.account_code || '';
    form.corporate_name.value = corp.corporate_name || '';
    form.address.value = corp.address || '';
    form.office_email.value = corp.office_email || '';
    form.credit_limit.value = corp.credit_limit || 0;
  } else {
    title.textContent = 'Add Corporate Account';
    form.reset();
  }
  
  modal.classList.add('active');
}

function closeCorporateModal() {
  el('corporateModal').classList.remove('active');
  editingCorporateId = null;
}

function saveCorporateFromModal() {
  const form = el('quickCorporateForm');
  
  const data = {
    account_code: form.account_code.value.trim(),
    corporate_name: form.corporate_name.value.trim(),
    address: form.address.value.trim(),
    office_email: form.office_email.value.trim(),
    credit_limit: parseFloat(form.credit_limit.value) || 0,
    status: 'active',
    pic_bookers: [],
    service_fees: {},
    airlines: [],
    sales: []
  };
  
  if (!data.account_code || !data.corporate_name) {
    toast.error('Account code and corporate name are required');
    return;
  }
  
  if (editingCorporateId !== null) {
    // Preserve existing nested data
    const existing = corporateAccounts[editingCorporateId];
    data.pic_bookers = existing.pic_bookers || [];
    data.service_fees = existing.service_fees || {};
    data.airlines = existing.airlines || [];
    data.sales = existing.sales || [];
    corporateAccounts[editingCorporateId] = data;
    toast.success('Corporate account updated');
  } else {
    corporateAccounts.push(data);
    toast.success('Corporate account added');
  }
  
  saveCorporateData();
  renderCorporateList();
  updateCorporateSelects();
  loadDashboardSummary();
  closeCorporateModal();
}

// Global functions for inline onclick handlers
window.editCorporate = function(idx) {
  // Set global selector
  if (el('globalCorporateSelect')) {
    el('globalCorporateSelect').value = idx;
  }
  selectCorporate(idx);
  
  // Switch to detail subtab
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.sub-tab[data-subtab="detail"]')?.classList.add('active');
  
  document.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
  el('subtab-detail')?.classList.add('active');
};

window.deleteCorporate = function(idx) {
  if (confirm('Are you sure you want to delete this corporate account?')) {
    corporateAccounts.splice(idx, 1);
    saveCorporateData();
    renderCorporateList();
    updateCorporateSelects();
    loadDashboardSummary();
    toast.success('Corporate account deleted');
  }
};

/* === PIC BOOKERS === */
function addPicBookerRow(data = {}) {
  const list = el('picBookersList');
  if (!list) return;
  
  const row = document.createElement('div');
  row.className = 'pic-booker-row';
  row.innerHTML = `
    <div>
      <label>Name</label>
      <input type="text" name="pic_name" value="${data.name || ''}" placeholder="PIC Name">
    </div>
    <div>
      <label>Phone</label>
      <input type="text" name="pic_phone" value="${data.phone || ''}" placeholder="Phone Number">
    </div>
    <div>
      <label>Office Email</label>
      <input type="email" name="pic_office_email" value="${data.office_email || ''}" placeholder="office@company.com">
    </div>
    <div>
      <label>Personal Email</label>
      <input type="email" name="pic_personal_email" value="${data.personal_email || ''}" placeholder="personal@email.com">
    </div>
    <button type="button" class="btn-remove-pic" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(row);
}

/* === AIRLINES === */
function addAirlineRow(data = {}) {
  const list = el('airlinesList');
  if (!list) return;
  
  const row = document.createElement('div');
  row.className = 'airline-row';
  row.innerHTML = `
    <div>
      <label>Airlines</label>
      <input type="text" name="airline_name" value="${data.airline || ''}" placeholder="e.g., Garuda Indonesia">
    </div>
    <div>
      <label>Pricing Type</label>
      <select name="airline_pricing">
        <option value="nett" ${data.pricing === 'nett' ? 'selected' : ''}>Nett</option>
        <option value="published" ${data.pricing === 'published' ? 'selected' : ''}>Published</option>
        <option value="corporate" ${data.pricing === 'corporate' ? 'selected' : ''}>Corporate</option>
      </select>
    </div>
    <div>
      <label>Contract Link</label>
      <input type="url" name="airline_contract" value="${data.contract_link || ''}" placeholder="https://drive.google.com/...">
    </div>
    <button type="button" class="btn-remove-pic" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(row);
}

/* === SERVICE FEES === */
function loadServiceFees(corpIdx) {
  if (corpIdx === '' || corporateAccounts[corpIdx] === undefined) return;
  
  const corp = corporateAccounts[corpIdx];
  const fees = corp.service_fees || {};
  
  // Populate form fields
  const feeFields = [
    'flight_intl', 'flight_dom', 'reissue_intl', 'reissue_dom',
    'refund_intl', 'refund_dom', 'void_fee', 'revalidate_fee',
    'hotel_intl', 'hotel_dom', 'hotel_reschedule_intl', 'hotel_reschedule_dom',
    'hotel_refund_intl', 'hotel_refund_dom', 'train_fee'
  ];
  
  feeFields.forEach(field => {
    const input = document.querySelector(`input[name="${field}"]`);
    const typeSelect = document.querySelector(`select[name="${field}_type"]`);
    if (input) input.value = fees[field] || '';
    if (typeSelect) typeSelect.value = fees[`${field}_type`] || 'amount';
  });
}

function saveServiceFees() {
  const corpIdx = el('serviceFeeCorpSelect').value;
  if (corpIdx === '' || corporateAccounts[corpIdx] === undefined) {
    toast.error('Please select a corporate first');
    return;
  }
  
  const feeFields = [
    'flight_intl', 'flight_dom', 'reissue_intl', 'reissue_dom',
    'refund_intl', 'refund_dom', 'void_fee', 'revalidate_fee',
    'hotel_intl', 'hotel_dom', 'hotel_reschedule_intl', 'hotel_reschedule_dom',
    'hotel_refund_intl', 'hotel_refund_dom', 'train_fee'
  ];
  
  const fees = {};
  feeFields.forEach(field => {
    const input = document.querySelector(`input[name="${field}"]`);
    const typeSelect = document.querySelector(`select[name="${field}_type"]`);
    if (input) fees[field] = parseFloat(input.value) || 0;
    if (typeSelect) fees[`${field}_type`] = typeSelect.value;
  });
  
  corporateAccounts[corpIdx].service_fees = fees;
  saveCorporateData();
  toast.success('Service fees saved');
}

/* === AIRLINES MANAGEMENT === */
function loadAirlines(corpIdx) {
  const list = el('airlinesList');
  if (!list) return;
  list.innerHTML = '';
  
  if (corpIdx === '' || corporateAccounts[corpIdx] === undefined) return;
  
  const corp = corporateAccounts[corpIdx];
  const airlines = corp.airlines || [];
  
  airlines.forEach(airline => addAirlineRow(airline));
  
  if (airlines.length === 0) {
    addAirlineRow();
  }
}

function saveAirlines() {
  const corpIdx = el('airlinesCorpSelect').value;
  if (corpIdx === '' || corporateAccounts[corpIdx] === undefined) {
    toast.error('Please select a corporate first');
    return;
  }
  
  const rows = document.querySelectorAll('#airlinesList .airline-row');
  const airlines = [];
  
  rows.forEach(row => {
    const airline = row.querySelector('input[name="airline_name"]').value.trim();
    const pricing = row.querySelector('select[name="airline_pricing"]').value;
    const contract_link = row.querySelector('input[name="airline_contract"]').value.trim();
    
    if (airline) {
      airlines.push({ airline, pricing, contract_link });
    }
  });
  
  corporateAccounts[corpIdx].airlines = airlines;
  saveCorporateData();
  toast.success('Airlines saved');
}

/* === SALES COMPARISON === */
function loadSalesComparison() {
  const tbody = el('salesComparisonBody');
  if (!tbody) return;
  
  const year = parseInt(el('salesCompareYear').value) || new Date().getFullYear();
  const filterCorp = el('salesFilterCorp').value;
  
  let accountsToShow = corporateAccounts;
  if (filterCorp !== '') {
    accountsToShow = [corporateAccounts[filterCorp]].filter(Boolean);
  }
  
  if (accountsToShow.length === 0) {
    tbody.innerHTML = '<tr><td colspan="28" class="text-center">No data available</td></tr>';
    return;
  }
  
  const rows = accountsToShow.map(corp => {
    const monthlyData = {};
    const lastYearData = {};
    
    // Initialize months
    for (let m = 1; m <= 12; m++) {
      monthlyData[m] = { sales: 0, profit: 0 };
      lastYearData[m] = { sales: 0, profit: 0 };
    }
    
    // Populate from sales data
    if (corp.sales) {
      corp.sales.forEach(sale => {
        const month = parseInt(sale.month);
        if (sale.year === year && monthlyData[month]) {
          monthlyData[month].sales += parseFloat(sale.amount) || 0;
          monthlyData[month].profit += parseFloat(sale.profit) || 0;
        } else if (sale.year === year - 1 && lastYearData[month]) {
          lastYearData[month].sales += parseFloat(sale.amount) || 0;
          lastYearData[month].profit += parseFloat(sale.profit) || 0;
        }
      });
    }
    
    // Calculate totals
    let totalSales = 0, totalProfit = 0;
    let lastTotalSales = 0, lastTotalProfit = 0;
    
    for (let m = 1; m <= 12; m++) {
      totalSales += monthlyData[m].sales;
      totalProfit += monthlyData[m].profit;
      lastTotalSales += lastYearData[m].sales;
      lastTotalProfit += lastYearData[m].profit;
    }
    
    const growth = lastTotalSales > 0 ? ((totalSales - lastTotalSales) / lastTotalSales * 100) : 0;
    
    let cells = `<td>${corp.corporate_name || corp.account_code}</td>`;
    for (let m = 1; m <= 12; m++) {
      cells += `<td>${formatCompactCurrency(monthlyData[m].sales)}</td>`;
      cells += `<td>${formatCompactCurrency(monthlyData[m].profit)}</td>`;
    }
    cells += `<td><strong>${formatCompactCurrency(totalSales)}</strong></td>`;
    cells += `<td><strong>${formatCompactCurrency(totalProfit)}</strong></td>`;
    cells += `<td class="${growth >= 0 ? 'growth-positive' : 'growth-negative'}">${formatPercent(growth)}</td>`;
    
    return `<tr>${cells}</tr>`;
  });
  
  tbody.innerHTML = rows.join('');
  
  renderGrowthChart(accountsToShow, year);
}

function renderGrowthChart(accounts, year) {
  const ctx = el('growthChart')?.getContext('2d');
  if (!ctx) return;
  
  if (charts.growth) charts.growth.destroy();
  
  const data = accounts.map(corp => {
    let currentTotal = 0, lastTotal = 0;
    
    if (corp.sales) {
      corp.sales.forEach(sale => {
        if (sale.year === year) {
          currentTotal += parseFloat(sale.amount) || 0;
        } else if (sale.year === year - 1) {
          lastTotal += parseFloat(sale.amount) || 0;
        }
      });
    }
    
    const growth = lastTotal > 0 ? ((currentTotal - lastTotal) / lastTotal * 100) : 0;
    return {
      name: corp.corporate_name || corp.account_code,
      growth,
      current: currentTotal,
      last: lastTotal
    };
  });
  
  charts.growth = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [
        {
          label: `${year}`,
          data: data.map(d => d.current),
          backgroundColor: '#4361ee'
        },
        {
          label: `${year - 1}`,
          data: data.map(d => d.last),
          backgroundColor: '#adb5bd'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => formatCompactCurrency(value)
          }
        }
      }
    }
  });
}

/* === SALES MANAGEMENT === */
function addSalesData(e) {
  e.preventDefault();
  
  const corpIdx = el('salesCorporateSelect').value;
  if (corpIdx === '' || !corporateAccounts[corpIdx]) {
    toast.error('Please select a corporate');
    return;
  }
  
  const year = parseInt(el('salesYear').value);
  const month = parseInt(el('salesMonth').value);
  const type = el('salesType').value;
  const amount = parseFloat(el('salesAmount').value) || 0;
  const profit = parseFloat(el('salesProfit').value) || 0;
  
  if (!amount) {
    toast.error('Please enter sales amount');
    return;
  }
  
  // Initialize sales array if not exists
  if (!corporateAccounts[corpIdx].sales) {
    corporateAccounts[corpIdx].sales = [];
  }
  
  // Add sales data
  corporateAccounts[corpIdx].sales.push({
    year,
    month,
    type,
    amount,
    profit,
    created_at: new Date().toISOString()
  });
  
  saveCorporateData();
  toast.success('Sales data added successfully');
  
  // Reset form
  el('salesAmount').value = '';
  el('salesProfit').value = '';
  
  // Refresh displays
  loadSalesComparison();
  loadDashboardSummary();
}

/* === MONTH VS MONTH COMPARISON === */
function compareMonths() {
  const month1 = parseInt(el('monthCompare1Month').value);
  const year1 = parseInt(el('monthCompare1Year').value);
  const month2 = parseInt(el('monthCompare2Month').value);
  const year2 = parseInt(el('monthCompare2Year').value);
  const filterCorp = el('monthCompareCorp').value;
  
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const period1Label = `${monthNames[month1]} ${year1}`;
  const period2Label = `${monthNames[month2]} ${year2}`;
  
  // Update headers
  el('period1Header').textContent = `${period1Label} Sales`;
  el('period1ProfitHeader').textContent = `${period1Label} Profit`;
  el('period2Header').textContent = `${period2Label} Sales`;
  el('period2ProfitHeader').textContent = `${period2Label} Profit`;
  
  let accountsToShow = corporateAccounts;
  if (filterCorp !== '') {
    accountsToShow = [corporateAccounts[filterCorp]].filter(Boolean);
  }
  
  if (accountsToShow.length === 0) {
    el('monthComparisonBody').innerHTML = '<tr><td colspan="8" class="text-center">No data available</td></tr>';
    el('monthComparisonFooter').innerHTML = '';
    el('monthComparisonResults').style.display = 'block';
    return;
  }
  
  let grandTotal1Sales = 0, grandTotal1Profit = 0;
  let grandTotal2Sales = 0, grandTotal2Profit = 0;
  
  const rows = accountsToShow.map(corp => {
    let period1Sales = 0, period1Profit = 0;
    let period2Sales = 0, period2Profit = 0;
    
    if (corp.sales) {
      corp.sales.forEach(sale => {
        const saleMonth = parseInt(sale.month);
        const saleYear = parseInt(sale.year);
        
        if (saleMonth === month1 && saleYear === year1) {
          period1Sales += parseFloat(sale.amount) || 0;
          period1Profit += parseFloat(sale.profit) || 0;
        }
        if (saleMonth === month2 && saleYear === year2) {
          period2Sales += parseFloat(sale.amount) || 0;
          period2Profit += parseFloat(sale.profit) || 0;
        }
      });
    }
    
    grandTotal1Sales += period1Sales;
    grandTotal1Profit += period1Profit;
    grandTotal2Sales += period2Sales;
    grandTotal2Profit += period2Profit;
    
    const salesDiff = period1Sales - period2Sales;
    const profitDiff = period1Profit - period2Profit;
    const growth = period2Sales > 0 ? ((period1Sales - period2Sales) / period2Sales * 100) : (period1Sales > 0 ? 100 : 0);
    
    return `
      <tr>
        <td>${corp.corporate_name || corp.account_code}</td>
        <td>${formatCompactCurrency(period1Sales)}</td>
        <td>${formatCompactCurrency(period1Profit)}</td>
        <td>${formatCompactCurrency(period2Sales)}</td>
        <td>${formatCompactCurrency(period2Profit)}</td>
        <td class="${salesDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${salesDiff >= 0 ? '+' : ''}${formatCompactCurrency(salesDiff)}</td>
        <td class="${profitDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${profitDiff >= 0 ? '+' : ''}${formatCompactCurrency(profitDiff)}</td>
        <td class="${growth >= 0 ? 'growth-positive' : 'growth-negative'}">${formatPercent(growth)}</td>
      </tr>
    `;
  });
  
  // Calculate totals
  const totalSalesDiff = grandTotal1Sales - grandTotal2Sales;
  const totalProfitDiff = grandTotal1Profit - grandTotal2Profit;
  const totalGrowth = grandTotal2Sales > 0 ? ((grandTotal1Sales - grandTotal2Sales) / grandTotal2Sales * 100) : (grandTotal1Sales > 0 ? 100 : 0);
  
  el('monthComparisonBody').innerHTML = rows.join('');
  el('monthComparisonFooter').innerHTML = `
    <tr>
      <td>TOTAL</td>
      <td>${formatCompactCurrency(grandTotal1Sales)}</td>
      <td>${formatCompactCurrency(grandTotal1Profit)}</td>
      <td>${formatCompactCurrency(grandTotal2Sales)}</td>
      <td>${formatCompactCurrency(grandTotal2Profit)}</td>
      <td class="${totalSalesDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${totalSalesDiff >= 0 ? '+' : ''}${formatCompactCurrency(totalSalesDiff)}</td>
      <td class="${totalProfitDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${totalProfitDiff >= 0 ? '+' : ''}${formatCompactCurrency(totalProfitDiff)}</td>
      <td class="${totalGrowth >= 0 ? 'growth-positive' : 'growth-negative'}">${formatPercent(totalGrowth)}</td>
    </tr>
  `;
  
  el('monthComparisonResults').style.display = 'block';
  toast.success(`Comparing ${period1Label} vs ${period2Label}`);
}

function populateMonthCompareDropdown() {
  const select = el('monthCompareCorp');
  if (!select) return;
  
  select.innerHTML = '<option value="">All Corporates</option>';
  corporateAccounts.forEach((corp, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = corp.corporate_name || corp.account_code;
    select.appendChild(option);
  });
  
  // Set default values based on current month
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  if (el('monthCompare1Month')) el('monthCompare1Month').value = currentMonth;
  if (el('monthCompare1Year')) el('monthCompare1Year').value = currentYear;
  if (el('monthCompare2Month')) el('monthCompare2Month').value = currentMonth;
  if (el('monthCompare2Year')) el('monthCompare2Year').value = currentYear - 1;
}

/* === EVENT LISTENERS === */
function initEventListeners() {
  // Add Corporate button
  el('addCorporateBtn')?.addEventListener('click', () => openCorporateModal());
  
  // Modal buttons
  el('closeCorporateModal')?.addEventListener('click', closeCorporateModal);
  el('cancelCorporateModal')?.addEventListener('click', closeCorporateModal);
  el('saveCorporateModal')?.addEventListener('click', saveCorporateFromModal);
  
  // Modal overlay click
  el('corporateModal')?.querySelector('.modal-overlay')?.addEventListener('click', closeCorporateModal);
  
  // Add PIC Booker
  el('addPicBtn')?.addEventListener('click', () => addPicBookerRow());
  
  // Add Airline
  el('addAirlineBtn')?.addEventListener('click', () => addAirlineRow());
  
  // Global corporate selector
  el('globalCorporateSelect')?.addEventListener('change', (e) => {
    selectCorporate(e.target.value);
  });
  
  // Service fee corporate select
  el('serviceFeeCorpSelect')?.addEventListener('change', (e) => {
    const idx = e.target.value;
    // Sync with global selector
    if (el('globalCorporateSelect')) {
      el('globalCorporateSelect').value = idx;
      selectCorporate(idx);
    }
    loadServiceFees(idx);
  });
  
  // Save service fees
  el('saveServiceFeeBtn')?.addEventListener('click', saveServiceFees);
  
  // Airlines corporate select
  el('airlinesCorpSelect')?.addEventListener('change', (e) => {
    const idx = e.target.value;
    // Sync with global selector
    if (el('globalCorporateSelect')) {
      el('globalCorporateSelect').value = idx;
      selectCorporate(idx);
    }
    loadAirlines(idx);
  });
  
  // Save airlines
  el('saveAirlinesBtn')?.addEventListener('click', saveAirlines);
  
  // Sales comparison refresh
  el('refreshSalesBtn')?.addEventListener('click', loadSalesComparison);
  el('salesCompareYear')?.addEventListener('change', loadSalesComparison);
  el('salesFilterCorp')?.addEventListener('change', loadSalesComparison);
  
  // Month vs month comparison
  el('compareMonthsBtn')?.addEventListener('click', compareMonths);
  
  // Add sales form
  el('addSalesForm')?.addEventListener('submit', addSalesData);
  
  // Corporate detail form
  el('corporateDetailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCorporateDetail();
  });
  
  el('cancelDetailBtn')?.addEventListener('click', () => {
    // Switch back to list subtab
    document.querySelector('.sub-tab[data-subtab="list"]')?.click();
  });
}

function saveCorporateDetail() {
  const form = el('corporateDetailForm');
  
  // Collect PIC bookers
  const picBookers = [];
  document.querySelectorAll('#picBookersList .pic-booker-row').forEach(row => {
    const name = row.querySelector('input[name="pic_name"]').value.trim();
    const phone = row.querySelector('input[name="pic_phone"]').value.trim();
    const office_email = row.querySelector('input[name="pic_office_email"]').value.trim();
    const personal_email = row.querySelector('input[name="pic_personal_email"]').value.trim();
    
    if (name) {
      picBookers.push({ name, phone, office_email, personal_email });
    }
  });
  
  const data = {
    account_code: form.account_code.value.trim(),
    corporate_name: form.corporate_name.value.trim(),
    address: form.address.value.trim(),
    office_email: form.office_email.value.trim(),
    credit_limit: parseFloat(form.credit_limit.value) || 0,
    contract_link: form.contract_link.value.trim(),
    remarks: form.remarks.value.trim(),
    pic_bookers: picBookers,
    status: 'active',
    service_fees: {},
    airlines: [],
    sales: []
  };
  
  if (!data.account_code || !data.corporate_name) {
    toast.error('Account code and corporate name are required');
    return;
  }
  
  // Check if editing existing or creating new
  const existingIdx = corporateAccounts.findIndex(c => c.account_code === data.account_code);
  
  if (existingIdx >= 0) {
    // Preserve existing nested data
    const existing = corporateAccounts[existingIdx];
    data.service_fees = existing.service_fees || {};
    data.airlines = existing.airlines || [];
    data.sales = existing.sales || [];
    corporateAccounts[existingIdx] = data;
    toast.success('Corporate account updated');
  } else {
    corporateAccounts.push(data);
    toast.success('Corporate account added');
  }
  
  saveCorporateData();
  renderCorporateList();
  updateCorporateSelects();
  loadDashboardSummary();
  
  // Switch to list view
  document.querySelector('.sub-tab[data-subtab="list"]')?.click();
}

/* === INITIALIZE === */
function init() {
  initTabs();
  initEventListeners();
  loadCorporateData();
  loadDashboardSummary();
  renderCorporateList();
  updateCorporateSelects();
  
  // Add initial PIC booker row
  addPicBookerRow();
  
  // Add initial airline row
  addAirlineRow();
}

init();
