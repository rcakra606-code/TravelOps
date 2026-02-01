/* =========================================================
   OUTSTANDING DASHBOARD SCRIPT
   CRUD for Outstanding Invoice Records
   ========================================================= */

/* === GLOBAL HELPERS === */
const el = id => document.getElementById(id);

/* === DISPLAY USER INFO === */
(() => {
  const user = window.getUser();
  el('userName').textContent = user.name || user.username || '—';
  el('userRole').textContent = { admin: 'Administrator', semiadmin: 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';
})();

/* === DATA STORAGE === */
let outstandingData = [];
let usersData = [];
let filterState = {
  search: '',
  dateFrom: '',
  dateTo: ''
};

// Pagination state
let currentPage = 1;
const pageSize = 25;

/* === FILTER MANAGEMENT === */
function openOutstandingFilterModal() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  
  window.openModal({
    title: '🔍 Filter Outstanding Records',
    size: 'medium',
    bodyHtml: `
      <div class="filter-modal-content">
        <!-- Quick Filters -->
        <div class="quick-filters">
          <button type="button" class="quick-filter-chip ${!filterState.dateFrom && !filterState.dateTo ? 'active' : ''}" data-quick-filter="all">
            📊 All Records
          </button>
          <button type="button" class="quick-filter-chip" data-quick-filter="this-month">
            📅 This Month
          </button>
          <button type="button" class="quick-filter-chip" data-quick-filter="last-month">
            📆 Last Month
          </button>
        </div>
        
        <div class="filter-section">
          <div class="filter-section-title">Date Range Filter</div>
          <div class="filter-grid">
            <div class="filter-group">
              <label><span class="icon">📅</span> From Date</label>
              <input type="date" name="dateFrom" value="${filterState.dateFrom || ''}">
            </div>
            <div class="filter-group">
              <label><span class="icon">📅</span> To Date</label>
              <input type="date" name="dateTo" value="${filterState.dateTo || ''}">
            </div>
          </div>
        </div>
        
        <div class="filter-footer">
          <div class="filter-footer-left">
            <button type="button" class="btn-reset-filter" data-reset-outstanding-filters>
              🔄 Reset Filters
            </button>
          </div>
          <div class="filter-footer-right">
            <button type="submit" class="btn-apply-filter">
              ✓ Apply Filters
            </button>
          </div>
        </div>
      </div>
    `,
    context: { entity: 'outstanding', action: 'filter' }
  });
  
  // Setup quick filter clicks
  setTimeout(() => {
    document.querySelectorAll('[data-quick-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.quickFilter;
        const dateFromInput = document.querySelector('input[name="dateFrom"]');
        const dateToInput = document.querySelector('input[name="dateTo"]');
        const now = new Date();
        
        document.querySelectorAll('[data-quick-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (action === 'all') {
          dateFromInput.value = '';
          dateToInput.value = '';
        } else if (action === 'this-month') {
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          dateFromInput.value = firstDay.toISOString().split('T')[0];
          dateToInput.value = lastDay.toISOString().split('T')[0];
        } else if (action === 'last-month') {
          const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
          dateFromInput.value = firstDay.toISOString().split('T')[0];
          dateToInput.value = lastDay.toISOString().split('T')[0];
        }
      });
    });
  }, 100);
}

function resetOutstandingFilters() {
  filterState = {
    search: '',
    dateFrom: '',
    dateTo: ''
  };
  el('searchOutstanding').value = '';
  if (window.closeModal) window.closeModal();
  renderTable();
  updateSummary();
}

function applyOutstandingFilters(formData) {
  filterState.dateFrom = formData.dateFrom || '';
  filterState.dateTo = formData.dateTo || '';
  if (window.closeModal) window.closeModal();
  renderTable();
  updateSummary();
}

/* === LOAD DATA === */
async function loadOutstandingData() {
  try {
    outstandingData = await window.fetchJson('/api/outstanding') || [];
    renderTable();
    updateSummary();
  } catch (err) {
    console.error('Failed to load outstanding data:', err);
    window.toast?.error('Failed to load outstanding data');
  }
}

