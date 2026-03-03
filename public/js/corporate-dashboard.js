/* =========================================================
   CORPORATE DASHBOARD SCRIPT
   Corporate account management and separated sales tabs
   Tabs: Dashboard, Corporate Accounts, Flight/Hotel/Tour/Other Sales, Sales Summary
   Persists data to backend API (corporate_accounts + corporate_sales tables)
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
let charts = {};
let editingCorporateId = null; // stores DB id

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

function findCorpById(id) {
  return corporateAccounts.find(c => c.id == id);
}

function findCorpIndexById(id) {
  return corporateAccounts.findIndex(c => c.id == id);
}

const SALES_TYPES = ['Flight', 'Hotel', 'Tour', 'Other'];

/* === TAB MANAGEMENT === */
function initTabs() {
  // Main tabs
  document.querySelectorAll('.corporate-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;

      document.querySelectorAll('.corporate-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      el(`tab-${tabId}`).classList.add('active');

      // Load data for specific tabs on switch
      if (tabId === 'flight-sales') loadTypeSalesTab('Flight');
      else if (tabId === 'hotel-sales') loadTypeSalesTab('Hotel');
      else if (tabId === 'tour-sales') loadTypeSalesTab('Tour');
      else if (tabId === 'other-sales') loadTypeSalesTab('Other');
      else if (tabId === 'sales-summary') loadSalesSummary();
    });
  });

  // Sub-tabs (within Corporate Accounts)
  document.querySelectorAll('.sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const subtabId = tab.dataset.subtab;
      document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
      el(`subtab-${subtabId}`).classList.add('active');
    });
  });
}

/* === API DATA MANAGEMENT === */
async function loadCorporateData() {
  try {
    const data = await fetchJson('/api/corporate/full?_t=' + Date.now());
    if (Array.isArray(data)) {
      corporateAccounts = data;
    } else {
      corporateAccounts = [];
    }
  } catch (err) {
    console.error('Failed to load corporate data:', err);
    corporateAccounts = [];
    toast.error('Failed to load corporate data from server');
  }
}

/* === DASHBOARD SUMMARY (Tab 1) === */
async function loadDashboardSummary() {
  el('totalAccounts').textContent = corporateAccounts.length;
  el('activeContracts').textContent = corporateAccounts.filter(c => c.status === 'active').length;

  const currentYear = new Date().getFullYear();
  let totalRevenue = 0, totalProfit = 0;
  let lastYearRevenue = 0, lastYearProfit = 0;

  corporateAccounts.forEach(corp => {
    if (corp.sales) {
      corp.sales.forEach(sale => {
        if (parseInt(sale.year) === currentYear) {
          totalRevenue += parseFloat(sale.amount) || 0;
          totalProfit += parseFloat(sale.profit) || 0;
        } else if (parseInt(sale.year) === currentYear - 1) {
          lastYearRevenue += parseFloat(sale.amount) || 0;
          lastYearProfit += parseFloat(sale.profit) || 0;
        }
      });
    }
  });

  el('totalRevenue').textContent = formatCompactCurrency(totalRevenue);
  el('totalProfit').textContent = formatCompactCurrency(totalProfit);

  const revenueTrendValue = lastYearRevenue > 0 ? ((totalRevenue - lastYearRevenue) / lastYearRevenue * 100) : 0;
  const profitTrendValue = lastYearProfit > 0 ? ((totalProfit - lastYearProfit) / lastYearProfit * 100) : 0;

  const revenueTrendEl = el('revenueTrend');
  revenueTrendEl.textContent = `${revenueTrendValue >= 0 ? '↑' : '↓'} ${Math.abs(revenueTrendValue).toFixed(1)}% vs last year`;
  revenueTrendEl.className = `card-trend ${revenueTrendValue >= 0 ? 'positive' : 'negative'}`;

  const profitTrendEl = el('profitTrend');
  profitTrendEl.textContent = `${profitTrendValue >= 0 ? '↑' : '↓'} ${Math.abs(profitTrendValue).toFixed(1)}% vs last year`;
  profitTrendEl.className = `card-trend ${profitTrendValue >= 0 ? 'positive' : 'negative'}`;

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
  const currentYearData = new Array(12).fill(0);
  const lastYearData = new Array(12).fill(0);

  corporateAccounts.forEach(corp => {
    if (corp.sales) {
      corp.sales.forEach(sale => {
        const month = parseInt(sale.month) - 1;
        if (month >= 0 && month < 12) {
          if (parseInt(sale.year) === currentYear) currentYearData[month] += parseFloat(sale.amount) || 0;
          else if (parseInt(sale.year) === lastYear) lastYearData[month] += parseFloat(sale.amount) || 0;
        }
      });
    }
  });

  charts.revenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: `${currentYear}`, data: currentYearData, borderColor: '#d4a843', backgroundColor: 'rgba(212, 168, 67, 0.15)', fill: true, tension: 0.4 },
        { label: `${lastYear}`, data: lastYearData, borderColor: '#6b83a5', backgroundColor: 'rgba(107, 131, 165, 0.15)', fill: true, tension: 0.4, borderDash: [5, 5] }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatCompactCurrency(v) } } }
    }
  });
}

