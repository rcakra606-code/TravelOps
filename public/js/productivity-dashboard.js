/* =========================================================
   PRODUCTIVITY DASHBOARD SCRIPT
   Sales tracking by product category with profit margin calculations
   ========================================================= */

const el = id => document.getElementById(id);

// Product types configuration
const PRODUCT_TYPES = [
  { id: 'flight', name: 'Flight', icon: '✈️' },
  { id: 'hotel', name: 'Hotel', icon: '🏨' },
  { id: 'tour', name: 'Tour', icon: '🧳' },
  { id: 'package', name: 'Package', icon: '📦' },
  { id: 'cruise', name: 'Cruise', icon: '🚢' },
  { id: 'admission', name: 'Admission', icon: '🎫' },
  { id: 'passport', name: 'Passport', icon: '🛂' },
  { id: 'visa', name: 'Visa', icon: '📋' },
  { id: 'insurance', name: 'Insurance', icon: '🛡️' },
  { id: 'train', name: 'Train', icon: '🚆' },
  { id: 'other', name: 'Other', icon: '📝' }
];

// Global data stores
let productivityData = [];
let usersData = [];
let charts = {};
let currentFilters = {
  year: new Date().getFullYear(),
  month: '',
  staff: 'all',
  product: 'all'
};

/* === DISPLAY USER INFO === */
(() => {
  const user = window.getUser();
  el('userName').textContent = user.name || user.username || '—';
  el('userRole').textContent = { admin: 'Administrator', semiadmin: 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';
  
  // Show admin settings link for admin users
  if (user.type === 'admin') {
    const adminLink = el('adminSettingsLink');
    if (adminLink) adminLink.style.display = 'block';
  }
})();

/* === UTILITY FUNCTIONS === */
function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

function formatPercent(value) {
  const num = parseFloat(value) || 0;
  return num.toFixed(1) + '%';
}

function calculateMargin(sales, profit) {
  const s = parseFloat(sales) || 0;
  const p = parseFloat(profit) || 0;
  if (s === 0) return 0;
  return (p / s) * 100;
}

function getMarginClass(margin) {
  if (margin >= 20) return 'high';
  if (margin >= 10) return 'medium';
  return 'low';
}

function getMonthName(month) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(month) - 1] || '';
}

/* === TAB MANAGEMENT === */
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Hide all content
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Show selected content
      const tabId = tab.dataset.tab;
      const content = el(`tab-${tabId}`);
      if (content) content.classList.add('active');
      
      // Initialize tab content if needed
      if (tabId !== 'overview') {
        initProductTab(tabId);
      }
    });
  });
}