/* === UPDATE SUMMARY === */
function updateSummary() {
  const filtered = getFilteredData();
  
  const totalRecords = filtered.length;
  const totalInvoice = filtered.reduce((sum, r) => sum + (parseFloat(r.nominal_invoice) || 0), 0);
  const totalFirstPayment = filtered.reduce((sum, r) => sum + (parseFloat(r.pembayaran_pertama) || 0), 0);
  const totalDiscount = filtered.reduce((sum, r) => sum + (parseFloat(r.pembayaran_kedua) || 0), 0);
  
  el('totalRecords').textContent = totalRecords.toLocaleString('id-ID');
  el('totalInvoice').textContent = window.formatCurrency ? window.formatCurrency(totalInvoice) : `Rp ${totalInvoice.toLocaleString('id-ID')}`;
  el('totalFirstPayment').textContent = window.formatCurrency ? window.formatCurrency(totalFirstPayment) : `Rp ${totalFirstPayment.toLocaleString('id-ID')}`;
  el('totalDiscount').textContent = window.formatCurrency ? window.formatCurrency(totalDiscount) : `Rp ${totalDiscount.toLocaleString('id-ID')}`;
}

/* === GET FILTERED DATA === */
function getFilteredData() {
  let filtered = [...outstandingData];
  
  // Search filter
  if (filterState.search) {
    const search = filterState.search.toLowerCase();
    filtered = filtered.filter(r => 
      (r.nomor_invoice || '').toLowerCase().includes(search) ||
      (r.unique_code || '').toLowerCase().includes(search)
    );
  }
  
  // Date filters
  if (filterState.dateFrom) {
    filtered = filtered.filter(r => r.created_at >= filterState.dateFrom);
  }
  if (filterState.dateTo) {
    filtered = filtered.filter(r => r.created_at <= filterState.dateTo + 'T23:59:59');
  }
  
  return filtered;
}

/* === RENDER TABLE === */
function renderTable() {
  const tbody = el('outstandingTableBody');
  if (!tbody) return;
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      editOutstanding(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      deleteOutstanding(id);
    }
  };
  
  const filtered = getFilteredData();
  
  // Apply pagination
  const paginated = window.paginationUtils.paginate(filtered, currentPage, pageSize);
  
  if (paginated.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No outstanding records found</td></tr>';
    // Still render pagination to show total
    window.paginationUtils.renderPaginationControls('paginationControls', paginated, (page) => {
      currentPage = page;
      renderTable();
    });
    return;
  }
  
  tbody.innerHTML = paginated.data.map(item => {
    const invoice = parseFloat(item.nominal_invoice) || 0;
    const firstPayment = parseFloat(item.pembayaran_pertama) || 0;
    const discount = parseFloat(item.pembayaran_kedua) || 0;
    const outstanding = invoice - firstPayment - discount;
    
    return `
    <tr class="table-row">
      <td><strong>${item.nomor_invoice || '—'}</strong></td>
      <td class="text-right">Rp ${invoice.toLocaleString('id-ID')}</td>
      <td class="text-right">Rp ${firstPayment.toLocaleString('id-ID')}</td>
      <td class="text-right">Rp ${discount.toLocaleString('id-ID')}</td>
      <td><code>${item.unique_code || '—'}</code></td>
      <td>${item.staff_name || '—'}</td>
      <td class="text-right"><strong class="${outstanding > 0 ? 'text-danger' : 'text-success'}">Rp ${outstanding.toLocaleString('id-ID')}</strong></td>
      <td class="actions">
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        ${window.getUser().type === 'admin' ? `<button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>` : ''}
        ${window.getUser().type === 'admin' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `}).join('');
  
  // Render pagination controls
  window.paginationUtils.renderPaginationControls('paginationControls', paginated, (page) => {
    currentPage = page;
    renderTable();
  });
}