function renderTopAccountsChart() {
  const ctx = el('topAccountsChart')?.getContext('2d');
  if (!ctx) return;
  if (charts.topAccounts) charts.topAccounts.destroy();

  const currentYear = new Date().getFullYear();
  const corpTotals = corporateAccounts.map(corp => {
    let total = 0;
    if (corp.sales) corp.sales.forEach(sale => { if (parseInt(sale.year) === currentYear) total += parseFloat(sale.amount) || 0; });
    return { name: corp.corporate_name || corp.account_code, total };
  }).sort((a, b) => b.total - a.total).slice(0, 5);

  charts.topAccounts = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: corpTotals.map(c => c.name),
      datasets: [{ label: 'Revenue', data: corpTotals.map(c => c.total), backgroundColor: ['#d4a843', '#2d6a8a', '#d4944c', '#67b8db', '#4ade80'] }]
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => formatCompactCurrency(v) } } }
    }
  });
}

function renderRecentTransactions() {
  const tbody = el('recentTransactionsBody');
  if (!tbody) return;

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

/* === CORPORATE LIST (Tab 2) === */
function renderCorporateList() {
  const tbody = el('corporateListBody');
  if (!tbody) return;

  if (corporateAccounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No corporate accounts yet</td></tr>';
    return;
  }

  tbody.innerHTML = corporateAccounts.map(corp => `
    <tr>
      <td>${corp.account_code || '—'}</td>
      <td>${corp.corporate_name || '—'}</td>
      <td>${corp.address || '—'}</td>
      <td>${formatCurrency(corp.credit_limit || 0)}</td>
      <td><span class="status-badge ${corp.status === 'active' ? 'status-active' : 'status-pending'}">${corp.status || 'active'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editCorporate(${corp.id})">✏️ Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCorporate(${corp.id})">🗑️ Delete</button>
      </td>
    </tr>
  `).join('');
}

let selectedCorporateId = null;

function updateCorporateSelects() {
  // All corporate selects across the page
  const selectIds = [
    'serviceFeeCorpSelect', 'airlinesCorpSelect', 'salesFilterCorp', 'globalCorporateSelect',
    'flightSalesCorpSelect', 'hotelSalesCorpSelect', 'tourSalesCorpSelect', 'otherSalesCorpSelect',
    'flightFilterCorp', 'hotelFilterCorp', 'tourFilterCorp', 'otherFilterCorp', 'monthCompareCorp'
  ];

  selectIds.forEach(sid => {
    const select = el(sid);
    if (!select) return;
    const currentValue = select.value;
    const firstOption = select.querySelector('option:first-child');
    select.innerHTML = '';
    if (firstOption) select.appendChild(firstOption.cloneNode(true));

    corporateAccounts.forEach(corp => {
      const option = document.createElement('option');
      option.value = corp.id;
      option.textContent = `${corp.account_code} - ${corp.corporate_name}`;
      select.appendChild(option);
    });

    select.value = currentValue;
  });
}

/* === GLOBAL CORPORATE SELECTOR === */
function selectCorporate(corpId) {
  selectedCorporateId = corpId;

  if (el('serviceFeeCorpSelect')) { el('serviceFeeCorpSelect').value = corpId; loadServiceFees(corpId); }
  if (el('airlinesCorpSelect')) { el('airlinesCorpSelect').value = corpId; loadAirlines(corpId); }

  const corp = findCorpById(corpId);
  const infoEl = el('selectedCorporateInfo');
  if (infoEl && corp) {
    infoEl.textContent = `Credit Limit: ${formatCurrency(corp.credit_limit || 0)} | Status: ${corp.status || 'active'}`;
  } else if (infoEl) {
    infoEl.textContent = '';
  }

  if (corp) loadCorporateDetailForm(corpId);
}

function loadCorporateDetailForm(corpId) {
  const corp = findCorpById(corpId);
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
  form.dataset.corpId = corp.id;

  const picList = el('picBookersList');
  if (picList) {
    picList.innerHTML = '';
    const bookers = Array.isArray(corp.pic_bookers) ? corp.pic_bookers : [];
    if (bookers.length > 0) bookers.forEach(pic => addPicBookerRow(pic));
    else addPicBookerRow();
  }
}

/* === CORPORATE MODAL === */
function openCorporateModal(editId = null) {
  editingCorporateId = editId;
  const modal = el('corporateModal');
  const form = el('quickCorporateForm');
  const title = el('corporateModalTitle');

  if (editId !== null) {
    const corp = findCorpById(editId);
    if (corp) {
      title.textContent = 'Edit Corporate Account';
      form.account_code.value = corp.account_code || '';
      form.corporate_name.value = corp.corporate_name || '';
      form.address.value = corp.address || '';
      form.office_email.value = corp.office_email || '';
      form.credit_limit.value = corp.credit_limit || 0;
    } else {
      title.textContent = 'Add Corporate Account';
      form.reset();
    }
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

async function saveCorporateFromModal() {
  const form = el('quickCorporateForm');

  const data = {
    account_code: form.account_code.value.trim(),
    corporate_name: form.corporate_name.value.trim(),
    address: form.address.value.trim(),
    office_email: form.office_email.value.trim(),
    credit_limit: parseFloat(form.credit_limit.value) || 0,
    status: 'active'
  };

  if (!data.account_code || !data.corporate_name) {
    toast.error('Account code and corporate name are required');
    return;
  }

  try {
    if (editingCorporateId !== null) {
      const existing = findCorpById(editingCorporateId);
      if (existing) {
        data.pic_bookers = JSON.stringify(existing.pic_bookers || []);
        data.service_fees = JSON.stringify(existing.service_fees || {});
        data.airlines = JSON.stringify(existing.airlines || []);
      }
      closeCorporateModal();
      fetchJson(`/api/corporate_accounts/${editingCorporateId}`, { method: 'PUT', body: JSON.stringify(data) })
        .then(() => { toast.success('Corporate account updated'); refreshAll(); })
        .catch(err => { toast.error('Failed to save: ' + (err.message || 'Unknown error')); refreshAll(); });
    } else {
      data.pic_bookers = '[]';
      data.service_fees = '{}';
      data.airlines = '[]';
      closeCorporateModal();
      fetchJson('/api/corporate_accounts', { method: 'POST', body: JSON.stringify(data) })
        .then(() => { toast.success('Corporate account added'); refreshAll(); })
        .catch(err => { toast.error('Failed to save: ' + (err.message || 'Unknown error')); refreshAll(); });
    }
  } catch (err) {
    console.error('Save corporate error:', err);
    toast.error('Failed to save corporate account: ' + (err.message || 'Unknown error'));
  }
}

// Global functions for inline onclick
window.editCorporate = function(corpId) {
  if (el('globalCorporateSelect')) el('globalCorporateSelect').value = corpId;
  selectCorporate(corpId);
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.sub-tab[data-subtab="detail"]')?.classList.add('active');
  document.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
  el('subtab-detail')?.classList.add('active');
};

window.deleteCorporate = async function(corpId) {
  if (confirm('Are you sure you want to delete this corporate account? All related sales data will also be deleted.')) {
    try {
      corporateAccounts = corporateAccounts.filter(a => String(a.id) !== String(corpId));
      renderCorporateList();
      updateCorporateSelects();
      await fetchJson(`/api/corporate_accounts/${corpId}`, { method: 'DELETE' });
      toast.success('Corporate account deleted');
      refreshAll();
    } catch (err) {
      console.error('Delete corporate error:', err);
      toast.error('Failed to delete corporate account: ' + (err.message || 'Unknown error'));
    }
  }
};

/* === PIC BOOKERS === */
function addPicBookerRow(data = {}) {
  const list = el('picBookersList');
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'pic-booker-row';
  row.innerHTML = `
    <div><label>Name</label><input type="text" name="pic_name" value="${data.name || ''}" placeholder="PIC Name"></div>
    <div><label>Phone</label><input type="text" name="pic_phone" value="${data.phone || ''}" placeholder="Phone Number"></div>
    <div><label>Office Email</label><input type="email" name="pic_office_email" value="${data.office_email || ''}" placeholder="office@company.com"></div>
    <div><label>Personal Email</label><input type="email" name="pic_personal_email" value="${data.personal_email || ''}" placeholder="personal@email.com"></div>
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
    <div><label>Airlines</label><input type="text" name="airline_name" value="${data.airline || ''}" placeholder="e.g., Garuda Indonesia"></div>
    <div><label>Pricing Type</label><select name="airline_pricing">
      <option value="nett" ${data.pricing === 'nett' ? 'selected' : ''}>Nett</option>
      <option value="published" ${data.pricing === 'published' ? 'selected' : ''}>Published</option>
      <option value="corporate" ${data.pricing === 'corporate' ? 'selected' : ''}>Corporate</option>
    </select></div>
    <div><label>Contract Link</label><input type="url" name="airline_contract" value="${data.contract_link || ''}" placeholder="https://drive.google.com/..."></div>
    <button type="button" class="btn-remove-pic" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(row);
}

/* === SERVICE FEES === */
function loadServiceFees(corpId) {
  const corp = findCorpById(corpId);
  if (!corp) return;

  const fees = corp.service_fees || {};
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

async function saveServiceFees() {
  const corpId = el('serviceFeeCorpSelect').value;
  const corp = findCorpById(corpId);
  if (!corp) { toast.error('Please select a corporate first'); return; }

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

  try {
    await fetchJson(`/api/corporate_accounts/${corpId}`, { method: 'PUT', body: JSON.stringify({ service_fees: JSON.stringify(fees) }) });
    corp.service_fees = fees;
    toast.success('Service fees saved');
  } catch (err) {
    console.error('Save service fees error:', err);
    toast.error('Failed to save service fees: ' + (err.message || 'Unknown error'));
  }
}

/* === AIRLINES MANAGEMENT === */
function loadAirlines(corpId) {
  const list = el('airlinesList');
  if (!list) return;
  list.innerHTML = '';

  const corp = findCorpById(corpId);
  if (!corp) return;

  const airlines = Array.isArray(corp.airlines) ? corp.airlines : [];
  airlines.forEach(airline => addAirlineRow(airline));
  if (airlines.length === 0) addAirlineRow();
}

async function saveAirlines() {
  const corpId = el('airlinesCorpSelect').value;
  const corp = findCorpById(corpId);
  if (!corp) { toast.error('Please select a corporate first'); return; }

  const rows = document.querySelectorAll('#airlinesList .airline-row');
  const airlines = [];
  rows.forEach(row => {
    const airline = row.querySelector('input[name="airline_name"]').value.trim();
    const pricing = row.querySelector('select[name="airline_pricing"]').value;
    const contract_link = row.querySelector('input[name="airline_contract"]').value.trim();
    if (airline) airlines.push({ airline, pricing, contract_link });
  });

  try {
    await fetchJson(`/api/corporate_accounts/${corpId}`, { method: 'PUT', body: JSON.stringify({ airlines: JSON.stringify(airlines) }) });
    corp.airlines = airlines;
    toast.success('Airlines saved');
  } catch (err) {
    console.error('Save airlines error:', err);
    toast.error('Failed to save airlines: ' + (err.message || 'Unknown error'));
  }
}

/* =============================================================
   SEPARATED SALES TABS (Flight, Hotel, Tour, Other)
   Each tab: Add form + filtered table with delete capability
   ============================================================= */

// Config for each type tab
const TYPE_CONFIG = {
  Flight: { prefix: 'flight', emoji: '✈️', bodyId: 'flightSalesBody', filterCorpId: 'flightFilterCorp', filterYearId: 'flightFilterYear' },
  Hotel:  { prefix: 'hotel',  emoji: '🏨', bodyId: 'hotelSalesBody',  filterCorpId: 'hotelFilterCorp',  filterYearId: 'hotelFilterYear' },
  Tour:   { prefix: 'tour',   emoji: '🧳', bodyId: 'tourSalesBody',   filterCorpId: 'tourFilterCorp',   filterYearId: 'tourFilterYear' },
  Other:  { prefix: 'other',  emoji: '📦', bodyId: 'otherSalesBody',  filterCorpId: 'otherFilterCorp',  filterYearId: 'otherFilterYear' }
};

function loadTypeSalesTab(type) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return;

  const filterCorpId = el(cfg.filterCorpId)?.value || '';
  const filterYear = parseInt(el(cfg.filterYearId)?.value) || new Date().getFullYear();
  const tbody = el(cfg.bodyId);
  if (!tbody) return;

  // Collect sales of this type from all corporates
  const rows = [];
  corporateAccounts.forEach(corp => {
    if (filterCorpId && String(corp.id) !== String(filterCorpId)) return;
    if (corp.sales) {
      corp.sales.forEach(sale => {
        if (sale.type === type && parseInt(sale.year) === filterYear) {
          rows.push({
            id: sale.id,
            date: `${sale.year}-${String(sale.month).padStart(2, '0')}`,
            corporate: corp.corporate_name || corp.account_code,
            reference: sale.reference_number || '—',
            description: sale.description || '—',
            amount: parseFloat(sale.amount) || 0,
            profit: parseFloat(sale.profit) || 0
          });
        }
      });
    }
  });

  rows.sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">No ${type.toLowerCase()} sales data for ${filterYear}</td></tr>`;
    return;
  }

  // Calculate totals
  let totalAmount = 0, totalProfit = 0;
  rows.forEach(r => { totalAmount += r.amount; totalProfit += r.profit; });

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.corporate}</td>
      <td>${r.reference}</td>
      <td>${r.description}</td>
      <td>${formatCurrency(r.amount)}</td>
      <td>${formatCurrency(r.profit)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteSalesRecord(${r.id}, '${type}')">🗑️</button></td>
    </tr>
  `).join('') + `
    <tr style="font-weight: bold; background: var(--bg-alt, #f5f5f5);">
      <td colspan="4">Total (${rows.length} records)</td>
      <td>${formatCurrency(totalAmount)}</td>
      <td>${formatCurrency(totalProfit)}</td>
      <td></td>
    </tr>
  `;
}

// Add sales for a specific type tab
async function addTypeSalesData(type, e) {
  e.preventDefault();
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return;

  const corpSelect = el(`${cfg.prefix}SalesCorpSelect`);
  const corpId = corpSelect?.value;
  const corp = findCorpById(corpId);
  if (!corp) { toast.error('Please select a corporate'); return; }

  const year = parseInt(el(`${cfg.prefix}SalesYear`).value);
  const month = parseInt(el(`${cfg.prefix}SalesMonth`).value);
  const amount = parseFloat(el(`${cfg.prefix}SalesAmount`).value) || 0;
  const profit = parseFloat(el(`${cfg.prefix}SalesProfit`).value) || 0;
  const reference_number = el(`${cfg.prefix}SalesRef`)?.value.trim() || '';
  const description = el(`${cfg.prefix}SalesDesc`)?.value.trim() || '';

  if (!amount) { toast.error('Please enter sales amount'); return; }

  try {
    await fetchJson('/api/corporate_sales', {
      method: 'POST',
      body: JSON.stringify({
        corporate_id: parseInt(corpId),
        year, month,
        type,
        amount, profit,
        reference_number,
        description
      })
    });

    toast.success(`${type} sales data added`);

    // Reset amount/profit/ref/desc fields
    el(`${cfg.prefix}SalesAmount`).value = '';
    el(`${cfg.prefix}SalesProfit`).value = '';
    if (el(`${cfg.prefix}SalesRef`)) el(`${cfg.prefix}SalesRef`).value = '';
    if (el(`${cfg.prefix}SalesDesc`)) el(`${cfg.prefix}SalesDesc`).value = '';

    await loadCorporateData();
    loadTypeSalesTab(type);
    loadDashboardSummary();
  } catch (err) {
    console.error(`Add ${type} sales error:`, err);
    toast.error(`Failed to add ${type} sales: ` + (err.message || 'Unknown error'));
  }
}

// Delete an individual sales record
window.deleteSalesRecord = async function(saleId, type) {
  if (!confirm('Delete this sales record?')) return;

  try {
    await fetchJson(`/api/corporate_sales/${saleId}`, { method: 'DELETE' });
    toast.success('Sales record deleted');
    await loadCorporateData();
    if (type) loadTypeSalesTab(type);
    loadDashboardSummary();
  } catch (err) {
    console.error('Delete sale error:', err);
    toast.error('Failed to delete sales record: ' + (err.message || 'Unknown error'));
  }
};

/* =============================================================
   SALES SUMMARY TAB (Tab 7) - Aggregates all types
   ============================================================= */

function loadSalesSummary() {
  const currentYear = new Date().getFullYear();

  // Summary cards per type
  SALES_TYPES.forEach(type => {
    let totalSales = 0, totalProfit = 0;
    corporateAccounts.forEach(corp => {
      if (corp.sales) {
        corp.sales.forEach(sale => {
          if (sale.type === type && parseInt(sale.year) === currentYear) {
            totalSales += parseFloat(sale.amount) || 0;
            totalProfit += parseFloat(sale.profit) || 0;
          }
        });
      }
    });

    const salesEl = el(`summary${type}Sales`);
    const profitEl = el(`summary${type}Profit`);
    if (salesEl) salesEl.textContent = formatCompactCurrency(totalSales);
    if (profitEl) profitEl.textContent = `Profit: ${formatCompactCurrency(totalProfit)}`;
    if (profitEl) profitEl.className = 'card-trend ' + (totalProfit >= 0 ? 'positive' : 'negative');
  });

  // Charts
  renderSalesByTypeChart();
  renderSummaryTrendChart();

  // Full Year comparison & Month vs Month
  loadSalesComparison();
  populateMonthCompareDropdown();
}

function renderSalesByTypeChart() {
  const ctx = el('salesByTypeChart')?.getContext('2d');
  if (!ctx) return;
  if (charts.salesByType) charts.salesByType.destroy();

  const currentYear = new Date().getFullYear();
  const typeColors = { Flight: '#d4a843', Hotel: '#2d6a8a', Tour: '#4ade80', Other: '#d4944c' };

  const data = SALES_TYPES.map(type => {
    let total = 0;
    corporateAccounts.forEach(corp => {
      if (corp.sales) corp.sales.forEach(sale => {
        if (sale.type === type && parseInt(sale.year) === currentYear) total += parseFloat(sale.amount) || 0;
      });
    });
    return total;
  });

  charts.salesByType = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: SALES_TYPES.map(t => `${TYPE_CONFIG[t].emoji} ${t}`),
      datasets: [{ data, backgroundColor: SALES_TYPES.map(t => typeColors[t]) }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.raw)}` } }
      }
    }
  });
}