/* === INITIALIZE PRODUCT TAB === */
function initProductTab(productType) {
  const product = PRODUCT_TYPES.find(p => p.id === productType);
  if (!product) return;
  
  const tabContent = el(`tab-${productType}`);
  if (!tabContent) return;
  
  // Check if already initialized
  if (tabContent.dataset.initialized === 'true') {
    renderProductTable(productType);
    return;
  }
  
  tabContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3>${product.icon} ${product.name} Sales</h3>
      <button class="btn btn-primary" onclick="openAddProductivityModal('${productType}')">
        ➕ Add ${product.name} Record
      </button>
    </div>
    
    <!-- Product Metrics -->
    <div class="metrics-grid" id="metrics-${productType}">
      <div class="metric-box">
        <div class="label">Total Retail Sales</div>
        <div class="value" id="${productType}-retail-sales">Rp 0</div>
      </div>
      <div class="metric-box">
        <div class="label">Retail Profit Margin</div>
        <div class="value" id="${productType}-retail-margin">0%</div>
      </div>
      <div class="metric-box">
        <div class="label">Total Corporate Sales</div>
        <div class="value" id="${productType}-corporate-sales">Rp 0</div>
      </div>
      <div class="metric-box">
        <div class="label">Corporate Profit Margin</div>
        <div class="value" id="${productType}-corporate-margin">0%</div>
      </div>
    </div>
    
    <!-- Product Table -->
    <div style="overflow-x: auto;">
      <table class="data-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Period</th>
            <th>Staff</th>
            <th class="text-right">Retail Sales</th>
            <th class="text-right">Retail Profit</th>
            <th class="text-right">Retail Margin</th>
            <th class="text-right">Corporate Sales</th>
            <th class="text-right">Corporate Profit</th>
            <th class="text-right">Corporate Margin</th>
            <th class="text-right">Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="table-${productType}">
          <tr><td colspan="10" class="text-center">Loading...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="pagination-${productType}" class="pagination-container"></div>
  `;
  
  tabContent.dataset.initialized = 'true';
  renderProductTable(productType);
}

/* === RENDER PRODUCT TABLE === */
function renderProductTable(productType) {
  const tbody = el(`table-${productType}`);
  if (!tbody) return;
  
  const filtered = productivityData.filter(d => d.product_type === productType);
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center">No ${productType} records found. Click "Add ${productType} Record" to create one.</td></tr>`;
    updateProductMetrics(productType, []);
    return;
  }
  
  // Sort by year desc, month desc
  filtered.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  });
  
  tbody.innerHTML = filtered.map(item => {
    const retailMargin = calculateMargin(item.retail_sales, item.retail_profit);
    const corpMargin = calculateMargin(item.corporate_sales, item.corporate_profit);
    const totalSales = (parseFloat(item.retail_sales) || 0) + (parseFloat(item.corporate_sales) || 0);
    const totalProfit = (parseFloat(item.retail_profit) || 0) + (parseFloat(item.corporate_profit) || 0);
    
    return `
      <tr>
        <td><strong>${getMonthName(item.month)} ${item.year}</strong></td>
        <td>${item.staff_name || '—'}</td>
        <td class="text-right">${formatCurrency(item.retail_sales)}</td>
        <td class="text-right">${formatCurrency(item.retail_profit)}</td>
        <td class="text-right"><span class="profit-margin ${getMarginClass(retailMargin)}">${formatPercent(retailMargin)}</span></td>
        <td class="text-right">${formatCurrency(item.corporate_sales)}</td>
        <td class="text-right">${formatCurrency(item.corporate_profit)}</td>
        <td class="text-right"><span class="profit-margin ${getMarginClass(corpMargin)}">${formatPercent(corpMargin)}</span></td>
        <td class="text-right"><strong>${formatCurrency(totalSales)}</strong></td>
        <td class="actions">
          <button class="btn btn-sm" onclick="editProductivity(${item.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProductivity(${item.id})">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
  
  updateProductMetrics(productType, filtered);
}

/* === UPDATE PRODUCT METRICS === */
function updateProductMetrics(productType, data) {
  const retailSales = data.reduce((sum, d) => sum + (parseFloat(d.retail_sales) || 0), 0);
  const retailProfit = data.reduce((sum, d) => sum + (parseFloat(d.retail_profit) || 0), 0);
  const corpSales = data.reduce((sum, d) => sum + (parseFloat(d.corporate_sales) || 0), 0);
  const corpProfit = data.reduce((sum, d) => sum + (parseFloat(d.corporate_profit) || 0), 0);
  
  const retailMargin = calculateMargin(retailSales, retailProfit);
  const corpMargin = calculateMargin(corpSales, corpProfit);
  
  const rsEl = el(`${productType}-retail-sales`);
  const rmEl = el(`${productType}-retail-margin`);
  const csEl = el(`${productType}-corporate-sales`);
  const cmEl = el(`${productType}-corporate-margin`);
  
  if (rsEl) rsEl.textContent = formatCurrency(retailSales);
  if (rmEl) rmEl.innerHTML = `<span class="profit-margin ${getMarginClass(retailMargin)}">${formatPercent(retailMargin)}</span>`;
  if (csEl) csEl.textContent = formatCurrency(corpSales);
  if (cmEl) cmEl.innerHTML = `<span class="profit-margin ${getMarginClass(corpMargin)}">${formatPercent(corpMargin)}</span>`;
}

/* === LOAD DATA === */
async function loadData() {
  try {
    // Load productivity data
    productivityData = await window.fetchJson('/api/productivity') || [];
    
    // Load users for staff dropdown
    try {
      usersData = await window.fetchJson('/api/users') || [];
    } catch (err) {
      // For basic users who can't access /api/users
      const user = window.getUser();
      usersData = [{ name: user.name || user.username }];
    }
    
    renderOverview();
    
    // Re-render current tab if it's a product tab
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab !== 'overview') {
      renderProductTable(activeTab.dataset.tab);
    }
  } catch (err) {
    console.error('Error loading data:', err);
    window.toast?.error('Failed to load productivity data');
  }
}

/* === RENDER OVERVIEW === */
function renderOverview() {
  // Calculate totals
  const totalSales = productivityData.reduce((sum, d) => {
    return sum + (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0);
  }, 0);
  
  const totalProfit = productivityData.reduce((sum, d) => {
    return sum + (parseFloat(d.retail_profit) || 0) + (parseFloat(d.corporate_profit) || 0);
  }, 0);
  
  const avgMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
  
  // Update metrics
  el('overviewTotalSales').textContent = formatCurrency(totalSales);
  el('overviewTotalProfit').textContent = formatCurrency(totalProfit);
  el('overviewAvgMargin').innerHTML = `<span class="profit-margin ${getMarginClass(avgMargin)}">${formatPercent(avgMargin)}</span>`;
  el('overviewTotalRecords').textContent = productivityData.length;
  
  // Render product summary table
  renderProductSummaryTable();
  
  // Render charts
  renderOverviewCharts();
}

/* === RENDER PRODUCT SUMMARY TABLE === */
function renderProductSummaryTable() {
  const tbody = el('productSummaryTable');
  if (!tbody) return;
  
  // Aggregate by product type
  const summary = {};
  PRODUCT_TYPES.forEach(p => {
    summary[p.id] = {
      name: p.name,
      icon: p.icon,
      retailSales: 0,
      corpSales: 0,
      totalSales: 0,
      totalProfit: 0
    };
  });
  
  productivityData.forEach(d => {
    const type = d.product_type;
    if (summary[type]) {
      summary[type].retailSales += parseFloat(d.retail_sales) || 0;
      summary[type].corpSales += parseFloat(d.corporate_sales) || 0;
      summary[type].totalSales += (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0);
      summary[type].totalProfit += (parseFloat(d.retail_profit) || 0) + (parseFloat(d.corporate_profit) || 0);
    }
  });
  
  tbody.innerHTML = PRODUCT_TYPES.map(p => {
    const s = summary[p.id];
    const margin = calculateMargin(s.totalSales, s.totalProfit);
    return `
      <tr>
        <td>${p.icon} <strong>${p.name}</strong></td>
        <td class="text-right">${formatCurrency(s.retailSales)}</td>
        <td class="text-right">${formatCurrency(s.corpSales)}</td>
        <td class="text-right"><strong>${formatCurrency(s.totalSales)}</strong></td>
        <td class="text-right">${formatCurrency(s.totalProfit)}</td>
        <td class="text-right"><span class="profit-margin ${getMarginClass(margin)}">${formatPercent(margin)}</span></td>
      </tr>
    `;
  }).join('');
}

/* === RENDER OVERVIEW CHARTS === */
function renderOverviewCharts() {
  // Destroy existing charts
  Object.values(charts).forEach(c => c?.destroy?.());
  charts = {};
  
  const chartColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6'
  ];
  
  // Sales by Product Category (Bar Chart)
  const salesByProduct = {};
  PRODUCT_TYPES.forEach(p => { salesByProduct[p.id] = 0; });
  productivityData.forEach(d => {
    salesByProduct[d.product_type] = (salesByProduct[d.product_type] || 0) + 
      (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0);
  });
  
  const ctxSales = el('chartSalesByProduct')?.getContext('2d');
  if (ctxSales) {
    charts.salesByProduct = new Chart(ctxSales, {
      type: 'bar',
      data: {
        labels: PRODUCT_TYPES.map(p => p.name),
        datasets: [{
          label: 'Total Sales',
          data: PRODUCT_TYPES.map(p => salesByProduct[p.id]),
          backgroundColor: chartColors,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
  
  // Profit Margin by Category (Horizontal Bar)
  const marginByProduct = {};
  PRODUCT_TYPES.forEach(p => {
    const data = productivityData.filter(d => d.product_type === p.id);
    const sales = data.reduce((s, d) => s + (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0), 0);
    const profit = data.reduce((s, d) => s + (parseFloat(d.retail_profit) || 0) + (parseFloat(d.corporate_profit) || 0), 0);
    marginByProduct[p.id] = calculateMargin(sales, profit);
  });
  
  const ctxProfit = el('chartProfitByProduct')?.getContext('2d');
  if (ctxProfit) {
    charts.profitByProduct = new Chart(ctxProfit, {
      type: 'bar',
      data: {
        labels: PRODUCT_TYPES.map(p => p.name),
        datasets: [{
          label: 'Profit Margin %',
          data: PRODUCT_TYPES.map(p => marginByProduct[p.id]),
          backgroundColor: PRODUCT_TYPES.map(p => {
            const m = marginByProduct[p.id];
            return m >= 20 ? '#10b981' : m >= 10 ? '#f59e0b' : '#ef4444';
          }),
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100 } }
      }
    });
  }
  
  // Monthly Trend (Line Chart)
  const monthlyData = {};
  productivityData.forEach(d => {
    const key = `${d.year}-${String(d.month).padStart(2, '0')}`;
    monthlyData[key] = (monthlyData[key] || 0) + 
      (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0);
  });
  
  const sortedMonths = Object.keys(monthlyData).sort();
  const ctxTrend = el('chartMonthlyTrend')?.getContext('2d');
  if (ctxTrend) {
    charts.monthlyTrend = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: sortedMonths,
        datasets: [{
          label: 'Total Sales',
          data: sortedMonths.map(m => monthlyData[m]),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
  
  // Top Performers (Horizontal Bar)
  const staffSales = {};
  productivityData.forEach(d => {
    const name = d.staff_name || 'Unknown';
    staffSales[name] = (staffSales[name] || 0) + 
      (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0);
  });
  
  const topStaff = Object.entries(staffSales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const ctxPerformers = el('chartTopPerformers')?.getContext('2d');
  if (ctxPerformers) {
    charts.topPerformers = new Chart(ctxPerformers, {
      type: 'bar',
      data: {
        labels: topStaff.map(s => s[0]),
        datasets: [{
          label: 'Total Sales',
          data: topStaff.map(s => s[1]),
          backgroundColor: '#8b5cf6',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }
}

/* === OPEN ADD MODAL === */
window.openAddProductivityModal = function(productType) {
  const product = PRODUCT_TYPES.find(p => p.id === productType);
  if (!product) return;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  window.CRUDModal.create(`Add ${product.icon} ${product.name} Record`, [
    { type: 'select', name: 'month', label: 'Month', required: true, icon: '📅',
      options: [
        { value: 1, label: 'January' }, { value: 2, label: 'February' },
        { value: 3, label: 'March' }, { value: 4, label: 'April' },
        { value: 5, label: 'May' }, { value: 6, label: 'June' },
        { value: 7, label: 'July' }, { value: 8, label: 'August' },
        { value: 9, label: 'September' }, { value: 10, label: 'October' },
        { value: 11, label: 'November' }, { value: 12, label: 'December' }
      ],
      defaultValue: currentMonth
    },
    { type: 'number', name: 'year', label: 'Year', required: true, icon: '🗓️',
      min: 2020, max: 2100, defaultValue: currentYear },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, icon: '👤',
      options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'divider', label: '🏪 Retail Sales' },
    { type: 'currency', name: 'retail_sales', label: 'Retail Sales Amount', currency: 'Rp', min: 0 },
    { type: 'currency', name: 'retail_profit', label: 'Retail Profit Amount', currency: 'Rp', min: 0 },
    { type: 'calculated', name: 'retail_margin_display', label: 'Retail Profit Margin', 
      formula: '((retail_profit / retail_sales) * 100).toFixed(1) + "%"',
      dependencies: ['retail_sales', 'retail_profit'] },
    { type: 'divider', label: '🏢 Corporate Sales' },
    { type: 'currency', name: 'corporate_sales', label: 'Corporate Sales Amount', currency: 'Rp', min: 0 },
    { type: 'currency', name: 'corporate_profit', label: 'Corporate Profit Amount', currency: 'Rp', min: 0 },
    { type: 'calculated', name: 'corporate_margin_display', label: 'Corporate Profit Margin',
      formula: '((corporate_profit / corporate_sales) * 100).toFixed(1) + "%"',
      dependencies: ['corporate_sales', 'corporate_profit'] }
  ], async (formData) => {
    // Clean currency fields
    const currencyFields = ['retail_sales', 'retail_profit', 'corporate_sales', 'corporate_profit'];
    currencyFields.forEach(f => {
      if (formData[f]) {
        formData[f] = window.parseFormattedNumber ? window.parseFormattedNumber(formData[f]) : parseFloat(formData[f]) || 0;
      } else {
        formData[f] = 0;
      }
    });
    
    // Add product type
    formData.product_type = productType;
    
    // Calculate margins
    formData.retail_margin = calculateMargin(formData.retail_sales, formData.retail_profit);
    formData.corporate_margin = calculateMargin(formData.corporate_sales, formData.corporate_profit);
    formData.total_sales = formData.retail_sales + formData.corporate_sales;
    formData.total_profit = formData.retail_profit + formData.corporate_profit;
    formData.total_margin = calculateMargin(formData.total_sales, formData.total_profit);
    
    // Remove display fields
    delete formData.retail_margin_display;
    delete formData.corporate_margin_display;
    
    await window.fetchJson('/api/productivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    window.toast?.success(`${product.name} record added successfully`);
    await loadData();
  }, {
    entity: 'productivity',
    size: 'large',
    validation: {
      month: { required: true },
      year: { required: true, min: 2020 },
      staff_name: { required: true }
    }
  });
  
  // Add margin calculation listeners after modal opens
  setTimeout(() => {
    setupMarginCalculation();
  }, 200);
};

/* === SETUP MARGIN CALCULATION === */
function setupMarginCalculation() {
  const retailSalesInput = document.querySelector('input[name="retail_sales"]');
  const retailProfitInput = document.querySelector('input[name="retail_profit"]');
  const corpSalesInput = document.querySelector('input[name="corporate_sales"]');
  const corpProfitInput = document.querySelector('input[name="corporate_profit"]');
  
  const retailMarginDisplay = document.querySelector('[data-field="retail_margin_display"]');
  const corpMarginDisplay = document.querySelector('[data-field="corporate_margin_display"]');
  
  function updateMargins() {
    // Get raw values (handle formatted numbers)
    const getVal = (input) => {
      if (!input) return 0;
      const val = input.value.replace(/[^\d.-]/g, '');
      return parseFloat(val) || 0;
    };
    
    const rs = getVal(retailSalesInput);
    const rp = getVal(retailProfitInput);
    const cs = getVal(corpSalesInput);
    const cp = getVal(corpProfitInput);
    
    const rm = calculateMargin(rs, rp);
    const cm = calculateMargin(cs, cp);
    
    if (retailMarginDisplay) {
      retailMarginDisplay.innerHTML = `<span class="profit-margin ${getMarginClass(rm)}">${formatPercent(rm)}</span>`;
    }
    if (corpMarginDisplay) {
      corpMarginDisplay.innerHTML = `<span class="profit-margin ${getMarginClass(cm)}">${formatPercent(cm)}</span>`;
    }
  }
  
  [retailSalesInput, retailProfitInput, corpSalesInput, corpProfitInput].forEach(input => {
    if (input) {
      input.addEventListener('input', updateMargins);
      input.addEventListener('change', updateMargins);
    }
  });
  
  // Initial calculation
  updateMargins();
}

/* === EDIT PRODUCTIVITY === */
window.editProductivity = async function(id) {
  const item = productivityData.find(d => d.id === id);
  if (!item) return;
  
  const product = PRODUCT_TYPES.find(p => p.id === item.product_type);
  if (!product) return;
  
  window.CRUDModal.edit(`Edit ${product.icon} ${product.name} Record`, [
    { type: 'select', name: 'month', label: 'Month', required: true, icon: '📅',
      options: [
        { value: 1, label: 'January' }, { value: 2, label: 'February' },
        { value: 3, label: 'March' }, { value: 4, label: 'April' },
        { value: 5, label: 'May' }, { value: 6, label: 'June' },
        { value: 7, label: 'July' }, { value: 8, label: 'August' },
        { value: 9, label: 'September' }, { value: 10, label: 'October' },
        { value: 11, label: 'November' }, { value: 12, label: 'December' }
      ]
    },
    { type: 'number', name: 'year', label: 'Year', required: true, icon: '🗓️', min: 2020, max: 2100 },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, icon: '👤',
      options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'divider', label: '🏪 Retail Sales' },
    { type: 'currency', name: 'retail_sales', label: 'Retail Sales Amount', currency: 'Rp', min: 0 },
    { type: 'currency', name: 'retail_profit', label: 'Retail Profit Amount', currency: 'Rp', min: 0 },
    { type: 'calculated', name: 'retail_margin_display', label: 'Retail Profit Margin' },
    { type: 'divider', label: '🏢 Corporate Sales' },
    { type: 'currency', name: 'corporate_sales', label: 'Corporate Sales Amount', currency: 'Rp', min: 0 },
    { type: 'currency', name: 'corporate_profit', label: 'Corporate Profit Amount', currency: 'Rp', min: 0 },
    { type: 'calculated', name: 'corporate_margin_display', label: 'Corporate Profit Margin' }
  ], item, async (formData) => {
    // Clean currency fields
    const currencyFields = ['retail_sales', 'retail_profit', 'corporate_sales', 'corporate_profit'];
    currencyFields.forEach(f => {
      if (formData[f]) {
        formData[f] = window.parseFormattedNumber ? window.parseFormattedNumber(formData[f]) : parseFloat(formData[f]) || 0;
      } else {
        formData[f] = 0;
      }
    });
    
    // Keep product type
    formData.product_type = item.product_type;
    
    // Calculate margins
    formData.retail_margin = calculateMargin(formData.retail_sales, formData.retail_profit);
    formData.corporate_margin = calculateMargin(formData.corporate_sales, formData.corporate_profit);
    formData.total_sales = formData.retail_sales + formData.corporate_sales;
    formData.total_profit = formData.retail_profit + formData.corporate_profit;
    formData.total_margin = calculateMargin(formData.total_sales, formData.total_profit);
    
    // Remove display fields
    delete formData.retail_margin_display;
    delete formData.corporate_margin_display;
    
    await window.fetchJson(`/api/productivity/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    window.toast?.success(`${product.name} record updated successfully`);
    await loadData();
  }, {
    entity: 'productivity',
    size: 'large',
    validation: {
      month: { required: true },
      year: { required: true, min: 2020 },
      staff_name: { required: true }
    }
  });
  
  // Add margin calculation listeners after modal opens
  setTimeout(() => {
    setupMarginCalculation();
  }, 200);
};

