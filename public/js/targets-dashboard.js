// Wait for auth-common.js and dashboard.js to load
await new Promise(resolve => {
  const checkReady = () => {
    if (window.getUser && window.fetchJson && window.openModal && window.toast && window.dateUtils && window.CRUDModal) {
      console.log('✅ Targets Dashboard: All dependencies loaded');
      resolve();
    } else {
      console.log('⏳ Waiting for dependencies...', {
        getUser: !!window.getUser,
        fetchJson: !!window.fetchJson,
        openModal: !!window.openModal,
        toast: !!window.toast,
        dateUtils: !!window.dateUtils,
        CRUDModal: !!window.CRUDModal
      });
      setTimeout(checkReady, 50);
    }
  };
  checkReady();
});

const getUser = window.getUser;
const fetchJson = window.fetchJson;
const CRUDModal = window.CRUDModal;

const el = id => document.getElementById(id);
let targetsData = [];
let staffList = [];
const user = getUser();

// State management
let currentPage = 1;
let pageSize = 25;
let sortField = 'year';
let sortDirection = 'desc';
let filters = {
  search: '',
  month: '',
  year: ''
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
    // If user is basic and can't access /api/users, use their own name
    if (user.type === 'basic') {
      staffList = [{ name: user.name || user.username }];
    }
  }
}

async function loadTargets() {
  try {
    window.loadingUtils.showTableLoader('targetsTableBody', 6);
    const data = await fetchJson('/api/targets');
    targetsData = data || [];
    applyFiltersAndRender();
  } catch (err) {
    console.error('Failed to load targets:', err);
    window.toast.error('Failed to load targets data');
    window.loadingUtils.hideTableLoader('targetsTableBody', 'Failed to load data');
  }
}

function updateMetrics() {
  const total = targetsData.length;
  
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const activeMonth = `${monthNames[currentMonth - 1]} ${currentYear}`;
  
  const currentTargets = targetsData.filter(t => t.month === currentMonth && t.year === currentYear);
  const avgSales = currentTargets.length ? currentTargets.reduce((sum, t) => sum + (parseFloat(t.target_sales) || 0), 0) / currentTargets.length : 0;
  const avgProfit = currentTargets.length ? currentTargets.reduce((sum, t) => sum + (parseFloat(t.target_profit) || 0), 0) / currentTargets.length : 0;
  
  el('totalTargets').textContent = total;
  el('activeMonth').textContent = activeMonth;
  el('avgSalesTarget').textContent = 'Rp ' + Math.round(avgSales).toLocaleString('id-ID');
  el('avgProfitTarget').textContent = 'Rp ' + Math.round(avgProfit).toLocaleString('id-ID');
}

function getFilteredData() {
  let filtered = [...targetsData];

  // Apply search
  if (filters.search) {
    filtered = window.filterUtils.search(filtered, filters.search, ['staff_name']);
  }

  // Apply month filter
  if (filters.month) {
    filtered = filtered.filter(t => t.month == filters.month);
  }

  // Apply year filter
  if (filters.year) {
    filtered = filtered.filter(t => t.year == filters.year);
  }

  // Apply sorting
  filtered = window.sortUtils.sort(filtered, sortField, sortDirection);

  return filtered;
}

function applyFiltersAndRender() {
  const filtered = getFilteredData();
  updateMetrics();
  renderTable(filtered);
}

function renderTable(data) {
  const tbody = el('targetsTableBody');
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No targets found</td></tr>';
    return;
  }
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      window.editTarget(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      window.deleteTarget(id);
    }
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  tbody.innerHTML = data.map(item => `
    <tr class="table-row">
      <td><strong>${item.staff_name || '—'}</strong></td>
      <td>${item.month ? monthNames[item.month - 1] : '—'}</td>
      <td>${item.year || '—'}</td>
      <td class="text-right"><strong>Rp ${(item.target_sales || 0).toLocaleString('id-ID')}</strong></td>
      <td class="text-right"><strong>Rp ${(item.target_profit || 0).toLocaleString('id-ID')}</strong></td>
      <td class="actions">
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        <button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>
        <button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️ Delete</button>
      </td>
    </tr>
  `).join('');
}

