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
let currentUser = null;
let isBasicUser = false;
let currentFilters = {
  year: new Date().getFullYear(),
  month: String(new Date().getMonth() + 1), // Default to current month
  staff: 'all',
  product: 'all'
};

// Comparison state
let comparisonState = {
  period: 'month',
  year: new Date().getFullYear(),
  staff: 'all',
  product: 'all',
  compareMonth: new Date().getMonth() + 1 // For month-yoy comparison
};

/* === DISPLAY USER INFO === */
function initUserInfo() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  currentUser = user;
  isBasicUser = user.type === 'basic';
  
  el('userName').textContent = user.name || user.username || '—';
  el('userRole').textContent = { admin: 'Administrator', 'semi-admin': 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';
  
  // Show admin settings link for admin users
  if (user.type === 'admin' || user.type === 'semi-admin') {
    const adminLink = el('adminSettingsLink');
    if (adminLink) adminLink.style.display = 'block';
  }
}

/* === UTILITY FUNCTIONS === */
function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

function formatCompactCurrency(value) {
  const num = parseFloat(value) || 0;
  if (Math.abs(num) >= 1000000000) return 'Rp ' + (num / 1000000000).toFixed(1) + 'B';
  if (Math.abs(num) >= 1000000) return 'Rp ' + (num / 1000000).toFixed(1) + 'M';
  if (Math.abs(num) >= 1000) return 'Rp ' + (num / 1000).toFixed(1) + 'K';
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

function getMarginThresholds(productType = null) {
  // Use cached settings from API, fallback to localStorage
  const settings = cachedAppSettings || JSON.parse(localStorage.getItem('appSettings') || '{}');
  const defaultHigh = parseFloat(settings.marginHighThreshold) || 20;
  const defaultMedium = parseFloat(settings.marginMediumThreshold) || 10;
  
  // If product type specified, check for per-product settings
  if (productType && settings.productMargins && settings.productMargins[productType]) {
    const pm = settings.productMargins[productType];
    if (!pm.useDefault) {
      return {
        high: parseFloat(pm.high) || defaultHigh,
        medium: parseFloat(pm.medium) || defaultMedium
      };
    }
  }
  
  return {
    high: defaultHigh,
    medium: defaultMedium
  };
}

function getMarginClass(margin, productType = null) {
  const thresholds = getMarginThresholds(productType);
  if (margin >= thresholds.high) return 'high';
  if (margin >= thresholds.medium) return 'medium';
  return 'low';
}

function getMonthName(month) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(month) - 1] || '';
}

/* === LOADING STATE MANAGEMENT === */
function showLoading(message = 'Loading...') {
  const overlay = el('loadingOverlay');
  if (overlay) {
    const textEl = overlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = message;
    overlay.classList.add('active');
  }
}

function hideLoading() {
  const overlay = el('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

/* === PRINT FUNCTIONALITY === */
function initPrintButton() {
  const printBtn = el('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      // Set print title
      const activeTab = document.querySelector('.tab-btn.active');
      const tabName = activeTab ? activeTab.textContent.trim() : 'Productivity Report';
      document.title = `Productivity Dashboard - ${tabName}`;
      window.print();
    });
  }
}

/* === KEYBOARD SHORTCUTS === */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }
    
    // Ctrl+E - Export menu
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      const exportDropdown = document.querySelector('.export-dropdown');
      if (exportDropdown) {
        exportDropdown.classList.toggle('active');
      }
    }
    
    // Ctrl+P - Print
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      el('printBtn')?.click();
    }
    
    // Ctrl+F - Focus filter (when not in browser find)
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      el('filterYear')?.focus();
    }
    
    // Escape - Close modals/dropdowns
    if (e.key === 'Escape') {
      // Close export dropdown
      document.querySelectorAll('.export-dropdown.active').forEach(d => d.classList.remove('active'));
      // Close filter modal
      el('filterModal')?.classList.remove('active');
    }
    
    // Number keys 1-9 for quick tab navigation
    if (!e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= '9') {
      const tabIndex = parseInt(e.key) - 1;
      const tabs = document.querySelectorAll('.tab-btn');
      if (tabs[tabIndex]) {
        tabs[tabIndex].click();
      }
    }
  });
}

/* === TABLE SEARCH FUNCTIONALITY === */
function initTableSearch(productType) {
  const container = el(`tab-${productType}`);
  if (!container) return;
  
  // Check if search already exists
  if (container.querySelector('.table-search-box')) return;
  
  const table = container.querySelector('.data-table');
  if (!table) return;
  
  // Create search box
  const searchBox = document.createElement('div');
  searchBox.className = 'table-search-box';
  searchBox.innerHTML = `
    <input type="text" id="search-${productType}" placeholder="🔍 Search in table..." class="table-search-input">
  `;
  
  // Insert before table
  table.parentNode.insertBefore(searchBox, table);
  
  // Add search listener
  const searchInput = el(`search-${productType}`);
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterTable(productType, e.target.value);
    });
  }
}

function filterTable(productType, searchTerm) {
  const tbody = el(`table-${productType}`);
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll('tr');
  const term = searchTerm.toLowerCase().trim();
  
  rows.forEach(row => {
    if (!term) {
      row.style.display = '';
      return;
    }
    
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(term) ? '' : 'none';
  });
  
  // Update visible count
  const visibleRows = tbody.querySelectorAll('tr:not([style*="display: none"])');
  const container = el(`tab-${productType}`);
  let countEl = container?.querySelector('.search-count');
  
  if (!countEl && container) {
    countEl = document.createElement('div');
    countEl.className = 'search-count';
    countEl.style.cssText = 'margin: 8px 0; font-size: 0.85rem; color: var(--text-secondary);';
    const searchBox = container.querySelector('.table-search-box');
    searchBox?.appendChild(countEl);
  }
  
  if (countEl && term) {
    countEl.textContent = `Showing ${visibleRows.length} of ${rows.length} records`;
  } else if (countEl) {
    countEl.textContent = '';
  }
}

/* === DATA VALIDATION === */
function validateProductivityData(data) {
  const warnings = [];
  
  // Check if profit > sales (unusual)
  const totalRetail = (parseFloat(data.retail_sales) || 0);
  const retailProfit = (parseFloat(data.retail_profit) || 0);
  const totalCorp = (parseFloat(data.corporate_sales) || 0);
  const corpProfit = (parseFloat(data.corporate_profit) || 0);
  
  if (retailProfit > totalRetail && totalRetail > 0) {
    warnings.push('⚠️ Retail profit exceeds retail sales - please verify');
  }
  
  if (corpProfit > totalCorp && totalCorp > 0) {
    warnings.push('⚠️ Corporate profit exceeds corporate sales - please verify');
  }
  
  // Check for negative values
  if (totalRetail < 0 || retailProfit < 0 || totalCorp < 0 || corpProfit < 0) {
    warnings.push('⚠️ Negative values detected - please verify');
  }
  
  // Check margin (unusual if > 50%)
  const totalSales = totalRetail + totalCorp;
  const totalProfit = retailProfit + corpProfit;
  if (totalSales > 0) {
    const margin = (totalProfit / totalSales) * 100;
    if (margin > 50) {
      warnings.push(`⚠️ Unusually high profit margin (${margin.toFixed(1)}%) - please verify`);
    }
  }
  
  return warnings;
}