function renderSummaryTrendChart() {
  const ctx = el('summaryTrendChart')?.getContext('2d');
  if (!ctx) return;
  if (charts.summaryTrend) charts.summaryTrend.destroy();

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();
  const typeColors = { Flight: '#d4a843', Hotel: '#2d6a8a', Tour: '#4ade80', Other: '#d4944c' };

  const datasets = SALES_TYPES.map(type => {
    const monthlyData = new Array(12).fill(0);
    corporateAccounts.forEach(corp => {
      if (corp.sales) corp.sales.forEach(sale => {
        if (sale.type === type && parseInt(sale.year) === currentYear) {
          const m = parseInt(sale.month) - 1;
          if (m >= 0 && m < 12) monthlyData[m] += parseFloat(sale.amount) || 0;
        }
      });
    });
    return {
      label: `${TYPE_CONFIG[type].emoji} ${type}`,
      data: monthlyData,
      borderColor: typeColors[type],
      backgroundColor: typeColors[type] + '20',
      fill: false,
      tension: 0.4
    };
  });

  charts.summaryTrend = new Chart(ctx, {
    type: 'line',
    data: { labels: months, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatCompactCurrency(v) } } }
    }
  });
}

/* === FULL YEAR COMPARISON (in Sales Summary tab) === */
function loadSalesComparison() {
  const tbody = el('salesComparisonBody');
  if (!tbody) return;

  const year = parseInt(el('salesCompareYear')?.value) || new Date().getFullYear();
  const filterCorpId = el('salesFilterCorp')?.value;

  let accountsToShow = corporateAccounts;
  if (filterCorpId) {
    const found = findCorpById(filterCorpId);
    accountsToShow = found ? [found] : [];
  }

  if (accountsToShow.length === 0) {
    tbody.innerHTML = '<tr><td colspan="28" class="text-center">No data available</td></tr>';
    return;
  }

  const rows = accountsToShow.map(corp => {
    const monthlyData = {}, lastYearData = {};
    for (let m = 1; m <= 12; m++) { monthlyData[m] = { sales: 0, profit: 0 }; lastYearData[m] = { sales: 0, profit: 0 }; }

    if (corp.sales) {
      corp.sales.forEach(sale => {
        const month = parseInt(sale.month);
        if (parseInt(sale.year) === year && monthlyData[month]) {
          monthlyData[month].sales += parseFloat(sale.amount) || 0;
          monthlyData[month].profit += parseFloat(sale.profit) || 0;
        } else if (parseInt(sale.year) === year - 1 && lastYearData[month]) {
          lastYearData[month].sales += parseFloat(sale.amount) || 0;
          lastYearData[month].profit += parseFloat(sale.profit) || 0;
        }
      });
    }

    let totalSales = 0, totalProfit = 0, lastTotalSales = 0;
    for (let m = 1; m <= 12; m++) {
      totalSales += monthlyData[m].sales;
      totalProfit += monthlyData[m].profit;
      lastTotalSales += lastYearData[m].sales;
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
        if (parseInt(sale.year) === year) currentTotal += parseFloat(sale.amount) || 0;
        else if (parseInt(sale.year) === year - 1) lastTotal += parseFloat(sale.amount) || 0;
      });
    }
    const growth = lastTotal > 0 ? ((currentTotal - lastTotal) / lastTotal * 100) : 0;
    return { name: corp.corporate_name || corp.account_code, growth, current: currentTotal, last: lastTotal };
  });

  charts.growth = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [
        { label: `${year}`, data: data.map(d => d.current), backgroundColor: '#d4a843' },
        { label: `${year - 1}`, data: data.map(d => d.last), backgroundColor: '#6b83a5' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatCompactCurrency(v) } } }
    }
  });
}

