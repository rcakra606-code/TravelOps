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
    const statusBadgeClass = {
      pending: 'status-badge status-pending',
      paid: 'status-badge status-paid',
      cancel: 'status-badge status-cancel'
    };
    const statusBadge = `<span class="${statusBadgeClass[item.status] || statusBadgeClass.pending}">
      <span class="status-dot"></span>${item.status || 'pending'}
    </span>`;
    
    const actions = user.type === 'admin' 
      ? `<div class="quick-actions">
         <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
         <button class="btn-edit" data-id="${item.id}" title="Edit">✏️</button>
         <button class="btn-delete" data-id="${item.id}" title="Delete">🗑️</button></div>`
      : `<div class="quick-actions">
         <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button></div>`;
    
    return `
      <tr class="fade-in">
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
  
  window.CRUDModal.edit('Edit Overtime', [
    {
      type: 'select',
      name: 'staff_name',
      label: 'Staff',
      required: true,
      options: staffList.map(s => ({ value: s.name, label: s.name }))
    },
    {
      type: 'text',
      name: 'event_name',
      label: 'Event Name',
      required: true,
      icon: '📅',
      placeholder: 'e.g., Weekend tour support'
    },
    {
      type: 'date',
      name: 'event_date',
      label: 'Date',
      required: true,
      
    },
    {
      type: 'number',
      name: 'hours',
      label: 'Hours',
      required: true,
      min: 0,
      step: 0.5,
      placeholder: 'e.g., 4.5'
    },
    {
      type: 'select',
      name: 'status',
      label: 'Status',
      required: true,
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'paid', label: 'Paid' },
        { value: 'cancel', label: 'Cancelled' }
      ]
    },
    {
      type: 'textarea',
      name: 'remarks',
      label: 'Remarks',
      fullWidth: true,
      rows: 3,
      maxlength: 500,
      placeholder: 'Additional notes'
    }
  ], item, async (formData) => {
    await fetchJson(`/api/overtime/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify(formData)
    });
    toast.success('Overtime updated successfully');
    await loadOvertime();
  }, {
    entity: 'overtime',
    autoSave: true,
    validation: {
      staff_name: { required: true },
      event_name: { required: true, minLength: 3 },
      event_date: { required: true },
      hours: { required: true, min: 0.5 },
      status: { required: true }
    }
  });
};

async function deleteOvertime(id) {
  const item = overtimeData.find(o => o.id === id);
  if (!item) return;
  
  window.CRUDModal.delete('Overtime', item.event_name, async () => {
    await fetchJson(`/api/overtime/${id}`, { method: 'DELETE' });
    toast.success('Overtime deleted successfully');
    await loadOvertime();
  });
};

el('addOvertimeBtn').addEventListener('click', () => {
  window.CRUDModal.create('Add Overtime', [
    {
      type: 'select',
      name: 'staff_name',
      label: 'Staff',
      required: true,
      defaultValue: user.type === 'basic' ? user.name : '',
      readonly: user.type === 'basic',
      options: staffList.map(s => ({ value: s.name, label: s.name }))
    },
    {
      type: 'text',
      name: 'event_name',
      label: 'Event Name',
      required: true,
      icon: '📅',
      placeholder: 'e.g., Weekend tour support'
    },
    {
      type: 'date',
      name: 'event_date',
      label: 'Date',
      required: true,
      
    },
    {
      type: 'number',
      name: 'hours',
      label: 'Hours',
      required: true,
      min: 0,
      step: 0.5,
      placeholder: 'e.g., 4.5'
    },
    {
      type: 'select',
      name: 'status',
      label: 'Status',
      required: true,
      defaultValue: 'pending',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'paid', label: 'Paid' },
        { value: 'cancel', label: 'Cancelled' }
      ]
    },
    {
      type: 'textarea',
      name: 'remarks',
      label: 'Remarks',
      fullWidth: true,
      rows: 3,
      maxlength: 500,
      placeholder: 'Additional notes'
    }
  ], async (formData) => {
    await fetchJson('/api/overtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    toast.success('Overtime added successfully');
    await loadOvertime();
  }, {
    entity: 'overtime',
    autoSave: true,
    validation: {
      staff_name: { required: true },
      event_name: { required: true, minLength: 3 },
      event_date: { required: true },
      hours: { required: true, min: 0.5 },
      status: { required: true }
    }
  });
});

// Search and filter handlers
const debouncedSearch = performanceUtils.debounce((value) => {
  filters.search = value;
  currentPage = 1;
  applyFiltersAndRender();
}, 300);

el('searchInput').addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
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

// Import handler
el('importBtn')?.addEventListener('click', () => {
  el('importFileInput').click();
});