function showValidationWarnings(warnings) {
  const container = document.querySelector('.validation-warnings') || createValidationContainer();
  
  if (warnings.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.innerHTML = warnings.map(w => `<div class="validation-warning">${w}</div>`).join('');
  container.style.display = 'block';
}

function createValidationContainer() {
  const container = document.createElement('div');
  container.className = 'validation-warnings';
  container.style.cssText = 'margin-bottom: 15px;';
  
  // Find modal body to insert
  const modalBody = document.querySelector('.modal-body');
  if (modalBody) {
    modalBody.insertBefore(container, modalBody.firstChild);
  }
  
  return container;
}

/* === PAGINATION === */
const ITEMS_PER_PAGE = 20;
let paginationState = {};

function initPagination(productType, totalItems) {
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  
  if (!paginationState[productType]) {
    paginationState[productType] = { currentPage: 1, totalPages };
  } else {
    paginationState[productType].totalPages = totalPages;
  }
  
  renderPaginationControls(productType);
}

function renderPaginationControls(productType) {
  const container = el(`pagination-${productType}`);
  if (!container) return;
  
  const state = paginationState[productType];
  if (!state || state.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  const { currentPage, totalPages } = state;
  
  let html = `
    <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage('${productType}', 1)">⟪</button>
    <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage('${productType}', ${currentPage - 1})">←</button>
  `;
  
  // Page numbers
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage('${productType}', ${i})">${i}</button>`;
  }
  
  html += `
    <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage('${productType}', ${currentPage + 1})">→</button>
    <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage('${productType}', ${totalPages})">⟫</button>
    <span class="pagination-info">Page ${currentPage} of ${totalPages}</span>
  `;
  
  container.innerHTML = html;
}

function goToPage(productType, page) {
  const state = paginationState[productType];
  if (!state) return;
  
  page = Math.max(1, Math.min(page, state.totalPages));
  state.currentPage = page;
  
  renderProductTable(productType);
}

function getPaginatedData(data, productType) {
  const state = paginationState[productType];
  if (!state) return data;
  
  const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  
  return data.slice(start, end);
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
      if (tabId === 'comparison') {
        initComparisonTab();
      } else if (tabId !== 'overview') {
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
      ${!isBasicUser ? `<button class="btn btn-primary" onclick="openAddProductivityModal('${productType}')">
        ➕ Add ${product.name} Record
      </button>` : ''}
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
  
  // Initialize table search if not already done
  initTableSearch(productType);
  
  const filtered = productivityData.filter(d => d.product_type === productType);
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center">No ${productType} records found. Click "Add ${productType} Record" to create one.</td></tr>`;
    updateProductMetrics(productType, []);
    // Clear pagination
    const paginationContainer = el(`pagination-${productType}`);
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }
  
  // Sort by year desc, month desc
  filtered.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  });
  
  // Initialize pagination
  initPagination(productType, filtered.length);
  
  // Get paginated data
  const paginatedData = getPaginatedData(filtered, productType);
  
  tbody.innerHTML = paginatedData.map(item => {
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
        <td class="text-right"><span class="profit-margin ${getMarginClass(retailMargin, productType)}">${formatPercent(retailMargin)}</span></td>
        <td class="text-right">${formatCurrency(item.corporate_sales)}</td>
        <td class="text-right">${formatCurrency(item.corporate_profit)}</td>
        <td class="text-right"><span class="profit-margin ${getMarginClass(corpMargin, productType)}">${formatPercent(corpMargin)}</span></td>
        <td class="text-right"><strong>${formatCurrency(totalSales)}</strong></td>
        <td class="actions">
          ${!isBasicUser ? `<button class="btn btn-sm" onclick="editProductivity(${item.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProductivity(${item.id})">🗑️</button>` : '<span style="color: var(--text-secondary);">View only</span>'}
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
  if (rmEl) rmEl.innerHTML = `<span class="profit-margin ${getMarginClass(retailMargin, productType)}">${formatPercent(retailMargin)}</span>`;
  if (csEl) csEl.textContent = formatCurrency(corpSales);
  if (cmEl) cmEl.innerHTML = `<span class="profit-margin ${getMarginClass(corpMargin, productType)}">${formatPercent(corpMargin)}</span>`;
}

/* === LOAD DATA === */
async function loadData() {
  try {
    // Load productivity data
    productivityData = await window.fetchJson('/api/productivity') || [];
    
    // Load users for staff dropdown (admin/semi-admin only)
    if (!isBasicUser) {
      try {
        const allUsers = await window.fetchJson('/api/users') || [];
        // Filter to get users with valid names
        usersData = allUsers.filter(u => u.name && u.name.trim());
        // If no users with names, use usernames
        if (usersData.length === 0) {
          usersData = allUsers.filter(u => u.username).map(u => ({ ...u, name: u.name || u.username }));
        }
      } catch (err) {
        console.error('Error loading users:', err);
        usersData = [];
      }
      
      // Fallback: Extract unique staff names from productivity data if usersData is empty
      if (usersData.length === 0 && productivityData.length > 0) {
        const uniqueStaffNames = [...new Set(productivityData.map(d => d.staff_name).filter(Boolean))];
        usersData = uniqueStaffNames.map(name => ({ name }));
        console.log('📋 Staff list extracted from productivity data:', uniqueStaffNames);
      }
    } else {
      // Basic users don't need the dropdown
      usersData = [];
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
        <td class="text-right"><span class="profit-margin ${getMarginClass(margin, p.id)}">${formatPercent(margin)}</span></td>
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
  // Prevent basic users from adding
  if (isBasicUser) {
    window.toast?.error('You do not have permission to add productivity records');
    return;
  }
  
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
    
    // Validate data before saving
    const warnings = validateProductivityData(formData);
    if (warnings.length > 0) {
      // Show warnings but allow to continue
      const proceed = await new Promise(resolve => {
        if (window.confirmDialog) {
          window.confirmDialog(
            'Data Validation Warnings',
            `${warnings.join('<br>')}<br><br>Do you want to save anyway?`,
            () => resolve(true),
            () => resolve(false)
          );
        } else {
          resolve(confirm(warnings.join('\n') + '\n\nDo you want to save anyway?'));
        }
      });
      if (!proceed) return;
    }
    
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
    setupMarginCalculation(productType);
  }, 200);
};

/* === SETUP MARGIN CALCULATION === */
function setupMarginCalculation(productType) {
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
      retailMarginDisplay.innerHTML = `<span class="profit-margin ${getMarginClass(rm, productType)}">${formatPercent(rm)}</span>`;
    }
    if (corpMarginDisplay) {
      corpMarginDisplay.innerHTML = `<span class="profit-margin ${getMarginClass(cm, productType)}">${formatPercent(cm)}</span>`;
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
  // Prevent basic users from editing
  if (isBasicUser) {
    window.toast?.error('You do not have permission to edit productivity records');
    return;
  }
  
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
    
    // Validate data before saving
    const warnings = validateProductivityData(formData);
    if (warnings.length > 0) {
      const proceed = await new Promise(resolve => {
        if (window.confirmDialog) {
          window.confirmDialog(
            'Data Validation Warnings',
            `${warnings.join('<br>')}<br><br>Do you want to save anyway?`,
            () => resolve(true),
            () => resolve(false)
          );
        } else {
          resolve(confirm(warnings.join('\n') + '\n\nDo you want to save anyway?'));
        }
      });
      if (!proceed) return;
    }
    
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
    setupMarginCalculation(item.product_type);
  }, 200);
};

/* === DELETE PRODUCTIVITY === */
window.deleteProductivity = async function(id) {
  // Prevent basic users from deleting
  if (isBasicUser) {
    window.toast?.error('You do not have permission to delete productivity records');
    return;
  }
  
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
          ${!isBasicUser ? '<div class="filter-group"><label><span class="icon">👤</span> Staff</label><select name="staff"><option value="all">All Staff</option>' + usersData.map(u => '<option value="' + u.name + '"' + (currentFilters.staff === u.name ? ' selected' : '') + '>' + u.name + '</option>').join('') + '</select></div>' : ''}
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
  
  // Filter data and store in a separate variable
  let filteredData = [...productivityData];
  
  if (currentFilters.year) {
    filteredData = filteredData.filter(d => d.year === currentFilters.year);
  }
  if (currentFilters.month) {
    filteredData = filteredData.filter(d => d.month === parseInt(currentFilters.month));
  }
  if (currentFilters.staff !== 'all') {
    filteredData = filteredData.filter(d => d.staff_name === currentFilters.staff);
  }
  if (currentFilters.product !== 'all') {
    filteredData = filteredData.filter(d => d.product_type === currentFilters.product);
  }
  
  // Store filtered data for export and display
  window.filteredProductivityData = filteredData;
  
  // Temporarily swap for rendering
  const originalData = productivityData;
  productivityData = filteredData;
  
  renderOverview();
  
  // Re-render current tab
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab && activeTab.dataset.tab !== 'overview' && activeTab.dataset.tab !== 'comparison') {
    renderProductTable(activeTab.dataset.tab);
  }
  
  // Restore original data for future operations
  productivityData = originalData;
  
  window.closeModal?.();
  window.toast?.info(`Filters applied - ${filteredData.length} records found`);
}

window.resetFilters = function() {
  currentFilters = {
    year: new Date().getFullYear(),
    month: '',
    staff: 'all',
    product: 'all'
  };
  // Clear filtered data
  window.filteredProductivityData = null;
  window.closeModal?.();
  loadData();
  window.toast?.info('Filters reset');
};

/* === EXPORT FUNCTIONALITY === */