/* === MONTH vs MONTH COMPARISON === */
function compareMonths() {
  const month1 = parseInt(el('monthCompare1Month').value);
  const year1 = parseInt(el('monthCompare1Year').value);
  const month2 = parseInt(el('monthCompare2Month').value);
  const year2 = parseInt(el('monthCompare2Year').value);
  const filterCorpId = el('monthCompareCorp').value;

  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const period1Label = `${monthNames[month1]} ${year1}`;
  const period2Label = `${monthNames[month2]} ${year2}`;

  el('period1Header').textContent = `${period1Label} Sales`;
  el('period1ProfitHeader').textContent = `${period1Label} Profit`;
  el('period2Header').textContent = `${period2Label} Sales`;
  el('period2ProfitHeader').textContent = `${period2Label} Profit`;

  let accountsToShow = corporateAccounts;
  if (filterCorpId) {
    const found = findCorpById(filterCorpId);
    accountsToShow = found ? [found] : [];
  }

  if (accountsToShow.length === 0) {
    el('monthComparisonBody').innerHTML = '<tr><td colspan="8" class="text-center">No data available</td></tr>';
    el('monthComparisonFooter').innerHTML = '';
    el('monthComparisonResults').style.display = 'block';
    return;
  }

  let g1S = 0, g1P = 0, g2S = 0, g2P = 0;

  const rows = accountsToShow.map(corp => {
    let p1S = 0, p1P = 0, p2S = 0, p2P = 0;
    if (corp.sales) {
      corp.sales.forEach(sale => {
        const sm = parseInt(sale.month), sy = parseInt(sale.year);
        if (sm === month1 && sy === year1) { p1S += parseFloat(sale.amount) || 0; p1P += parseFloat(sale.profit) || 0; }
        if (sm === month2 && sy === year2) { p2S += parseFloat(sale.amount) || 0; p2P += parseFloat(sale.profit) || 0; }
      });
    }
    g1S += p1S; g1P += p1P; g2S += p2S; g2P += p2P;

    const sDiff = p1S - p2S, pDiff = p1P - p2P;
    const growth = p2S > 0 ? ((p1S - p2S) / p2S * 100) : (p1S > 0 ? 100 : 0);

    return `<tr>
      <td>${corp.corporate_name || corp.account_code}</td>
      <td>${formatCompactCurrency(p1S)}</td><td>${formatCompactCurrency(p1P)}</td>
      <td>${formatCompactCurrency(p2S)}</td><td>${formatCompactCurrency(p2P)}</td>
      <td class="${sDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${sDiff >= 0 ? '+' : ''}${formatCompactCurrency(sDiff)}</td>
      <td class="${pDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${pDiff >= 0 ? '+' : ''}${formatCompactCurrency(pDiff)}</td>
      <td class="${growth >= 0 ? 'growth-positive' : 'growth-negative'}">${formatPercent(growth)}</td>
    </tr>`;
  });

  const tSD = g1S - g2S, tPD = g1P - g2P;
  const tG = g2S > 0 ? ((g1S - g2S) / g2S * 100) : (g1S > 0 ? 100 : 0);

  el('monthComparisonBody').innerHTML = rows.join('');
  el('monthComparisonFooter').innerHTML = `<tr>
    <td>TOTAL</td>
    <td>${formatCompactCurrency(g1S)}</td><td>${formatCompactCurrency(g1P)}</td>
    <td>${formatCompactCurrency(g2S)}</td><td>${formatCompactCurrency(g2P)}</td>
    <td class="${tSD >= 0 ? 'growth-positive' : 'growth-negative'}">${tSD >= 0 ? '+' : ''}${formatCompactCurrency(tSD)}</td>
    <td class="${tPD >= 0 ? 'growth-positive' : 'growth-negative'}">${tPD >= 0 ? '+' : ''}${formatCompactCurrency(tPD)}</td>
    <td class="${tG >= 0 ? 'growth-positive' : 'growth-negative'}">${formatPercent(tG)}</td>
  </tr>`;

  el('monthComparisonResults').style.display = 'block';
  toast.success(`Comparing ${period1Label} vs ${period2Label}`);
}

