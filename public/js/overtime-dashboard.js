// Wait for auth-common.js and dashboard.js to load
await new Promise(resolve => {
  const checkReady = () => {
    if (window.getUser && window.fetchJson && window.openModal && window.toast && window.dateUtils) {
      resolve();
    } else {
      setTimeout(checkReady, 50);
    }
  };
  checkReady();
});

const getUser = window.getUser;
const fetchJson = window.fetchJson;

const el = id => document.getElementById(id);
let overtimeData = [];
let staffList = [];
const user = getUser();

// State management
let currentPage = 1;
let pageSize = 25;
let sortField = 'event_date';
let sortDirection = 'desc';
let filters = {
  search: '',
  status: 'all',
  startDate: '',
  endDate: ''
};

// Display user info
el('userName').textContent = user.name || user.username || '—';
el('userRole').textContent = { admin: 'Administrator', 'semi-admin': 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';

async function loadStaff() {
  try {
    const users = await fetchJson('/api/users');
    staffList = users || [];
  } catch (err) {
    console.error('Failed to load staff:', err);
  }
}

async function loadOvertime() {
  try {
    loadingUtils.showTableLoader('overtimeTableBody', 7);
    const data = await fetchJson('/api/overtime');
    overtimeData = data || [];
    applyFiltersAndRender();
  } catch (err) {
    console.error('Failed to load overtime:', err);
    toast.error('Failed to load overtime data');
    loadingUtils.hideTableLoader('overtimeTableBody', 'Failed to load data');
  }
}

function updateMetrics() {
  const total = overtimeData.length;
  const pending = overtimeData.filter(o => o.status === 'pending').length;
  const paid = overtimeData.filter(o => o.status === 'paid').length;
  
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const totalHours = overtimeData.filter(o => {
    if (!o.event_date) return false;
    const d = new Date(o.event_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((sum, o) => sum + (parseFloat(o.hours) || 0), 0);
  
  el('totalOvertime').textContent = total;
  el('pendingCount').textContent = pending;
  el('paidCount').textContent = paid;
  el('totalHours').textContent = totalHours.toFixed(1);
}

function getFilteredData() {
  let filtered = [...overtimeData];

  // Apply search
  if (filters.search) {
    filtered = filterUtils.search(filtered, filters.search, ['staff_name', 'event_name', 'remarks']);
  }

  // Apply status filter
  if (filters.status !== 'all') {
    filtered = filterUtils.byField(filtered, 'status', filters.status);
  }

  // Apply date range filter
  if (filters.startDate || filters.endDate) {
    filtered = filterUtils.dateRange(filtered, 'event_date', filters.startDate, filters.endDate);
  }

  // Apply sorting
  filtered = sortUtils.sort(filtered, sortField, sortDirection);

  return filtered;
}

function applyFiltersAndRender() {
  const filtered = getFilteredData();
  const paginated = paginationUtils.paginate(filtered, currentPage, pageSize);
  
  renderTable(paginated.data);
  updateMetrics();
  paginationUtils.renderPaginationControls('paginationControls', paginated, (page) => {
    currentPage = page;
    applyFiltersAndRender();
  });
}

function renderTable(data) {
  const tbody = el('overtimeTableBody');
  if (!tbody) return;
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      editOvertime(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      deleteOvertime(id);
    }
  };
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-secondary);">No records found</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(item => {
    const statusColors = {
      pending: 'background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;',
      paid: 'background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;',
      cancel: 'background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;'
    };
    const statusBadge = `<span style="${statusColors[item.status] || statusColors.pending}">${item.status || 'pending'}</span>`;
    
    const actions = user.type === 'admin' 
      ? `<button class="btn-edit" data-id="${item.id}">✏️</button>
         <button class="btn-delete" data-id="${item.id}">🗑️</button>`
      : '';
    
    return `
      <tr>
        <td>${dateUtils.format(item.event_date)}</td>
        <td>${item.staff_name || '—'}</td>
        <td>${item.event_name || '—'}</td>
        <td>${item.hours || 0} hrs</td>
        <td>${statusBadge}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.remarks || '—'}</td>
        <td style="${user.type === 'basic' ? 'display:none' : ''}">${actions}</td>
      </tr>
    `;
  }).join('');
}