// Export dropdown toggle
el('exportBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = el('exportMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const menu = el('exportMenu');
  const btn = el('exportBtn');
  if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// Add hover effect to export options
document.querySelectorAll('.export-option').forEach(opt => {
  opt.addEventListener('mouseenter', () => {
    opt.style.background = 'var(--bg-tertiary)';
  });
  opt.addEventListener('mouseleave', () => {
    opt.style.background = 'none';
  });
});

// Handle export option clicks
document.querySelectorAll('.export-option').forEach(opt => {
  opt.addEventListener('click', (e) => {
    const format = e.currentTarget.dataset.format;
    el('exportMenu').style.display = 'none';
    
    const dataToExport = window.filteredProductivityData || productivityData;
    if (dataToExport.length === 0) {
      window.toast?.warning('No data to export');
      return;
    }
    
    switch (format) {
      case 'csv':
        exportToCSV();
        break;
      case 'xlsx':
        exportToExcel();
        break;
      case 'pdf':
        exportToPDF();
        break;
    }
  });
});

// Get export data with calculations
function getExportData() {
  // Use filtered data if filters are applied, otherwise use all data
  const dataToExport = window.filteredProductivityData || productivityData;
  
  const headers = [
    'Month', 'Year', 'Product Type', 'Staff', 
    'Retail Sales', 'Retail Profit', 'Retail Margin %',
    'Corporate Sales', 'Corporate Profit', 'Corporate Margin %',
    'Total Sales', 'Total Profit', 'Total Margin %'
  ];
  
  const rows = dataToExport.map(d => {
    const retailMargin = calculateMargin(d.retail_sales, d.retail_profit);
    const corpMargin = calculateMargin(d.corporate_sales, d.corporate_profit);
    const totalSales = (parseFloat(d.retail_sales) || 0) + (parseFloat(d.corporate_sales) || 0);
    const totalProfit = (parseFloat(d.retail_profit) || 0) + (parseFloat(d.corporate_profit) || 0);
    const totalMargin = calculateMargin(totalSales, totalProfit);
    
    return {
      month: getMonthName(d.month),
      year: d.year,
      productType: d.product_type,
      staff: d.staff_name,
      retailSales: d.retail_sales || 0,
      retailProfit: d.retail_profit || 0,
      retailMargin: retailMargin.toFixed(1),
      corporateSales: d.corporate_sales || 0,
      corporateProfit: d.corporate_profit || 0,
      corporateMargin: corpMargin.toFixed(1),
      totalSales,
      totalProfit,
      totalMargin: totalMargin.toFixed(1)
    };
  });
  
  return { headers, rows };
}

// Export to CSV
function exportToCSV() {
  showLoading('Exporting to CSV...');
  
  setTimeout(() => {
    try {
      const { headers, rows } = getExportData();
      
      const csvRows = rows.map(r => [
        r.month, r.year, r.productType, r.staff,
        r.retailSales, r.retailProfit, r.retailMargin,
        r.corporateSales, r.corporateProfit, r.corporateMargin,
        r.totalSales, r.totalProfit, r.totalMargin
      ]);
      
      const csv = [
        headers.join(','),
        ...csvRows.map(r => r.join(','))
      ].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `productivity_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      window.toast?.success('CSV exported successfully');
    } catch (err) {
      console.error('CSV export error:', err);
      window.toast?.error('Failed to export CSV');
    } finally {
      hideLoading();
    }
  }, 100);
}

// Export to Excel (XLSX)
function exportToExcel() {
  showLoading('Exporting to Excel...');
  
  setTimeout(() => {
    try {
      const { headers, rows } = getExportData();
      
      // Prepare data for worksheet
      const wsData = [headers];
      rows.forEach(r => {
        wsData.push([
          r.month, r.year, r.productType, r.staff,
          parseFloat(r.retailSales), parseFloat(r.retailProfit), parseFloat(r.retailMargin),
          parseFloat(r.corporateSales), parseFloat(r.corporateProfit), parseFloat(r.corporateMargin),
          parseFloat(r.totalSales), parseFloat(r.totalProfit), parseFloat(r.totalMargin)
        ]);
      });
      
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Set column widths
    ws['!cols'] = [
      { wch: 10 }, // Month
      { wch: 8 },  // Year
      { wch: 12 }, // Product Type
      { wch: 20 }, // Staff
      { wch: 15 }, // Retail Sales
      { wch: 15 }, // Retail Profit
      { wch: 12 }, // Retail Margin
      { wch: 15 }, // Corporate Sales
      { wch: 15 }, // Corporate Profit
      { wch: 14 }, // Corporate Margin
      { wch: 15 }, // Total Sales
      { wch: 15 }, // Total Profit
      { wch: 12 }  // Total Margin
    ];
    
    // Add summary sheet
    const summaryData = [
      ['Productivity Report Summary'],
      ['Generated:', new Date().toLocaleString()],
      ['Total Records:', productivityData.length],
      [],
      ['Product Summary'],
      ['Product', 'Total Sales', 'Total Profit', 'Avg Margin']
    ];
    
    const productSummary = {};
    rows.forEach(r => {
      if (!productSummary[r.productType]) {
        productSummary[r.productType] = { sales: 0, profit: 0, count: 0 };
      }
      productSummary[r.productType].sales += parseFloat(r.totalSales);
      productSummary[r.productType].profit += parseFloat(r.totalProfit);
      productSummary[r.productType].count++;
    });
    
    Object.entries(productSummary).forEach(([product, data]) => {
      const margin = data.sales > 0 ? (data.profit / data.sales * 100).toFixed(1) : '0.0';
      summaryData.push([product, data.sales, data.profit, margin + '%']);
    });
    
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
    
    // Add sheets to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Productivity Data');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    
    // Generate and download
    XLSX.writeFile(wb, `productivity_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    window.toast?.success('Excel file exported successfully');
    } catch (err) {
      console.error('Excel export error:', err);
      window.toast?.error('Failed to export Excel file');
    } finally {
      hideLoading();
    }
  }, 100);
}

// Export to PDF
function exportToPDF() {
  showLoading('Generating PDF...');
  
  setTimeout(() => {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
      
      const { headers, rows } = getExportData();
      
      // Title
      doc.setFontSize(18);
      doc.setTextColor(59, 130, 246);
      doc.text('Productivity Report', 14, 15);
      
      // Subtitle with filter info
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
      
    // Show active filters
    let filterInfo = [];
    if (currentFilters.year) filterInfo.push(`Year: ${currentFilters.year}`);
    if (currentFilters.month) filterInfo.push(`Month: ${getMonthName(parseInt(currentFilters.month))}`);
    if (currentFilters.staff !== 'all') filterInfo.push(`Staff: ${currentFilters.staff}`);
    if (currentFilters.product !== 'all') filterInfo.push(`Product: ${currentFilters.product}`);
    
    const filterText = filterInfo.length > 0 ? `Filters: ${filterInfo.join(', ')}` : 'All Data';
    doc.text(`${filterText} | Records: ${rows.length}`, 14, 27);
    
    // Summary metrics
    const totalSales = rows.reduce((sum, r) => sum + parseFloat(r.totalSales), 0);
    const totalProfit = rows.reduce((sum, r) => sum + parseFloat(r.totalProfit), 0);
    const avgMargin = totalSales > 0 ? (totalProfit / totalSales * 100).toFixed(1) : '0.0';
    
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Total Sales: ${formatCurrency(totalSales)}`, 14, 35);
    doc.text(`Total Profit: ${formatCurrency(totalProfit)}`, 100, 35);
    doc.text(`Avg Margin: ${avgMargin}%`, 190, 35);
    
    // Table data
    const tableData = rows.map(r => [
      r.month,
      r.year,
      r.productType,
      r.staff,
      formatCurrency(r.retailSales),
      formatCurrency(r.retailProfit),
      r.retailMargin + '%',
      formatCurrency(r.corporateSales),
      formatCurrency(r.corporateProfit),
      r.corporateMargin + '%',
      formatCurrency(r.totalSales),
      formatCurrency(r.totalProfit),
      r.totalMargin + '%'
    ]);
    
    // Generate table
    doc.autoTable({
      head: [headers],
      body: tableData,
      startY: 42,
      styles: {
        fontSize: 7,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250]
      },
      columnStyles: {
        0: { cellWidth: 15 },  // Month
        1: { cellWidth: 12 },  // Year
        2: { cellWidth: 18 },  // Product Type
        3: { cellWidth: 25 },  // Staff
        4: { cellWidth: 22, halign: 'right' },  // Retail Sales
        5: { cellWidth: 22, halign: 'right' },  // Retail Profit
        6: { cellWidth: 15, halign: 'right' },  // Retail Margin
        7: { cellWidth: 22, halign: 'right' },  // Corp Sales
        8: { cellWidth: 22, halign: 'right' },  // Corp Profit
        9: { cellWidth: 15, halign: 'right' },  // Corp Margin
        10: { cellWidth: 22, halign: 'right' }, // Total Sales
        11: { cellWidth: 22, halign: 'right' }, // Total Profit
        12: { cellWidth: 15, halign: 'right' }  // Total Margin
      }
    });
    
    // Add product summary on new page if there's data
    if (rows.length > 0) {
      doc.addPage();
      
      doc.setFontSize(16);
      doc.setTextColor(59, 130, 246);
      doc.text('Product Category Summary', 14, 15);
      
      // Build product summary
      const productSummary = {};
      PRODUCT_TYPES.forEach(p => {
        productSummary[p.id] = { name: p.name, icon: p.icon, sales: 0, profit: 0 };
      });
      
      rows.forEach(r => {
        if (productSummary[r.productType]) {
          productSummary[r.productType].sales += parseFloat(r.totalSales);
          productSummary[r.productType].profit += parseFloat(r.totalProfit);
        }
      });
      
      const summaryTableData = Object.entries(productSummary)
        .filter(([_, data]) => data.sales > 0)
        .map(([id, data]) => {
          const margin = data.sales > 0 ? (data.profit / data.sales * 100).toFixed(1) : '0.0';
          return [
            data.name,
            formatCurrency(data.sales),
            formatCurrency(data.profit),
            margin + '%'
          ];
        });
      
      doc.autoTable({
        head: [['Product Category', 'Total Sales', 'Total Profit', 'Margin']],
        body: summaryTableData,
        startY: 22,
        styles: {
          fontSize: 10,
          cellPadding: 4
        },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [240, 253, 244]
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 45, halign: 'right' },
          2: { cellWidth: 45, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' }
        }
      });
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${i} of ${pageCount} - TravelOps Productivity Report`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }
    
    // Save
    doc.save(`productivity_export_${new Date().toISOString().slice(0, 10)}.pdf`);
    
    window.toast?.success('PDF exported successfully');
    } catch (err) {
      console.error('PDF export error:', err);
      window.toast?.error('Failed to export PDF file');
    } finally {
      hideLoading();
    }
  }, 100);
}