function populateMonthCompareDropdown() {
  const select = el('monthCompareCorp');
  if (!select) return;

  select.innerHTML = '<option value="">All Corporates</option>';
  corporateAccounts.forEach(corp => {
    const option = document.createElement('option');
    option.value = corp.id;
    option.textContent = corp.corporate_name || corp.account_code;
    select.appendChild(option);
  });

  const now = new Date();
  if (el('monthCompare1Month')) el('monthCompare1Month').value = now.getMonth() + 1;
  if (el('monthCompare1Year')) el('monthCompare1Year').value = now.getFullYear();
  if (el('monthCompare2Month')) el('monthCompare2Month').value = now.getMonth() + 1;
  if (el('monthCompare2Year')) el('monthCompare2Year').value = now.getFullYear() - 1;
}

/* === EVENT LISTENERS === */
function initEventListeners() {
  // Add Corporate
  el('addCorporateBtn')?.addEventListener('click', () => openCorporateModal());

  // Modal
  el('closeCorporateModal')?.addEventListener('click', closeCorporateModal);
  el('cancelCorporateModal')?.addEventListener('click', closeCorporateModal);
  el('saveCorporateModal')?.addEventListener('click', saveCorporateFromModal);
  el('corporateModal')?.querySelector('.modal-overlay')?.addEventListener('click', closeCorporateModal);

  // PIC / Airline
  el('addPicBtn')?.addEventListener('click', () => addPicBookerRow());
  el('addAirlineBtn')?.addEventListener('click', () => addAirlineRow());

  // Global corporate selector
  el('globalCorporateSelect')?.addEventListener('change', (e) => selectCorporate(e.target.value));

  // Service fee selector
  el('serviceFeeCorpSelect')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (el('globalCorporateSelect')) { el('globalCorporateSelect').value = id; selectCorporate(id); }
    loadServiceFees(id);
  });
  el('saveServiceFeeBtn')?.addEventListener('click', saveServiceFees);

  // Airlines selector
  el('airlinesCorpSelect')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (el('globalCorporateSelect')) { el('globalCorporateSelect').value = id; selectCorporate(id); }
    loadAirlines(id);
  });
  el('saveAirlinesBtn')?.addEventListener('click', saveAirlines);

  // Sales Summary tab controls
  el('refreshSalesBtn')?.addEventListener('click', loadSalesComparison);
  el('salesCompareYear')?.addEventListener('change', loadSalesComparison);
  el('salesFilterCorp')?.addEventListener('change', loadSalesComparison);
  el('compareMonthsBtn')?.addEventListener('click', compareMonths);

  // Type-specific sales tab forms & filters
  for (const type of SALES_TYPES) {
    const cfg = TYPE_CONFIG[type];

    // Add sales form
    el(`add${type}SalesForm`)?.addEventListener('submit', (e) => addTypeSalesData(type, e));

    // Filter refresh
    el(`refresh${type}SalesBtn`)?.addEventListener('click', () => loadTypeSalesTab(type));
    el(cfg.filterCorpId)?.addEventListener('change', () => loadTypeSalesTab(type));
    el(cfg.filterYearId)?.addEventListener('change', () => loadTypeSalesTab(type));
  }

  // Corporate detail form
  el('corporateDetailForm')?.addEventListener('submit', (e) => { e.preventDefault(); saveCorporateDetail(); });
  el('cancelDetailBtn')?.addEventListener('click', () => document.querySelector('.sub-tab[data-subtab="list"]')?.click());
}