async function editTarget(id) {
  console.log('✏️ Edit Target called with id:', id);
  console.log('CRUDModal available:', !!window.CRUDModal);
  const item = targetsData.find(t => t.id === id);
  if (!item) {
    console.error('Target item not found:', id);
    return;
  }
  
  console.log('Calling CRUDModal.edit for target:', item);
  window.CRUDModal.edit('Edit Target', [
    {
      type: 'select',
      name: 'staff_name',
      label: 'Staff Name',
      required: true,
      options: staffList.map(s => ({ value: s.name, label: s.name }))
    },
    {
      type: 'number',
      name: 'month',
      label: 'Month',
      required: true,
      min: 1,
      max: 12,
      placeholder: '1-12'
    },
    {
      type: 'number',
      name: 'year',
      label: 'Year',
      required: true,
      min: 2020,
      max: 2100,
      placeholder: 'YYYY'
    },
    {
      type: 'currency',
      name: 'target_sales',
      label: 'Sales Target',
      required: true,
      currency: 'Rp',
      min: 0,
      step: 100000
    },
    {
      type: 'currency',
      name: 'target_profit',
      label: 'Profit Target',
      required: true,
      currency: 'Rp',
      min: 0,
      step: 100000
    }
  ], item, async (formData) => {
    try {
      console.log('Submitting target update:', formData);
      const response = await fetchJson(`/api/targets/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      console.log('Target update response:', response);
      window.toast.success('Target updated successfully');
      await loadTargets();
    } catch (error) {
      console.error('Target update error:', error);
      window.toast.error('Failed to update target: ' + (error.message || 'Unknown error'));
      throw error; // Re-throw to keep modal open
    }
  }, {
    entity: 'target',
    validation: {
      staff_name: { required: true },
      month: { required: true, min: 1, max: 12 },
      year: { required: true, min: 2020 },
      target_sales: { required: true, min: 0 },
      target_profit: { required: true, min: 0 }
    }
  });
}

async function deleteTarget(id) {
  console.log('🗑️ Delete Target called with id:', id);
  console.log('CRUDModal available:', !!window.CRUDModal);
  const item = targetsData.find(t => t.id === id);
  if (!item) {
    console.error('Target item not found:', id);
    return;
  }
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const displayName = `${item.staff_name} - ${monthNames[item.month - 1]} ${item.year}`;
  
  console.log('Calling CRUDModal.delete for target:', item);
  window.CRUDModal.delete('Target', displayName, async () => {
    await fetchJson(`/api/targets/${id}`, { method: 'DELETE' });
    window.toast.success('Target deleted successfully');
    await loadTargets();
  });
}

el('addTargetBtn').addEventListener('click', () => {
  console.log('🎯 Add Target button clicked');
  console.log('CRUDModal available:', !!window.CRUDModal);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  window.CRUDModal.create('Add New Target', [
    {
      type: 'select',
      name: 'staff_name',
      label: 'Staff Name',
      required: true,
      options: staffList.map(s => ({ value: s.name, label: s.name }))
    },
    {
      type: 'number',
      name: 'month',
      label: 'Month',
      required: true,
      min: 1,
      max: 12,
      defaultValue: currentMonth,
      placeholder: '1-12',
      hint: '1=Jan, 2=Feb, 3=Mar, etc.'
    },
    {
      type: 'number',
      name: 'year',
      label: 'Year',
      required: true,
      min: 2020,
      max: 2100,
      defaultValue: currentYear,
      placeholder: 'YYYY'
    },
    {
      type: 'currency',
      name: 'target_sales',
      label: 'Sales Target',
      required: true,
      currency: 'Rp',
      min: 0,
      step: 100000,
      placeholder: 'e.g., 10000000'
    },
    {
      type: 'currency',
      name: 'target_profit',
      label: 'Profit Target',
      required: true,
      currency: 'Rp',
      min: 0,
      step: 100000,
      placeholder: 'e.g., 2000000'
    }
  ], async (formData) => {
    try {
      console.log('Submitting new target:', formData);
      const response = await fetchJson('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      console.log('Target create response:', response);
      window.toast.success('Target added successfully');
      await loadTargets();
    } catch (error) {
      console.error('Target create error:', error);
      window.toast.error('Failed to add target: ' + (error.message || 'Unknown error'));
      throw error; // Re-throw to keep modal open
    }
  }, {
    entity: 'target',
    validation: {
      staff_name: { required: true },
      month: { required: true, min: 1, max: 12 },
      year: { required: true, min: 2020 },
      target_sales: { required: true, min: 0 },
      target_profit: { required: true, min: 0 }
    }
  });
});

// Search functionality
el('searchTargets').addEventListener('input', (e) => {
  filters.search = e.target.value;
  applyFiltersAndRender();
});

// Export functionality
el('exportTargetsBtn').addEventListener('click', () => {
  const data = getFilteredData();
  const csv = [
    ['Staff Name', 'Month', 'Year', 'Sales Target', 'Profit Target'],
    ...data.map(t => [t.staff_name, t.month, t.year, t.target_sales, t.target_profit])
  ].map(row => row.join(',')).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `targets_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  window.toast.success('Targets exported successfully');
});

// Quick View functionality
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = targetsData.find(t => t.id == id);
    if (item) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      window.quickView.open([
        {
          title: 'Target Information',
          fields: {
            'Staff Name': item.staff_name || '—',
            'Period': `${monthNames[item.month - 1] || '—'} ${item.year || '—'}`,
            'Month': item.month || '—',
            'Year': item.year || '—'
          }
        },
        {
          title: 'Target Details',
          fields: {
            'Sales Target': (item.target_sales || 0).toLocaleString('id-ID', {style: 'currency', currency: 'IDR'}),
            'Profit Target': (item.target_profit || 0).toLocaleString('id-ID', {style: 'currency', currency: 'IDR'})
          }
        },
        {
          title: 'Record Info',
          fields: {
            'Created At': item.created_at ? new Date(item.created_at).toLocaleString() : '—',
            'Target ID': item.id
          }
        }
      ], `Target: ${item.staff_name} - ${monthNames[item.month - 1]} ${item.year}`);
    }
  }
});

// Initialize
async function init() {
  await loadStaff();
  await loadTargets();
}

init();

// Expose functions globally
window.editTarget = editTarget;
window.deleteTarget = deleteTarget;