el('importFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      toast.error('CSV file is empty or has no data rows');
      return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const imported = [];
    const errors = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      
      // Map common header names to our field names
      const mapped = {
        staff_name: row['staff name'] || row['staff_name'] || row['staff'] || '',
        event_date: row['date'] || row['event_date'] || row['date (yyyy-mm-dd)'] || '',
        event_name: row['event name'] || row['event_name'] || row['event'] || row['reason'] || '',
        start_time: row['start time'] || row['start_time'] || row['start time (hh:mm)'] || '',
        end_time: row['end time'] || row['end_time'] || row['end time (hh:mm)'] || '',
        hours: row['hours'] || '',
        status: row['status'] || 'pending',
        remarks: row['remarks'] || row['notes'] || ''
      };
      
      // Validate required fields
      if (!mapped.staff_name || !mapped.event_date) {
        errors.push(`Row ${i + 1}: Staff name and date are required`);
        continue;
      }
      
      // Calculate hours if not provided
      if (!mapped.hours && mapped.start_time && mapped.end_time) {
        const start = mapped.start_time.split(':').map(Number);
        const end = mapped.end_time.split(':').map(Number);
        if (start.length === 2 && end.length === 2) {
          const startMinutes = start[0] * 60 + start[1];
          const endMinutes = end[0] * 60 + end[1];
          mapped.hours = ((endMinutes - startMinutes) / 60).toFixed(1);
        }
      }
      
      imported.push(mapped);
    }
    
    if (errors.length > 0) {
      toast.warning(`${errors.length} rows had errors. Importing valid rows...`);
      console.warn('Import errors:', errors);
    }
    
    if (imported.length === 0) {
      toast.error('No valid data to import');
      return;
    }
    
    // Confirm import
    if (!confirm(`Import ${imported.length} overtime records?`)) {
      return;
    }
    
    // Import each record
    let success = 0;
    for (const record of imported) {
      try {
        await fetchJson('/api/overtime', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record)
        });
        success++;
      } catch (err) {
        console.error('Failed to import record:', record, err);
      }
    }
    
    toast.success(`Imported ${success} of ${imported.length} overtime records`);
    await loadOvertime();
    
  } catch (err) {
    console.error('Import failed:', err);
    toast.error('Failed to import CSV file');
  }
  
  // Reset file input
  e.target.value = '';
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

// Phase 2 & 3: Initialize Enhanced Features
// 1. Make table sticky headers
const table = document.querySelector('.table');
if (table) {
  table.classList.add('table-sticky');
}

// 2. Initialize table enhancer with all features
if (window.TableEnhancer) {
  const tableEnhancer = new TableEnhancer('overtimeTable');
  
  // Enable multi-select and batch operations
  tableEnhancer.initMultiSelect();
  
  // Enable inline editing (double-click to edit)
  tableEnhancer.initInlineEdit({
    editableColumns: ['event_name', 'hours', 'hourly_rate', 'remarks'],
    onSave: async (rowData, changes) => {
      try {
        await fetchJson(`/api/overtime/${rowData.id}`, {
          method: 'PUT',
          body: JSON.stringify(changes)
        });
        toast.success('Updated successfully');
        await loadOvertime();
      } catch (err) {
        toast.error('Failed to update: ' + err.message);
      }
    }
  });
  
  // Enable expandable rows for detail view
  tableEnhancer.initExpandable({
    getDetails: (rowData) => `
      <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
        <h4>Overtime Details</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div><strong>Staff:</strong> ${rowData.staff_name}</div>
          <div><strong>Event:</strong> ${rowData.event_name}</div>
          <div><strong>Date:</strong> ${new Date(rowData.event_date).toLocaleDateString()}</div>
          <div><strong>Hours:</strong> ${rowData.hours} hours</div>
          <div><strong>Rate:</strong> ${rowData.hourly_rate?.toLocaleString('id-ID', {style: 'currency', currency: 'IDR'})}</div>
          <div><strong>Total:</strong> ${rowData.total_overtime?.toLocaleString('id-ID', {style: 'currency', currency: 'IDR'})}</div>
          <div><strong>Status:</strong> ${rowData.status}</div>
          <div style="grid-column: 1 / -1;"><strong>Remarks:</strong> ${rowData.remarks || '—'}</div>
        </div>
      </div>
    `
  });
}

// 3. Initialize advanced search
if (window.TableSearch) {
  const tableSearch = new TableSearch('.table', {
    searchFields: ['staff_name', 'event_name', 'status'],
    threshold: 0.4
  });
}

// 4. Initialize column toggle
if (window.ColumnToggleManager) {
  const columnToggle = new ColumnToggleManager('.table');
}

// 5. Initialize dashboard customization
if (window.DashboardCustomizer) {
  const dashboardCustomizer = new DashboardCustomizer();
  // Note: If you have dashboard widgets, initialize them here
  // dashboardCustomizer.init('.dashboard-widgets');
}

// 7. Add quick view functionality to table rows
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = overtimeData.find(d => d.id == id);
    if (item) {
      quickView.open([
        {
          title: 'Basic Information',
          fields: {
            'Staff Name': item.staff_name,
            'Event Name': item.event_name,
            'Event Date': new Date(item.event_date).toLocaleDateString(),
            'Status': item.status
          }
        },
        {
          title: 'Financial Details',
          fields: {
            'Hours': `${item.hours} hours`,
            'Hourly Rate': item.hourly_rate?.toLocaleString('id-ID', {style: 'currency', currency: 'IDR'}),
            'Total Overtime': item.total_overtime?.toLocaleString('id-ID', {style: 'currency', currency: 'IDR'})
          }
        },
        {
          title: 'Additional Info',
          fields: {
            'Remarks': item.remarks || '—',
            'Created At': new Date(item.created_at).toLocaleString(),
            'Updated At': item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'
          }
        }
      ], `Overtime: ${item.event_name}`);
    }
  }
});