/* === IMPORT FUNCTIONALITY === */
let importData = [];

// Download CSV Template
el('downloadTemplateBtn')?.addEventListener('click', () => {
  const headers = [
    'month', 'year', 'product_type', 'staff_name',
    'retail_sales', 'retail_profit', 'corporate_sales', 'corporate_profit'
  ];
  
  // Sample data rows
  const sampleRows = [
    ['1', '2026', 'flight', 'John Doe', '50000000', '5000000', '100000000', '8000000'],
    ['1', '2026', 'hotel', 'Jane Smith', '30000000', '4500000', '60000000', '9000000'],
    ['2', '2026', 'tour', 'John Doe', '75000000', '11250000', '150000000', '22500000']
  ];
  
  const csvContent = [
    '# PRODUCTIVITY IMPORT TEMPLATE',
    '# Instructions:',
    '# - month: 1-12 (January=1, December=12)',
    '# - year: 4-digit year (e.g., 2026)',
    '# - product_type: flight, hotel, tour, package, cruise, admission, passport, visa, insurance, train, other',
    '# - staff_name: Name of the staff member',
    '# - retail_sales: Retail sales amount (number only, no currency symbol)',
    '# - retail_profit: Retail profit amount',
    '# - corporate_sales: Corporate sales amount',
    '# - corporate_profit: Corporate profit amount',
    '# Delete these comment lines before importing!',
    '',
    headers.join(','),
    ...sampleRows.map(r => r.join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'productivity_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
  
  window.toast?.success('Template downloaded! Fill it with your data and import.');
});

// Open Import Modal
el('importBtn')?.addEventListener('click', () => {
  el('importModal').style.display = 'flex';
  el('importFile').value = '';
  el('importPreview').style.display = 'none';
  el('confirmImportBtn').disabled = true;
  importData = [];
});

// Close Import Modal
window.closeImportModal = function() {
  el('importModal').style.display = 'none';
  importData = [];
};

// Setup drag and drop
const dropZone = el('dropZone');
const importFile = el('importFile');

dropZone?.addEventListener('click', () => importFile?.click());

dropZone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#3b82f6';
  dropZone.style.background = '#eff6ff';
});

dropZone?.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#d1d5db';
  dropZone.style.background = '#f9fafb';
});

dropZone?.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#d1d5db';
  dropZone.style.background = '#f9fafb';
  
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    processImportFile(file);
  } else {
    window.toast?.error('Please upload a CSV file');
  }
});

importFile?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    processImportFile(file);
  }
});

// Process CSV file
function processImportFile(file) {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const lines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#')); // Remove empty lines and comments
      
      if (lines.length < 2) {
        window.toast?.error('File must have header row and at least one data row');
        return;
      }
      
      // Parse header
      const headers = parseCSVLine(lines[0]);
      const requiredHeaders = ['month', 'year', 'product_type', 'staff_name', 'retail_sales', 'retail_profit', 'corporate_sales', 'corporate_profit'];
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        window.toast?.error(`Missing required columns: ${missingHeaders.join(', ')}`);
        return;
      }
      
      // Parse data rows
      importData = [];
      const errors = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length !== headers.length) continue;
        
        const row = {};
        headers.forEach((h, idx) => row[h] = values[idx]);
        
        // Validate row
        const rowErrors = validateImportRow(row, i + 1);
        if (rowErrors.length > 0) {
          errors.push(...rowErrors);
          continue;
        }
        
        importData.push({
          month: parseInt(row.month),
          year: parseInt(row.year),
          product_type: row.product_type.toLowerCase(),
          staff_name: row.staff_name,
          retail_sales: parseFloat(row.retail_sales) || 0,
          retail_profit: parseFloat(row.retail_profit) || 0,
          corporate_sales: parseFloat(row.corporate_sales) || 0,
          corporate_profit: parseFloat(row.corporate_profit) || 0
        });
      }
      
      if (errors.length > 0 && importData.length === 0) {
        window.toast?.error(`Import failed: ${errors.slice(0, 3).join('; ')}`);
        return;
      }
      
      // Show preview
      showImportPreview(headers, importData, errors);
      
    } catch (err) {
      console.error('Import error:', err);
      window.toast?.error('Failed to parse CSV file: ' + err.message);
    }
  };
  
  reader.readAsText(file);
}

// Parse CSV line handling quoted values
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

// Validate import row
function validateImportRow(row, rowNum) {
  const errors = [];
  const validProductTypes = ['flight', 'hotel', 'tour', 'package', 'cruise', 'admission', 'passport', 'visa', 'insurance', 'train', 'other'];
  
  const month = parseInt(row.month);
  if (isNaN(month) || month < 1 || month > 12) {
    errors.push(`Row ${rowNum}: Invalid month (must be 1-12)`);
  }
  
  const year = parseInt(row.year);
  if (isNaN(year) || year < 2000 || year > 2100) {
    errors.push(`Row ${rowNum}: Invalid year`);
  }
  
  if (!validProductTypes.includes(row.product_type?.toLowerCase())) {
    errors.push(`Row ${rowNum}: Invalid product_type`);
  }
  
  if (!row.staff_name || row.staff_name.trim() === '') {
    errors.push(`Row ${rowNum}: Missing staff_name`);
  }
  
  return errors;
}