/* === CRUD OPERATIONS === */
function addOutstanding() {
  const user = window.getUser();
  if (user.type !== 'admin') {
    window.toast?.error('Access denied: Only admin can add records');
    return;
  }
  
  window.CRUDModal.create('Add Outstanding Record', [
    { type: 'text', name: 'nomor_invoice', label: 'Nomor Invoice', required: true, icon: '📋', placeholder: 'INV-001' },
    { type: 'currency', name: 'nominal_invoice', label: 'Nominal Invoice', required: true, currency: 'Rp', min: 0 },
    { type: 'currency', name: 'pembayaran_pertama', label: 'Pembayaran Pertama', required: false, currency: 'Rp', min: 0 },
    { type: 'currency', name: 'pembayaran_kedua', label: 'Discount (Pembayaran Kedua)', required: false, currency: 'Rp', min: 0 },
    { type: 'text', name: 'unique_code', label: 'Unique Code', required: false, icon: '🔖', placeholder: 'UC-001' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) }
  ], async (formData) => {
    // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
    ['nominal_invoice', 'pembayaran_pertama', 'pembayaran_kedua'].forEach(field => {
      if (formData[field]) formData[field] = window.parseFormattedNumber(formData[field]);
    });
    
    await window.fetchJson('/api/outstanding', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(formData) 
    });
    window.toast?.success('Outstanding record added successfully');
    await loadOutstandingData();
  }, {
    entity: 'outstanding',
    validation: { 
      nomor_invoice: { required: true }, 
      nominal_invoice: { required: true } 
    }
  });
}

function editOutstanding(id) {
  const user = window.getUser();
  if (user.type !== 'admin') {
    window.toast?.error('Access denied: Only admin can edit records');
    return;
  }
  
  const item = outstandingData.find(r => r.id === id);
  if (!item) return;
  
  window.CRUDModal.edit('Edit Outstanding Record', [
    { type: 'text', name: 'nomor_invoice', label: 'Nomor Invoice', required: true, icon: '📋' },
    { type: 'currency', name: 'nominal_invoice', label: 'Nominal Invoice', required: true, currency: 'Rp', min: 0 },
    { type: 'currency', name: 'pembayaran_pertama', label: 'Pembayaran Pertama', required: false, currency: 'Rp', min: 0 },
    { type: 'currency', name: 'pembayaran_kedua', label: 'Discount (Pembayaran Kedua)', required: false, currency: 'Rp', min: 0 },
    { type: 'text', name: 'unique_code', label: 'Unique Code', required: false, icon: '🔖' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) }
  ], item, async (formData) => {
    // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
    ['nominal_invoice', 'pembayaran_pertama', 'pembayaran_kedua'].forEach(field => {
      if (formData[field]) formData[field] = window.parseFormattedNumber(formData[field]);
    });
    
    await window.fetchJson(`/api/outstanding/${item.id}`, { 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData) 
    });
    window.toast?.success('Outstanding record updated successfully');
    await loadOutstandingData();
  }, {
    entity: 'outstanding',
    validation: { 
      nomor_invoice: { required: true }, 
      nominal_invoice: { required: true } 
    }
  });
}

function deleteOutstanding(id) {
  const user = window.getUser();
  if (user.type !== 'admin') {
    window.toast?.error('Access denied: Only admin can delete records');
    return;
  }
  
  const item = outstandingData.find(r => r.id === id);
  if (!item) return;
  
  window.CRUDModal.delete('Outstanding Record', `Invoice ${item.nomor_invoice}`, async () => {
    await window.fetchJson(`/api/outstanding/${id}`, { method: 'DELETE' });
    window.toast?.success('Outstanding record deleted successfully');
    await loadOutstandingData();
  });
}

/* === EXPORT / IMPORT / TEMPLATE === */
function downloadTemplate() {
  const headers = ['nomor_invoice', 'nominal_invoice', 'pembayaran_pertama', 'pembayaran_kedua', 'unique_code'];
  const csvContent = headers.join(',') + '\n' + 'INV-001,1000000,500000,50000,UC-001\n';
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'outstanding_template.csv';
  link.click();
  window.toast?.success('Template downloaded successfully');
}