async function saveCorporateDetail() {
  const form = el('corporateDetailForm');

  const picBookers = [];
  document.querySelectorAll('#picBookersList .pic-booker-row').forEach(row => {
    const name = row.querySelector('input[name="pic_name"]').value.trim();
    const phone = row.querySelector('input[name="pic_phone"]').value.trim();
    const office_email = row.querySelector('input[name="pic_office_email"]').value.trim();
    const personal_email = row.querySelector('input[name="pic_personal_email"]').value.trim();
    if (name) picBookers.push({ name, phone, office_email, personal_email });
  });

  const data = {
    account_code: form.account_code.value.trim(),
    corporate_name: form.corporate_name.value.trim(),
    address: form.address.value.trim(),
    office_email: form.office_email.value.trim(),
    credit_limit: parseFloat(form.credit_limit.value) || 0,
    contract_link: form.contract_link.value.trim(),
    remarks: form.remarks.value.trim(),
    pic_bookers: JSON.stringify(picBookers),
    status: 'active'
  };

  if (!data.account_code || !data.corporate_name) {
    toast.error('Account code and corporate name are required');
    return;
  }

  try {
    const corpIdFromForm = form.dataset.corpId;
    const existingById = corpIdFromForm ? findCorpById(corpIdFromForm) : null;
    const existingByCode = !existingById ? corporateAccounts.find(c => c.account_code === data.account_code) : null;
    const existing = existingById || existingByCode;

    if (existing) {
      data.service_fees = JSON.stringify(existing.service_fees || {});
      data.airlines = JSON.stringify(existing.airlines || []);
      await fetchJson(`/api/corporate_accounts/${existing.id}`, { method: 'PUT', body: JSON.stringify(data) });
      toast.success('Corporate account updated');
    } else {
      data.service_fees = '{}';
      data.airlines = '[]';
      await fetchJson('/api/corporate_accounts', { method: 'POST', body: JSON.stringify(data) });
      toast.success('Corporate account added');
    }

    await refreshAll();
    document.querySelector('.sub-tab[data-subtab="list"]')?.click();
  } catch (err) {
    console.error('Save corporate detail error:', err);
    toast.error('Failed to save corporate account: ' + (err.message || 'Unknown error'));
  }
}

/* === REFRESH HELPER === */
async function refreshAll() {
  await loadCorporateData();
  renderCorporateList();
  updateCorporateSelects();
  loadDashboardSummary();
}

/* === INITIALIZE === */
async function init() {
  initTabs();
  initEventListeners();
  await loadCorporateData();
  loadDashboardSummary();
  renderCorporateList();
  updateCorporateSelects();

  // Add initial rows
  addPicBookerRow();
  addAirlineRow();
}

init();

// Auto-refresh every 60s (skip if modal open)
let _corpRefresh = setInterval(() => {
  if (document.querySelector('.modal.show, .modal[style*="flex"]')) return;
  loadCorporateData().then(() => { renderCorporateList(); loadDashboardSummary(); });
}, 60000);
window.addEventListener('beforeunload', () => clearInterval(_corpRefresh));