// Show import preview
function showImportPreview(headers, data, errors) {
  const previewDiv = el('importPreview');
  const previewHeader = el('previewHeader');
  const previewBody = el('previewBody');
  const importStats = el('importStats');
  const confirmBtn = el('confirmImportBtn');
  
  // Build header
  previewHeader.innerHTML = `<tr>${['#', 'Month', 'Year', 'Product', 'Staff', 'Retail Sales', 'Corp Sales'].map(h => `<th>${h}</th>`).join('')}</tr>`;
  
  // Build body (show first 5 rows)
  const previewRows = data.slice(0, 5);
  previewBody.innerHTML = previewRows.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${getMonthName(d.month)}</td>
      <td>${d.year}</td>
      <td>${d.product_type}</td>
      <td>${d.staff_name}</td>
      <td>${formatCurrency(d.retail_sales)}</td>
      <td>${formatCurrency(d.corporate_sales)}</td>
    </tr>
  `).join('');
  
  // Stats
  let statsText = `✅ ${data.length} rows ready to import`;
  if (errors.length > 0) {
    statsText += ` | ⚠️ ${errors.length} rows skipped due to errors`;
  }
  if (data.length > 5) {
    statsText += ` | Showing first 5 of ${data.length} rows`;
  }
  importStats.textContent = statsText;
  
  previewDiv.style.display = 'block';
  confirmBtn.disabled = data.length === 0;
}

// Confirm Import
el('confirmImportBtn')?.addEventListener('click', async () => {
  if (importData.length === 0) {
    window.toast?.warning('No data to import');
    return;
  }
  
  const confirmBtn = el('confirmImportBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '⏳ Importing...';
  
  let successCount = 0;
  let errorCount = 0;
  
  // Get current user for staff ownership
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  
  for (const row of importData) {
    try {
      const response = await fetch('/api/productivity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(row)
      });
      
      if (response.ok) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (err) {
      console.error('Import row error:', err);
      errorCount++;
    }
  }
  
  closeImportModal();
  
  if (errorCount === 0) {
    window.toast?.success(`Successfully imported ${successCount} records!`);
  } else {
    window.toast?.warning(`Imported ${successCount} records, ${errorCount} failed`);
  }
  
  // Reload data
  await loadData();
});

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', async () => {
  initUserInfo();
  initTabs();
  initComparisonControls();
  initPrintButton();
  initKeyboardShortcuts();
  initQuickFilters();
  
  // Load margin settings from API (database)
  await refreshMarginSettings();
  
  // Hide import button for basic users (they can only view their own data)
  if (isBasicUser) {
    const importBtn = el('importBtn');
    if (importBtn) importBtn.style.display = 'none';
    
    const downloadTemplateBtn = el('downloadTemplateBtn');
    if (downloadTemplateBtn) downloadTemplateBtn.style.display = 'none';
  }
  
  showLoading('Loading productivity data...');
  await loadData();
  hideLoading();
  
  // Update quick filters with staff data after load
  populateQuickFilterStaff();
  
  // Apply initial filters (current year + current month by default)
  applyQuickFilters();
});

/* === MARGIN SETTINGS (cached from API) === */
let cachedAppSettings = null;

async function refreshMarginSettings() {
  // Load settings from API (database) with localStorage fallback
  try {
    const apiSettings = await window.fetchJson('/api/settings');
    if (apiSettings && Object.keys(apiSettings).length > 0) {
      cachedAppSettings = apiSettings;
      // Update localStorage cache
      localStorage.setItem('appSettings', JSON.stringify(apiSettings));
      console.log('✅ Margin settings loaded from database:', {
        high: apiSettings.marginHighThreshold || 20,
        medium: apiSettings.marginMediumThreshold || 10,
        productMargins: apiSettings.productMargins || {}
      });
      return;
    }
  } catch (err) {
    console.warn('⚠️ Failed to load settings from API:', err);
  }
  
  // Fallback to localStorage
  cachedAppSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
  console.log('📦 Margin settings loaded from localStorage:', {
    high: cachedAppSettings.marginHighThreshold || 20,
    medium: cachedAppSettings.marginMediumThreshold || 10,
    productMargins: cachedAppSettings.productMargins || {}
  });
}

/* === QUICK FILTERS === */
function initQuickFilters() {
  const yearSelect = el('quickFilterYear');
  const monthSelect = el('quickFilterMonth');
  const staffSelect = el('quickFilterStaff');
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  // Populate year dropdown - default to current year
  if (yearSelect) {
    yearSelect.innerHTML = '<option value="">All Years</option>' +
      [...Array(10)].map((_, i) => {
        const year = currentYear - i;
        return `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`;
      }).join('');
    
    yearSelect.addEventListener('change', () => applyQuickFilters());
  }
  
  // Set month dropdown to current month
  if (monthSelect) {
    monthSelect.value = String(currentMonth);
    monthSelect.addEventListener('change', () => applyQuickFilters());
  }
  
  // Show staff filter for admin/semi-admin users
  if (staffSelect && !isBasicUser) {
    staffSelect.style.display = '';
    staffSelect.addEventListener('change', () => applyQuickFilters());
  }
}

function populateQuickFilterStaff() {
  const staffSelect = el('quickFilterStaff');
  if (!staffSelect || isBasicUser) return;
  
  staffSelect.innerHTML = '<option value="all">All Staff</option>' +
    usersData.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
  
  staffSelect.value = currentFilters.staff || 'all';
}

function applyQuickFilters() {
  const yearSelect = el('quickFilterYear');
  const monthSelect = el('quickFilterMonth');
  const staffSelect = el('quickFilterStaff');
  
  currentFilters = {
    year: yearSelect?.value ? parseInt(yearSelect.value) : '',
    month: monthSelect?.value || '',
    staff: staffSelect?.value || 'all',
    product: currentFilters.product || 'all'
  };
  
  // Filter data
  let filteredData = [...productivityData];
  
  if (currentFilters.year) {
    filteredData = filteredData.filter(d => d.year === currentFilters.year);
  }
  if (currentFilters.month) {
    filteredData = filteredData.filter(d => d.month === parseInt(currentFilters.month));
  }
  if (currentFilters.staff !== 'all') {
    filteredData = filteredData.filter(d => d.staff_name === currentFilters.staff);
  }
  if (currentFilters.product !== 'all') {
    filteredData = filteredData.filter(d => d.product_type === currentFilters.product);
  }
  
  // Store for export
  window.filteredProductivityData = filteredData;
  
  // Temporarily swap for rendering
  const originalData = productivityData;
  productivityData = filteredData;
  
  renderOverview();
  
  // Re-render current product tab if active
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab && activeTab.dataset.tab !== 'overview' && activeTab.dataset.tab !== 'comparison') {
    renderProductTable(activeTab.dataset.tab);
  }
  
  // Restore original data
  productivityData = originalData;
}

/* =========================================================
   COMPARISON FEATURE - Month, Quarter, Semester, YTD Analysis
   ========================================================= */

/* === PERIOD HELPERS === */
function getQuarter(month) {
  return Math.ceil(month / 3);
}

function getSemester(month) {
  return month <= 6 ? 1 : 2;
}

function getQuarterMonths(quarter) {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

function getSemesterMonths(semester) {
  return semester === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
}

function getYTDMonths(currentMonth) {
  return Array.from({ length: currentMonth }, (_, i) => i + 1);
}

function getPeriodLabel(period, value, year) {
  switch (period) {
    case 'month':
      return `${getMonthName(value)} ${year}`;
    case 'month-yoy':
      return `${getMonthName(value)} ${year}`;
    case 'quarter':
      return `Q${value} ${year}`;
    case 'semester':
      return `${value === 1 ? 'H1' : 'H2'} ${year}`;
    case 'ytd':
      return `YTD ${year}`;
    default:
      return '';
  }
}

function getCurrentPeriodValue(period) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  
  switch (period) {
    case 'month':
      return currentMonth;
    case 'month-yoy':
      return comparisonState.compareMonth;
    case 'quarter':
      return getQuarter(currentMonth);
    case 'semester':
      return getSemester(currentMonth);
    case 'ytd':
      return currentMonth;
    default:
      return 1;
  }
}

function getPreviousPeriod(period, value, year) {
  switch (period) {
    case 'month':
      if (value === 1) {
        return { value: 12, year: year - 1 };
      }
      return { value: value - 1, year };
    case 'month-yoy':
      // For month vs month YoY, previous is same month last year
      return { value: value, year: year - 1 };
    case 'quarter':
      if (value === 1) {
        return { value: 4, year: year - 1 };
      }
      return { value: value - 1, year };
    case 'semester':
      if (value === 1) {
        return { value: 2, year: year - 1 };
      }
      return { value: value - 1, year };
    case 'ytd':
      return { value: value, year: year - 1 };
    default:
      return { value, year };
  }
}

function getMonthsForPeriod(period, value) {
  switch (period) {
    case 'month':
      return [value];
    case 'month-yoy':
      return [value];
    case 'quarter':
      return getQuarterMonths(value);
    case 'semester':
      return getSemesterMonths(value);
    case 'ytd':
      return getYTDMonths(value);
    default:
      return [];
  }
}

/* === INITIALIZE COMPARISON CONTROLS === */
function initComparisonControls() {
  // Period selector buttons
  const periodBtns = document.querySelectorAll('.period-btn');
  const monthSelect = el('comparisonMonth');
  const customMonthSection = el('customMonthSection');
  
  periodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      comparisonState.period = btn.dataset.period;
      
      // Show/hide month selector for month-yoy comparison
      if (monthSelect) {
        monthSelect.style.display = btn.dataset.period === 'month-yoy' ? 'block' : 'none';
      }
      
      // Show/hide custom month section
      if (customMonthSection) {
        customMonthSection.style.display = btn.dataset.period === 'custom' ? 'block' : 'none';
        el('customComparisonResults').style.display = 'none'; // Hide results when switching
      }
      
      // Hide regular comparison elements when custom is selected
      if (btn.dataset.period === 'custom') {
        el('comparisonSummary').style.display = 'none';
        el('comparisonCards').style.display = 'none';
        document.querySelector('.comparison-chart-container').style.display = 'none';
        document.querySelector('.comparison-table-container').style.display = 'none';
      } else {
        el('comparisonSummary').style.display = 'block';
        el('comparisonCards').style.display = 'grid';
        document.querySelector('.comparison-chart-container').style.display = 'grid';
        document.querySelector('.comparison-table-container').style.display = 'block';
        renderComparison();
      }
    });
  });
  
  // Custom compare button
  const customCompareBtn = el('customCompareBtn');
  if (customCompareBtn) {
    customCompareBtn.addEventListener('click', runCustomMonthComparison);
  }
  
  // Set default values for custom month selectors
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  
  if (el('customMonth1')) el('customMonth1').value = currentMonth;
  if (el('customYear1')) el('customYear1').value = currentYear;
  if (el('customMonth2')) el('customMonth2').value = prevMonth;
  if (el('customYear2')) el('customYear2').value = prevYear;
  
  // Year selector
  const yearSelect = el('comparisonYear');
  if (yearSelect) {
    const now = new Date();
    for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      opt.selected = y === comparisonState.year;
      yearSelect.appendChild(opt);
    }
    yearSelect.addEventListener('change', (e) => {
      comparisonState.year = parseInt(e.target.value);
      renderComparison();
    });
  }
  
  // Staff selector
  const staffSelect = el('comparisonStaff');
  if (staffSelect) {
    staffSelect.addEventListener('change', (e) => {
      comparisonState.staff = e.target.value;
      renderComparison();
    });
  }
  
  // Product selector
  const productSelect = el('comparisonProduct');
  if (productSelect) {
    PRODUCT_TYPES.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.icon} ${p.name}`;
      productSelect.appendChild(opt);
    });
    productSelect.addEventListener('change', (e) => {
      comparisonState.product = e.target.value;
      renderComparison();
    });
  }
  
  // Month selector for month-yoy comparison
  if (monthSelect) {
    // Set default to current month
    monthSelect.value = comparisonState.compareMonth;
    monthSelect.addEventListener('change', (e) => {
      comparisonState.compareMonth = parseInt(e.target.value);
      renderComparison();
    });
  }
}