async function editOvertime(id) {
  const item = overtimeData.find(o => o.id === id);
  if (!item) return;
  
  window.openModal({
    title: 'Edit Overtime',
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required>
            ${staffList.map(s => `<option value="${s.name}" ${s.name === item.staff_name ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Event Name *</label>
          <input type="text" name="event_name" value="${item.event_name || ''}" required>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" name="event_date" value="${item.event_date || ''}" required>
        </div>
        <div class="form-group">
          <label>Hours *</label>
          <input type="number" name="hours" value="${item.hours || ''}" step="0.5" min="0" required>
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="status" required>
            <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="paid" ${item.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="cancel" ${item.status === 'cancel' ? 'selected' : ''}>Cancel</option>
          </select>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Remarks</label>
          <textarea name="remarks" rows="3">${item.remarks || ''}</textarea>
        </div>
      </div>
    `,
    context: { entity: 'overtime', action: 'edit', id: item.id }
  });
};

async function deleteOvertime(id) {
  const confirmed = await confirmDialog.delete('this overtime record');
  if (!confirmed) return;
  
  try {
    await fetchJson(`/api/overtime/${id}`, { method: 'DELETE' });
    toast.success('Overtime deleted successfully');
    await loadOvertime();
  } catch (err) {
    console.error('Delete failed:', err);
    toast.error('Failed to delete overtime: ' + err.message);
  }
};

el('addOvertimeBtn').addEventListener('click', () => {
  window.openModal({
    title: 'Add Overtime',
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required id="staffSelect">
            <option value="">Select staff</option>
            ${staffList.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Event Name *</label>
          <input type="text" name="event_name" placeholder="e.g., Weekend tour support" required>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" name="event_date" required>
        </div>
        <div class="form-group">
          <label>Hours *</label>
          <input type="number" name="hours" step="0.5" min="0" placeholder="e.g., 4.5" required>
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="status" required>
            <option value="pending" selected>Pending</option>
            <option value="paid">Paid</option>
            <option value="cancel">Cancel</option>
          </select>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Remarks</label>
          <textarea name="remarks" rows="3" placeholder="Additional notes"></textarea>
        </div>
      </div>
    `,
    context: { entity: 'overtime', action: 'create' }
  });
  
  setTimeout(() => {
    if (user.type === 'basic') {
      const select = document.getElementById('staffSelect');
      if (select) {
        select.value = user.name;
        select.disabled = true;
      }
    }
  }, 100);
});

// Handle modal form submissions
document.addEventListener('modalSubmit', async (e) => {
  const { data, context } = e.detail;
  if (context.entity !== 'overtime') return;
  
  e.preventDefault();
  
  try {
    if (context.action === 'create') {
      await fetchJson('/api/overtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast.success('Overtime added successfully');
    } else if (context.action === 'edit' && context.id) {
      await fetchJson(`/api/overtime/${context.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast.success('Overtime updated successfully');
    }
    
    await loadOvertime();
  } catch (err) {
    console.error('Overtime submission failed:', err);
    toast.error('Operation failed: ' + err.message);
    throw err;
  }
});

// Search and filter handlers
el('searchInput').addEventListener('input', (e) => {
  filters.search = e.target.value;
  currentPage = 1;
  applyFiltersAndRender();
});

el('statusFilter').addEventListener('change', (e) => {
  filters.status = e.target.value;
  currentPage = 1;
  applyFiltersAndRender();
});

el('startDateFilter').addEventListener('change', (e) => {
  filters.startDate = e.target.value;
  currentPage = 1;
  applyFiltersAndRender();
});

el('endDateFilter').addEventListener('change', (e) => {
  filters.endDate = e.target.value;
  currentPage = 1;
  applyFiltersAndRender();
});

el('clearFilters').addEventListener('click', () => {
  filters = { search: '', status: 'all', startDate: '', endDate: '' };
  el('searchInput').value = '';
  el('statusFilter').value = 'all';
  el('startDateFilter').value = '';
  el('endDateFilter').value = '';
  currentPage = 1;
  applyFiltersAndRender();
  toast.info('Filters cleared');
});

// Export handler
el('exportBtn').addEventListener('click', () => {
  const filtered = getFilteredData();
  exportUtils.toCSV(filtered, 'overtime_records', [
    { key: 'event_date', label: 'Date' },
    { key: 'staff_name', label: 'Staff Name' },
    { key: 'event_name', label: 'Event Name' },
    { key: 'hours', label: 'Hours' },
    { key: 'status', label: 'Status' },
    { key: 'remarks', label: 'Remarks' }
  ]);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Esc to close modal
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal');
    if (modal && modal.classList.contains('active')) {
      document.getElementById('modalClose')?.click();
    }
  }
  
  // Ctrl+S to save form (if modal is open)
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    const modal = document.getElementById('modal');
    if (modal && modal.classList.contains('active')) {
      document.getElementById('modalSave')?.click();
    }
  }
});

// Add sortable headers
sortUtils.addSortableHeaders('overtimeTable', 
  ['event_date', 'staff_name', 'event_name', 'hours', 'status'],
  (field, direction) => {
    sortField = field;
    sortDirection = direction;
    applyFiltersAndRender();
  }
);

// Initialize
await loadStaff();
await loadOvertime();