function exportToCSV() {
  if (outstandingData.length === 0) {
    window.toast?.warning('No data to export');
    return;
  }
  
  const headers = ['nomor_invoice', 'nominal_invoice', 'pembayaran_pertama', 'pembayaran_kedua', 'unique_code'];
  const rows = outstandingData.map(item => 
    headers.map(h => {
      const val = item[h] || '';
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
    }).join(',')
  );
  
  const csvContent = headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `outstanding_export_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  window.toast?.success('Data exported successfully');
}

async function importFromCSV(file) {
  const user = window.getUser();
  if (user.type !== 'admin') {
    window.toast?.error('Access denied: Only admin can import data');
    return;
  }
  
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    window.toast?.error('CSV file is empty or invalid');
    return;
  }
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const requiredHeaders = ['nomor_invoice', 'nominal_invoice'];
  
  // Validate headers
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      window.toast?.error(`Missing required column: ${required}`);
      return;
    }
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
      const record = {};
      
      headers.forEach((header, idx) => {
        record[header] = values[idx] || '';
      });
      
      // Parse numeric fields
      record.nominal_invoice = parseFloat(record.nominal_invoice) || 0;
      record.pembayaran_pertama = parseFloat(record.pembayaran_pertama) || 0;
      record.pembayaran_kedua = parseFloat(record.pembayaran_kedua) || 0;
      
      await window.fetchJson('/api/outstanding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      successCount++;
    } catch (err) {
      console.error('Import error on row', i, err);
      errorCount++;
    }
  }
  
  window.toast?.success(`Import complete: ${successCount} records added, ${errorCount} errors`);
  await loadOutstandingData();
}

/* === QUICK VIEW === */
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = outstandingData.find(r => r.id == id);
    if (item) {
      const invoice = parseFloat(item.nominal_invoice) || 0;
      const firstPayment = parseFloat(item.pembayaran_pertama) || 0;
      const discount = parseFloat(item.pembayaran_kedua) || 0;
      const outstanding = invoice - firstPayment - discount;
      
      window.quickView.show({
        title: `Invoice: ${item.nomor_invoice}`,
        sections: [
          {
            title: 'Invoice Details',
            fields: [
              { label: 'Nomor Invoice', value: item.nomor_invoice },
              { label: 'Nominal Invoice', value: `Rp ${invoice.toLocaleString('id-ID')}` },
              { label: 'Pembayaran Pertama', value: `Rp ${firstPayment.toLocaleString('id-ID')}` },
              { label: 'Discount', value: `Rp ${discount.toLocaleString('id-ID')}` },
              { label: 'Unique Code', value: item.unique_code || '-' },
              { label: 'Outstanding', value: `Rp ${outstanding.toLocaleString('id-ID')}`, highlight: outstanding > 0 }
            ]
          }
        ]
      });
    }
  }
});

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', async () => {
  const user = window.getUser();
  
  // Hide Add button for non-admin users
  if (user.type !== 'admin' && el('addOutstandingBtn')) {
    el('addOutstandingBtn').style.display = 'none';
    el('importOutstandingBtn').style.display = 'none';
  }
  
  // Set up buttons
  el('addOutstandingBtn')?.addEventListener('click', addOutstanding);
  el('outstandingFilterBtn')?.addEventListener('click', openOutstandingFilterModal);
  el('downloadOutstandingTemplateBtn')?.addEventListener('click', downloadTemplate);
  el('exportOutstandingBtn')?.addEventListener('click', exportToCSV);
  el('importOutstandingBtn')?.addEventListener('click', () => el('importOutstandingFileInput')?.click());
  el('importOutstandingFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      importFromCSV(file);
      e.target.value = '';
    }
  });
  
  // Search handler
  el('searchOutstanding')?.addEventListener('input', (e) => {
    filterState.search = e.target.value;
    renderTable();
    updateSummary();
  });
  
  // Handle modal submissions for filters
  document.addEventListener('modalSubmit', (e) => {
    const { data, context } = e.detail;
    if (context?.entity === 'outstanding' && context?.action === 'filter') {
      e.preventDefault();
      applyOutstandingFilters(data);
    }
  });
  
  // Handle filter reset
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-reset-outstanding-filters]')) {
      resetOutstandingFilters();
    }
  });
  
  // Load users for staff dropdown (skip for basic users)
  // Note: 'user' is already declared at the top of the DOMContentLoaded listener
  if (user.type === 'basic') {
    usersData = [{ name: user.name || user.username }];
  } else {
    try {
      usersData = await window.fetchJson('/api/users') || [];
    } catch (err) {
      console.warn('Could not load users:', err.message);
      usersData = [{ name: user.name || user.username }];
    }
  }
  
  // Load data
  await loadOutstandingData();
  
  // Dark mode is handled by theme-toggle.js - no duplicate handler needed here
});