/* === CUSTOM MONTH VS MONTH COMPARISON === */
function runCustomMonthComparison() {
  const month1 = parseInt(el('customMonth1').value);
  const year1 = parseInt(el('customYear1').value);
  const month2 = parseInt(el('customMonth2').value);
  const year2 = parseInt(el('customYear2').value);
  
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const period1Label = `${monthNames[month1]} ${year1}`;
  const period2Label = `${monthNames[month2]} ${year2}`;
  
  // Update headers
  el('customPeriod1SalesHeader').textContent = `${period1Label} Sales`;
  el('customPeriod1ProfitHeader').textContent = `${period1Label} Profit`;
  el('customPeriod2SalesHeader').textContent = `${period2Label} Sales`;
  el('customPeriod2ProfitHeader').textContent = `${period2Label} Profit`;
  
  // Get data for each period grouped by product type
  const productStats = {};
  let grandTotal1Sales = 0, grandTotal1Profit = 0;
  let grandTotal2Sales = 0, grandTotal2Profit = 0;
  
  // Initialize all product types
  PRODUCT_TYPES.forEach(p => {
    productStats[p.id] = {
      name: p.name,
      icon: p.icon,
      period1Sales: 0,
      period1Profit: 0,
      period2Sales: 0,
      period2Profit: 0
    };
  });
  
  // Aggregate data
  productivityData.forEach(d => {
    const productType = d.product_type || 'other';
    if (!productStats[productType]) {
      productStats[productType] = {
        name: productType,
        icon: '📝',
        period1Sales: 0,
        period1Profit: 0,
        period2Sales: 0,
        period2Profit: 0
      };
    }
    
    if (d.month === month1 && d.year === year1) {
      productStats[productType].period1Sales += parseFloat(d.retail_sales) || 0;
      productStats[productType].period1Sales += parseFloat(d.corporate_sales) || 0;
      productStats[productType].period1Profit += parseFloat(d.profit) || 0;
    }
    if (d.month === month2 && d.year === year2) {
      productStats[productType].period2Sales += parseFloat(d.retail_sales) || 0;
      productStats[productType].period2Sales += parseFloat(d.corporate_sales) || 0;
      productStats[productType].period2Profit += parseFloat(d.profit) || 0;
    }
  });
  
  // Build table rows
  const rows = Object.entries(productStats)
    .filter(([_, stats]) => stats.period1Sales > 0 || stats.period2Sales > 0)
    .map(([productId, stats]) => {
      grandTotal1Sales += stats.period1Sales;
      grandTotal1Profit += stats.period1Profit;
      grandTotal2Sales += stats.period2Sales;
      grandTotal2Profit += stats.period2Profit;
      
      const salesDiff = stats.period1Sales - stats.period2Sales;
      const profitDiff = stats.period1Profit - stats.period2Profit;
      const growth = stats.period2Sales > 0 
        ? ((stats.period1Sales - stats.period2Sales) / stats.period2Sales * 100) 
        : (stats.period1Sales > 0 ? 100 : 0);
      
      return `
        <tr>
          <td>${stats.icon} ${stats.name}</td>
          <td class="text-right">${formatCompactCurrency(stats.period1Sales)}</td>
          <td class="text-right">${formatCompactCurrency(stats.period1Profit)}</td>
          <td class="text-right">${formatCompactCurrency(stats.period2Sales)}</td>
          <td class="text-right">${formatCompactCurrency(stats.period2Profit)}</td>
          <td class="text-right ${salesDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${salesDiff >= 0 ? '+' : ''}${formatCompactCurrency(salesDiff)}</td>
          <td class="text-right ${profitDiff >= 0 ? 'growth-positive' : 'growth-negative'}">${profitDiff >= 0 ? '+' : ''}${formatCompactCurrency(profitDiff)}</td>
          <td class="text-right ${growth >= 0 ? 'growth-positive' : 'growth-negative'}">${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%</td>
        </tr>
      `;
    });
  
  if (rows.length === 0) {
    el('customComparisonBody').innerHTML = '<tr><td colspan="8" class="text-center">No data available for selected periods</td></tr>';
    el('customComparisonFooter').innerHTML = '';
  } else {
    // Calculate totals
    const totalSalesDiff = grandTotal1Sales - grandTotal2Sales;
    const totalProfitDiff = grandTotal1Profit - grandTotal2Profit;
    const totalGrowth = grandTotal2Sales > 0 
      ? ((grandTotal1Sales - grandTotal2Sales) / grandTotal2Sales * 100) 
      : (grandTotal1Sales > 0 ? 100 : 0);
    
    el('customComparisonBody').innerHTML = rows.join('');
    el('customComparisonFooter').innerHTML = `
      <tr>
        <td><strong>TOTAL</strong></td>
        <td class="text-right"><strong>${formatCompactCurrency(grandTotal1Sales)}</strong></td>
        <td class="text-right"><strong>${formatCompactCurrency(grandTotal1Profit)}</strong></td>
        <td class="text-right"><strong>${formatCompactCurrency(grandTotal2Sales)}</strong></td>
        <td class="text-right"><strong>${formatCompactCurrency(grandTotal2Profit)}</strong></td>
        <td class="text-right ${totalSalesDiff >= 0 ? 'growth-positive' : 'growth-negative'}"><strong>${totalSalesDiff >= 0 ? '+' : ''}${formatCompactCurrency(totalSalesDiff)}</strong></td>
        <td class="text-right ${totalProfitDiff >= 0 ? 'growth-positive' : 'growth-negative'}"><strong>${totalProfitDiff >= 0 ? '+' : ''}${formatCompactCurrency(totalProfitDiff)}</strong></td>
        <td class="text-right ${totalGrowth >= 0 ? 'growth-positive' : 'growth-negative'}"><strong>${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)}%</strong></td>
      </tr>
    `;
  }
  
  el('customComparisonResults').style.display = 'block';
  toast.success(`Comparing ${period1Label} vs ${period2Label}`);
}

/* === INITIALIZE COMPARISON TAB === */
function initComparisonTab() {
  // Update staff dropdown with users data
  const staffSelect = el('comparisonStaff');
  if (staffSelect && usersData.length > 0) {
    // Keep the "All Staff" option
    staffSelect.innerHTML = '<option value="all">All Staff</option>';
    usersData.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.name;
      opt.textContent = u.name;
      staffSelect.appendChild(opt);
    });
  }
  
  renderComparison();
}

/* === GET FILTERED DATA FOR PERIOD === */
function getDataForPeriod(year, months, staff, product) {
  return productivityData.filter(d => {
    if (d.year !== year) return false;
    if (!months.includes(d.month)) return false;
    if (staff !== 'all' && d.staff_name !== staff) return false;
    if (product !== 'all' && d.product_type !== product) return false;
    return true;
  });
}

/* === CALCULATE PERIOD TOTALS === */
function calculatePeriodTotals(data) {
  const totals = {
    retailSales: 0,
    retailProfit: 0,
    corporateSales: 0,
    corporateProfit: 0,
    totalSales: 0,
    totalProfit: 0,
    recordCount: data.length
  };
  
  data.forEach(d => {
    totals.retailSales += parseFloat(d.retail_sales) || 0;
    totals.retailProfit += parseFloat(d.retail_profit) || 0;
    totals.corporateSales += parseFloat(d.corporate_sales) || 0;
    totals.corporateProfit += parseFloat(d.corporate_profit) || 0;
  });
  
  totals.totalSales = totals.retailSales + totals.corporateSales;
  totals.totalProfit = totals.retailProfit + totals.corporateProfit;
  totals.margin = calculateMargin(totals.totalSales, totals.totalProfit);
  totals.retailMargin = calculateMargin(totals.retailSales, totals.retailProfit);
  totals.corporateMargin = calculateMargin(totals.corporateSales, totals.corporateProfit);
  
  return totals;
}