/* === DELETE PRODUCTIVITY === */
window.deleteProductivity = async function(id) {
  const item = productivityData.find(d => d.id === id);
  if (!item) return;
  
  const product = PRODUCT_TYPES.find(p => p.id === item.product_type);
  
  window.CRUDModal.delete(
    `${product?.name || 'Productivity'} Record`,
    `${getMonthName(item.month)} ${item.year} - ${item.staff_name}`,
    async () => {
      await window.fetchJson(`/api/productivity/${id}`, { method: 'DELETE' });
      window.toast?.success('Record deleted successfully');
      await loadData();
    }
  );
};

/* === FILTER MODAL === */
el('filterBtn')?.addEventListener('click', () => {
  const now = new Date();
  
  window.openModal({
    title: '🔍 Filter Productivity Data',
    size: 'medium',
    bodyHtml: `
      <div class="filter-modal-content">
        <div class="filter-grid">
          <div class="filter-group">
            <label><span class="icon">🗓️</span> Year</label>
            <select name="year">
              <option value="">All Years</option>
              ${[...Array(10)].map((_, i) => {
                const year = now.getFullYear() - i;
                return `<option value="${year}" ${currentFilters.year === year ? 'selected' : ''}>${year}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label><span class="icon">📅</span> Month</label>
            <select name="month">
              <option value="">All Months</option>
              <option value="1" ${currentFilters.month === '1' ? 'selected' : ''}>January</option>
              <option value="2" ${currentFilters.month === '2' ? 'selected' : ''}>February</option>
              <option value="3" ${currentFilters.month === '3' ? 'selected' : ''}>March</option>
              <option value="4" ${currentFilters.month === '4' ? 'selected' : ''}>April</option>
              <option value="5" ${currentFilters.month === '5' ? 'selected' : ''}>May</option>
              <option value="6" ${currentFilters.month === '6' ? 'selected' : ''}>June</option>
              <option value="7" ${currentFilters.month === '7' ? 'selected' : ''}>July</option>
              <option value="8" ${currentFilters.month === '8' ? 'selected' : ''}>August</option>
              <option value="9" ${currentFilters.month === '9' ? 'selected' : ''}>September</option>
              <option value="10" ${currentFilters.month === '10' ? 'selected' : ''}>October</option>
              <option value="11" ${currentFilters.month === '11' ? 'selected' : ''}>November</option>
              <option value="12" ${currentFilters.month === '12' ? 'selected' : ''}>December</option>
            </select>
          </div>
          <div class="filter-group">
            <label><span class="icon">👤</span> Staff</label>
            <select name="staff">
              <option value="all">All Staff</option>
              ${usersData.map(u => `<option value="${u.name}" ${currentFilters.staff === u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label><span class="icon">📦</span> Product</label>
            <select name="product">
              <option value="all">All Products</option>
              ${PRODUCT_TYPES.map(p => `<option value="${p.id}" ${currentFilters.product === p.id ? 'selected' : ''}>${p.icon} ${p.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="filter-footer" style="margin-top: 20px;">
          <button type="button" class="btn" onclick="resetFilters()">🔄 Reset</button>
          <button type="submit" class="btn btn-primary">✓ Apply Filters</button>
        </div>
      </div>
    `,
    context: { entity: 'productivity', action: 'filter' }
  });
});

document.addEventListener('modalSubmit', (e) => {
  const { data, context } = e.detail;
  if (context.entity === 'productivity' && context.action === 'filter') {
    applyFilters(data);
  }
});

function applyFilters(data) {
  currentFilters = {
    year: data.year ? parseInt(data.year) : '',
    month: data.month || '',
    staff: data.staff || 'all',
    product: data.product || 'all'
  };
  
  // Filter data
  let filtered = [...productivityData];
  
  if (currentFilters.year) {
    filtered = filtered.filter(d => d.year === currentFilters.year);
  }
  if (currentFilters.month) {
    filtered = filtered.filter(d => d.month === parseInt(currentFilters.month));
  }
  if (currentFilters.staff !== 'all') {
    filtered = filtered.filter(d => d.staff_name === currentFilters.staff);
  }
  if (currentFilters.product !== 'all') {
    filtered = filtered.filter(d => d.product_type === currentFilters.product);
  }
  
  // Update productivityData temporarily for display
  const originalData = productivityData;
  productivityData = filtered;
  
  renderOverview();
  
  // Re-render current tab
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab && activeTab.dataset.tab !== 'overview') {
    renderProductTable(activeTab.dataset.tab);
  }
  
  // Restore original data for future operations
  productivityData = originalData;
  
  window.closeModal?.();
  window.toast?.info('Filters applied');
}

window.resetFilters = function() {
  currentFilters = {
    year: new Date().getFullYear(),
    month: '',
    staff: 'all',
    product: 'all'
  };
  window.closeModal?.();
  loadData();
  window.toast?.info('Filters reset');
};

/* === EXPORT === */
el('exportBtn')?.addEventListener('click', async () => {
  if (productivityData.length === 0) {
    window.toast?.warning('No data to export');
    return;
  }
  
  const headers = [
    'Month', 'Year', 'Product Type', 'Staff', 
    'Retail Sales', 'Retail Profit', 'Retail Margin %',
    'Corporate Sales', 'Corporate Profit', 'Corporate Margin %',
    'Total Sales', 'Total Profit', 'Total Margin %'
  ];
  
  const rows = productivityData.map(d => {
    const retailMargin = calculateMargin(d.retail_sales, d.retail_profit);
    const corpMargin = calculateMargin(d.corporate_sales, d.corporate_profit);
    const totalSales = (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0);
    const totalProfit = (parseFloat(d.retail_profit) || 0) + (parseFloat(d.corporate_profit) || 0);
    const totalMargin = calculateMargin(totalSales, totalProfit);
    
    return [
      getMonthName(d.month),
      d.year,
      d.product_type,
      d.staff_name,
      d.retail_sales || 0,
      d.retail_profit || 0,
      retailMargin.toFixed(1),
      d.corporate_sales || 0,
      d.corporate_profit || 0,
      corpMargin.toFixed(1),
      totalSales,
      totalProfit,
      totalMargin.toFixed(1)
    ];
  });
  
  const csv = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `productivity_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  window.toast?.success('Data exported successfully');
});

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadData();
});