/* === CALCULATE CHANGE === */
function calculateChange(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/* === GET CHANGE CLASS === */
function getChangeClass(change) {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'neutral';
}

/* === GET CHANGE ICON === */
function getChangeIcon(change) {
  if (change > 0) return '↑';
  if (change < 0) return '↓';
  return '→';
}

/* === RENDER COMPARISON === */
function renderComparison() {
  const { period, year, staff, product } = comparisonState;
  const currentPeriodValue = getCurrentPeriodValue(period);
  
  // Get current and previous period data
  const currentMonths = getMonthsForPeriod(period, currentPeriodValue);
  const prev = getPreviousPeriod(period, currentPeriodValue, year);
  const previousMonths = getMonthsForPeriod(period, prev.value);
  
  const currentData = getDataForPeriod(year, currentMonths, staff, product);
  const previousData = getDataForPeriod(prev.year, previousMonths, staff, product);
  
  const currentTotals = calculatePeriodTotals(currentData);
  const previousTotals = calculatePeriodTotals(previousData);
  
  // Calculate changes
  const salesChange = calculateChange(currentTotals.totalSales, previousTotals.totalSales);
  const profitChange = calculateChange(currentTotals.totalProfit, previousTotals.totalProfit);
  const marginChange = currentTotals.margin - previousTotals.margin;
  
  // Render summary
  renderComparisonSummary(currentTotals, previousTotals, salesChange, profitChange, marginChange, period, currentPeriodValue, year, prev);
  
  // Render comparison cards
  renderComparisonCards(currentTotals, previousTotals, period, currentPeriodValue, year, prev);
  
  // Render charts
  renderComparisonCharts(period, year, staff, product);
  
  // Render detailed table
  renderComparisonTable(period, year, staff, product);
}

/* === RENDER COMPARISON SUMMARY === */
function renderComparisonSummary(currentTotals, previousTotals, salesChange, profitChange, marginChange, period, currentPeriodValue, year, prev) {
  const summaryGrid = el('summaryGrid');
  if (!summaryGrid) return;
  
  // Create descriptive label for month-yoy
  let periodLabel = getPeriodLabel(period, currentPeriodValue, year);
  let comparedToLabel = 'vs Previous Period';
  if (period === 'month-yoy') {
    comparedToLabel = `vs ${getMonthName(currentPeriodValue)} ${prev.year}`;
  }
  
  summaryGrid.innerHTML = `
    <div class="summary-item">
      <div class="label">Period</div>
      <div class="value">${periodLabel}</div>
    </div>
    <div class="summary-item">
      <div class="label">Total Sales</div>
      <div class="value">${formatCurrency(currentTotals.totalSales)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Sales Growth</div>
      <div class="value">
        <span class="change-indicator ${getChangeClass(salesChange)}">
          ${getChangeIcon(salesChange)} ${Math.abs(salesChange).toFixed(1)}%
        </span>
        <div style="font-size: 10px; color: var(--text-secondary);">${comparedToLabel}</div>
      </div>
    </div>
    <div class="summary-item">
      <div class="label">Total Profit</div>
      <div class="value">${formatCurrency(currentTotals.totalProfit)}</div>
    </div>
    <div class="summary-item">
      <div class="label">Profit Growth</div>
      <div class="value">
        <span class="change-indicator ${getChangeClass(profitChange)}">
          ${getChangeIcon(profitChange)} ${Math.abs(profitChange).toFixed(1)}%
        </span>
        <div style="font-size: 10px; color: var(--text-secondary);">${comparedToLabel}</div>
      </div>
    </div>
    <div class="summary-item">
      <div class="label">Avg Margin</div>
      <div class="value">
        <span class="profit-margin ${getMarginClass(currentTotals.margin, comparisonState.product !== 'all' ? comparisonState.product : null)}">${formatPercent(currentTotals.margin)}</span>
      </div>
    </div>
  `;
}

/* === RENDER COMPARISON CARDS === */
function renderComparisonCards(currentTotals, previousTotals, period, currentPeriodValue, year, prev) {
  const cardsContainer = el('comparisonCards');
  if (!cardsContainer) return;
  
  const metrics = [
    {
      title: '💰 Total Sales',
      current: currentTotals.totalSales,
      previous: previousTotals.totalSales,
      format: 'currency'
    },
    {
      title: '📈 Total Profit',
      current: currentTotals.totalProfit,
      previous: previousTotals.totalProfit,
      format: 'currency'
    },
    {
      title: '🏪 Retail Sales',
      current: currentTotals.retailSales,
      previous: previousTotals.retailSales,
      format: 'currency'
    },
    {
      title: '🏢 Corporate Sales',
      current: currentTotals.corporateSales,
      previous: previousTotals.corporateSales,
      format: 'currency'
    },
    {
      title: '📊 Retail Margin',
      current: currentTotals.retailMargin,
      previous: previousTotals.retailMargin,
      format: 'percent'
    },
    {
      title: '📊 Corporate Margin',
      current: currentTotals.corporateMargin,
      previous: previousTotals.corporateMargin,
      format: 'percent'
    }
  ];
  
  cardsContainer.innerHTML = metrics.map(m => {
    const change = m.format === 'percent' 
      ? m.current - m.previous 
      : calculateChange(m.current, m.previous);
    const changeClass = getChangeClass(change);
    const formattedCurrent = m.format === 'currency' ? formatCurrency(m.current) : formatPercent(m.current);
    const formattedPrevious = m.format === 'currency' ? formatCurrency(m.previous) : formatPercent(m.previous);
    const formattedChange = m.format === 'percent' 
      ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}pp`
      : `${getChangeIcon(change)} ${Math.abs(change).toFixed(1)}%`;
    
    return `
      <div class="comparison-card">
        <div class="comparison-card-header">
          <h4>${m.title}</h4>
        </div>
        <div class="comparison-card-body">
          <div class="comparison-row">
            <div class="comparison-item current">
              <div class="label">Current</div>
              <div class="value">${formattedCurrent}</div>
              <div class="sub-label">${getPeriodLabel(period, currentPeriodValue, year)}</div>
            </div>
            <div class="comparison-item previous">
              <div class="label">Previous</div>
              <div class="value">${formattedPrevious}</div>
              <div class="sub-label">${getPeriodLabel(period, prev.value, prev.year)}</div>
            </div>
            <div class="comparison-item change">
              <div class="label">Change</div>
              <div class="value ${change >= 0 ? 'positive' : 'negative'}">${formattedChange}</div>
              <div class="sub-label">${changeClass === 'up' ? 'Increase' : changeClass === 'down' ? 'Decrease' : 'No Change'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* === RENDER COMPARISON CHARTS === */
function renderComparisonCharts(period, year, staff, product) {
  // Destroy existing comparison charts
  if (charts.comparison) charts.comparison.destroy();
  if (charts.marginTrend) charts.marginTrend.destroy();
  
  const labels = [];
  const salesData = [];
  const profitData = [];
  const marginData = [];
  
  // Get data points based on period
  let periods = [];
  let yearsToCompare = [];
  
  switch (period) {
    case 'month':
      periods = Array.from({ length: 12 }, (_, i) => i + 1);
      labels.push(...periods.map(m => getMonthName(m)));
      break;
    case 'month-yoy':
      // For month vs month YoY, show selected month across multiple years
      const selectedMonth = comparisonState.compareMonth;
      yearsToCompare = [];
      for (let y = year; y >= year - 4; y--) {
        yearsToCompare.push(y);
      }
      yearsToCompare.reverse(); // Oldest to newest
      labels.push(...yearsToCompare.map(y => `${getMonthName(selectedMonth)} ${y}`));
      periods = yearsToCompare.map(() => selectedMonth);
      break;
    case 'quarter':
      periods = [1, 2, 3, 4];
      labels.push(...periods.map(q => `Q${q}`));
      break;
    case 'semester':
      periods = [1, 2];
      labels.push('H1', 'H2');
      break;
    case 'ytd':
      // For YTD, show monthly progression
      const currentMonth = getCurrentPeriodValue(period);
      periods = Array.from({ length: currentMonth }, (_, i) => i + 1);
      labels.push(...periods.map(m => getMonthName(m)));
      break;
  }
  
  // For month-yoy, use different chart structure
  if (period === 'month-yoy') {
    // Collect data for the same month across different years
    yearsToCompare.forEach(y => {
      const months = [comparisonState.compareMonth];
      const data = getDataForPeriod(y, months, staff, product);
      const totals = calculatePeriodTotals(data);
      salesData.push(totals.totalSales);
      profitData.push(totals.totalProfit);
      marginData.push(totals.margin);
    });
    
    // Sales Comparison Chart for month-yoy
    const ctxComparison = el('chartComparison')?.getContext('2d');
    if (ctxComparison) {
      charts.comparison = new Chart(ctxComparison, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: `${getMonthName(comparisonState.compareMonth)} Sales by Year`,
              data: salesData,
              backgroundColor: yearsToCompare.map((y, i) => 
                y === year ? 'rgba(59, 130, 246, 0.8)' : `rgba(156, 163, 175, ${0.3 + (i * 0.15)})`
              ),
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }
    
    // Margin Trend Chart for month-yoy
    const ctxMargin = el('chartMarginTrend')?.getContext('2d');
    if (ctxMargin) {
      charts.marginTrend = new Chart(ctxMargin, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: `${getMonthName(comparisonState.compareMonth)} Margin by Year`,
              data: marginData,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.4,
              pointBackgroundColor: yearsToCompare.map(y => y === year ? '#10b981' : '#9ca3af'),
              pointRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' }
          },
          scales: {
            y: { 
              beginAtZero: true,
              max: 100,
              title: {
                display: true,
                text: 'Margin %'
              }
            }
          }
        }
      });
    }
    return; // Exit early for month-yoy
  }
  
  // Current year data (for non month-yoy periods)
  periods.forEach(p => {
    const months = period === 'ytd' 
      ? [p] // For YTD, use individual months
      : getMonthsForPeriod(period, p);
    const data = getDataForPeriod(year, months, staff, product);
    const totals = calculatePeriodTotals(data);
    salesData.push(totals.totalSales);
    profitData.push(totals.totalProfit);
    marginData.push(totals.margin);
  });
  
  // Previous year data for comparison
  const prevYearSalesData = [];
  const prevYearProfitData = [];
  const prevYearMarginData = [];
  
  periods.forEach(p => {
    const months = period === 'ytd' 
      ? [p]
      : getMonthsForPeriod(period, p);
    const data = getDataForPeriod(year - 1, months, staff, product);
    const totals = calculatePeriodTotals(data);
    prevYearSalesData.push(totals.totalSales);
    prevYearProfitData.push(totals.totalProfit);
    prevYearMarginData.push(totals.margin);
  });
  
  // Sales Comparison Chart
  const ctxComparison = el('chartComparison')?.getContext('2d');
  if (ctxComparison) {
    charts.comparison = new Chart(ctxComparison, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: `${year} Sales`,
            data: salesData,
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderRadius: 6
          },
          {
            label: `${year - 1} Sales`,
            data: prevYearSalesData,
            backgroundColor: 'rgba(156, 163, 175, 0.5)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
  
  // Margin Trend Chart
  const ctxMargin = el('chartMarginTrend')?.getContext('2d');
  if (ctxMargin) {
    charts.marginTrend = new Chart(ctxMargin, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${year} Margin`,
            data: marginData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: `${year - 1} Margin`,
            data: prevYearMarginData,
            borderColor: '#9ca3af',
            backgroundColor: 'rgba(156, 163, 175, 0.1)',
            fill: true,
            tension: 0.4,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: { 
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: 'Margin %'
            }
          }
        }
      }
    });
  }
}

/* === RENDER COMPARISON TABLE === */
function renderComparisonTable(period, year, staff, product) {
  const thead = el('comparisonTableHead');
  const tbody = el('comparisonTableBody');
  if (!thead || !tbody) return;
  
  // Special handling for month-yoy
  if (period === 'month-yoy') {
    thead.innerHTML = `
      <tr>
        <th>Year</th>
        <th class="text-right">Retail Sales</th>
        <th class="text-right">Corp Sales</th>
        <th class="text-right">Total Sales</th>
        <th class="text-right">Total Profit</th>
        <th class="text-right">Margin</th>
        <th class="text-right">YoY Change</th>
      </tr>
    `;
    
    const selectedMonth = comparisonState.compareMonth;
    const monthName = getMonthName(selectedMonth);
    
    // Get 5 years of data for the selected month
    const yearsToShow = [];
    for (let y = year; y >= year - 4; y--) {
      yearsToShow.push(y);
    }
    
    tbody.innerHTML = yearsToShow.map((y, idx) => {
      const months = [selectedMonth];
      const currentData = getDataForPeriod(y, months, staff, product);
      const currentTotals = calculatePeriodTotals(currentData);
      
      // Calculate YoY change
      let yoyChange = 0;
      if (idx < yearsToShow.length - 1) {
        const prevYearData = getDataForPeriod(y - 1, months, staff, product);
        const prevYearTotals = calculatePeriodTotals(prevYearData);
        yoyChange = calculateChange(currentTotals.totalSales, prevYearTotals.totalSales);
      }
      
      return `
        <tr${y === year ? ' style="background: rgba(59, 130, 246, 0.08);"' : ''}>
          <td><strong>${monthName} ${y}</strong>${y === year ? ' <span style="color: #3b82f6; font-size: 11px;">(Current)</span>' : ''}</td>
          <td class="text-right">${formatCurrency(currentTotals.retailSales)}</td>
          <td class="text-right">${formatCurrency(currentTotals.corporateSales)}</td>
          <td class="text-right"><strong>${formatCurrency(currentTotals.totalSales)}</strong></td>
          <td class="text-right">${formatCurrency(currentTotals.totalProfit)}</td>
          <td class="text-right">
            <span class="profit-margin ${getMarginClass(currentTotals.margin, comparisonState.product !== 'all' ? comparisonState.product : null)}">${formatPercent(currentTotals.margin)}</span>
          </td>
          <td class="text-right">
            ${idx < yearsToShow.length - 1 ? `
              <span class="change-indicator ${getChangeClass(yoyChange)}">
                ${getChangeIcon(yoyChange)} ${Math.abs(yoyChange).toFixed(1)}%
              </span>
            ` : '<span style="color: var(--text-secondary);">—</span>'}
          </td>
        </tr>
      `;
    }).join('');
    return;
  }
  
  // Build header for other periods
  thead.innerHTML = `
    <tr>
      <th>Period</th>
      <th class="text-right">Retail Sales</th>
      <th class="text-right">Corp Sales</th>
      <th class="text-right">Total Sales</th>
      <th class="text-right">Total Profit</th>
      <th class="text-right">Margin</th>
      <th class="text-right">vs Prev Period</th>
      <th class="text-right">vs Last Year</th>
    </tr>
  `;
  
  // Get periods to display
  let periods = [];
  switch (period) {
    case 'month':
      periods = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: getMonthName(i + 1) }));
      break;
    case 'quarter':
      periods = [1, 2, 3, 4].map(q => ({ value: q, label: `Q${q}` }));
      break;
    case 'semester':
      periods = [1, 2].map(s => ({ value: s, label: s === 1 ? 'H1' : 'H2' }));
      break;
    case 'ytd':
      // Show single YTD row with cumulative data
      periods = [{ value: getCurrentPeriodValue(period), label: `YTD (Jan-${getMonthName(getCurrentPeriodValue(period))})` }];
      break;
  }
  
  tbody.innerHTML = periods.map((p, idx) => {
    const months = getMonthsForPeriod(period, p.value);
    const currentData = getDataForPeriod(year, months, staff, product);
    const currentTotals = calculatePeriodTotals(currentData);
    
    // Previous period calculation
    let prevPeriodChange = 0;
    if (idx > 0 || period === 'ytd') {
      const prev = period === 'ytd' 
        ? getPreviousPeriod(period, p.value, year)
        : { value: periods[idx - 1]?.value, year };
      if (prev.value) {
        const prevMonths = getMonthsForPeriod(period, prev.value);
        const prevData = getDataForPeriod(prev.year || year, prevMonths, staff, product);
        const prevTotals = calculatePeriodTotals(prevData);
        prevPeriodChange = calculateChange(currentTotals.totalSales, prevTotals.totalSales);
      }
    }
    
    // Last year comparison
    const lastYearMonths = getMonthsForPeriod(period, p.value);
    const lastYearData = getDataForPeriod(year - 1, lastYearMonths, staff, product);
    const lastYearTotals = calculatePeriodTotals(lastYearData);
    const yearOverYearChange = calculateChange(currentTotals.totalSales, lastYearTotals.totalSales);
    
    return `
      <tr>
        <td><strong>${p.label} ${year}</strong></td>
        <td class="text-right">${formatCurrency(currentTotals.retailSales)}</td>
        <td class="text-right">${formatCurrency(currentTotals.corporateSales)}</td>
        <td class="text-right"><strong>${formatCurrency(currentTotals.totalSales)}</strong></td>
        <td class="text-right">${formatCurrency(currentTotals.totalProfit)}</td>
        <td class="text-right">
          <span class="profit-margin ${getMarginClass(currentTotals.margin, comparisonState.product !== 'all' ? comparisonState.product : null)}">${formatPercent(currentTotals.margin)}</span>
        </td>
        <td class="text-right">
          ${idx > 0 || period === 'ytd' ? `
            <span class="change-indicator ${getChangeClass(prevPeriodChange)}">
              ${getChangeIcon(prevPeriodChange)} ${Math.abs(prevPeriodChange).toFixed(1)}%
            </span>
          ` : '<span style="color: var(--text-secondary);">—</span>'}
        </td>
        <td class="text-right">
          <span class="change-indicator ${getChangeClass(yearOverYearChange)}">
            ${getChangeIcon(yearOverYearChange)} ${Math.abs(yearOverYearChange).toFixed(1)}%
          </span>
        </td>
      </tr>
    `;
  }).join('');
}
