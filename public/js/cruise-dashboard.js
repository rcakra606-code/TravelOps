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
let cruiseData = [];
let staffList = [];
const user = getUser();

// State management
let currentPage = 1;
let pageSize = 25;
let sortField = 'sailing_start';
let sortDirection = 'desc';
let filters = {
  search: '',
  brand: 'all',
  startDate: '',
  endDate: ''
};

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

async function loadCruises() {
  try {
    loadingUtils.showTableLoader('cruiseTableBody', 9);
    const data = await fetchJson('/api/cruise');
    cruiseData = data || [];
    
    // Populate brand filter
    const brands = [...new Set(cruiseData.map(c => c.cruise_brand).filter(Boolean))];
    const brandFilter = el('brandFilter');
    brandFilter.innerHTML = '<option value="all">All Brands</option>' + 
      brands.map(b => `<option value="${b}">${b}</option>`).join('');
    
    applyFiltersAndRender();
  } catch (err) {
    console.error('Failed to load cruises:', err);
    toast.error('Failed to load cruise data');
    loadingUtils.hideTableLoader('cruiseTableBody', 'Failed to load data');
  }
}

function getFilteredData() {
  let filtered = [...cruiseData];

  // Apply search
  if (filters.search) {
    filtered = filterUtils.search(filtered, filters.search, 
      ['cruise_brand', 'ship_name', 'route', 'pic_name', 'participant_names', 'reservation_code', 'staff_name']);
  }

  // Apply brand filter
  if (filters.brand !== 'all') {
    filtered = filterUtils.byField(filtered, 'cruise_brand', filters.brand);
  }

  // Apply date range filter
  if (filters.startDate || filters.endDate) {
    filtered = filterUtils.dateRange(filtered, 'sailing_start', filters.startDate, filters.endDate);
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

function updateMetrics() {
  const total = cruiseData.length;
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const upcoming = cruiseData.filter(c => {
    if (!c.sailing_start) return false;
    const sailDate = new Date(c.sailing_start);
    return sailDate >= now && sailDate <= thirtyDaysLater;
  }).length;
  
  const active = cruiseData.filter(c => {
    if (!c.sailing_start || !c.sailing_end) return false;
    const start = new Date(c.sailing_start);
    const end = new Date(c.sailing_end);
    return start <= now && end >= now;
  }).length;
  
  const thisMonth = cruiseData.filter(c => {
    if (!c.sailing_start) return false;
    const sailDate = new Date(c.sailing_start);
    return sailDate.getMonth() === now.getMonth() && sailDate.getFullYear() === now.getFullYear();
  }).length;
  
  el('totalCruises').textContent = total;
  el('upcomingCruises').textContent = upcoming;
  el('activeCruises').textContent = active;
  el('thisMonthCruises').textContent = thisMonth;
}

function renderTable(data) {
  const tbody = el('cruiseTableBody');
  if (!tbody) return;
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      editCruise(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      deleteCruise(id);
    }
  };
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 40px; color: var(--text-secondary);">No records found</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${item.cruise_brand || '—'}</td>
      <td>${item.ship_name || '—'}</td>
      <td>${dateUtils.format(item.sailing_start)}</td>
      <td>${dateUtils.format(item.sailing_end)}</td>
      <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${item.route || '—'}</td>
      <td>${item.pic_name || '—'}</td>
      <td>${item.reservation_code || '—'}</td>
      <td>${item.staff_name || '—'}</td>
      <td>
        <button class="btn-edit" data-id="${item.id}">✏️</button>
        ${user.type !== 'basic' ? `<button class="btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function editCruise(id) {
  const item = cruiseData.find(c => c.id === id);
  if (!item) return;
  
  window.openModal({
    title: 'Edit Cruise',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Cruise Brand *</label>
          <input type="text" name="cruise_brand" value="${item.cruise_brand || ''}" required>
        </div>
        <div class="form-group">
          <label>Ship Name *</label>
          <input type="text" name="ship_name" value="${item.ship_name || ''}" required>
        </div>
        <div class="form-group">
          <label>Sailing Start *</label>
          <input type="date" name="sailing_start" value="${item.sailing_start || ''}" required>
        </div>
        <div class="form-group">
          <label>Sailing End *</label>
          <input type="date" name="sailing_end" value="${item.sailing_end || ''}" required>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Route *</label>
          <input type="text" name="route" value="${item.route || ''}" placeholder="e.g., Singapore - Penang - Langkawi" required>
        </div>
        <div class="form-group">
          <label>PIC Name *</label>
          <input type="text" name="pic_name" value="${item.pic_name || ''}" required>
        </div>
        <div class="form-group">
          <label>Participant Names</label>
          <input type="text" name="participant_names" value="${item.participant_names || ''}" placeholder="Comma separated">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" value="${item.phone_number || ''}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" value="${item.email || ''}">
        </div>
        <div class="form-group">
          <label>Reservation Code</label>
          <input type="text" name="reservation_code" value="${item.reservation_code || ''}">
        </div>
        <div class="form-group">
          <label>Staff Name *</label>
          <select name="staff_name" required>
            ${staffList.map(s => `<option value="${s.name}" ${s.name === item.staff_name ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
    `,
    context: { entity: 'cruise', action: 'edit', id: item.id }
  });
};

async function deleteCruise(id) {
  const confirmed = await confirmDialog.delete('this cruise booking');
  if (!confirmed) return;
  
  try {
    await fetchJson(`/api/cruise/${id}`, { method: 'DELETE' });
    toast.success('Cruise deleted successfully');
    await loadCruises();
  } catch (err) {
    console.error('Delete failed:', err);
    toast.error('Failed to delete cruise: ' + err.message);
  }
};

el('addCruiseBtn').addEventListener('click', () => {
  window.openModal({
    title: 'Add New Cruise',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Cruise Brand *</label>
          <input type="text" name="cruise_brand" placeholder="e.g., Royal Caribbean" required>
        </div>
        <div class="form-group">
          <label>Ship Name *</label>
          <input type="text" name="ship_name" placeholder="e.g., Symphony of the Seas" required>
        </div>
        <div class="form-group">
          <label>Sailing Start *</label>
          <input type="date" name="sailing_start" required>
        </div>
        <div class="form-group">
          <label>Sailing End *</label>
          <input type="date" name="sailing_end" required>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Route *</label>
          <input type="text" name="route" placeholder="e.g., Singapore - Penang - Langkawi" required>
        </div>
        <div class="form-group">
          <label>PIC Name *</label>
          <input type="text" name="pic_name" placeholder="Person in charge" required>
        </div>
        <div class="form-group">
          <label>Participant Names</label>
          <input type="text" name="participant_names" placeholder="Comma separated names">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" placeholder="+62...">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" placeholder="contact@example.com">
        </div>
        <div class="form-group">
          <label>Reservation Code</label>
          <input type="text" name="reservation_code" placeholder="Booking reference">
        </div>
        <div class="form-group">
          <label>Staff Name *</label>
          <select name="staff_name" required id="staffSelect">
            <option value="">Select staff</option>
            ${staffList.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
    `,
    context: { entity: 'cruise', action: 'create' }
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
  if (context.entity !== 'cruise') return;
  
  e.preventDefault();
  
  try {
    if (context.action === 'create') {
      await fetchJson('/api/cruise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast.success('Cruise added successfully');
    } else if (context.action === 'edit' && context.id) {
      await fetchJson(`/api/cruise/${context.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast.success('Cruise updated successfully');
    }
    
    await loadCruises();
  } catch (err) {
    console.error('Cruise submission failed:', err);
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

el('brandFilter').addEventListener('change', (e) => {
  filters.brand = e.target.value;
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
  filters = { search: '', brand: 'all', startDate: '', endDate: '' };
  el('searchInput').value = '';
  el('brandFilter').value = 'all';
  el('startDateFilter').value = '';
  el('endDateFilter').value = '';
  currentPage = 1;
  applyFiltersAndRender();
  toast.info('Filters cleared');
});

// Export handler
el('exportBtn').addEventListener('click', () => {
  const filtered = getFilteredData();
  exportUtils.toCSV(filtered, 'cruise_bookings', [
    { key: 'cruise_brand', label: 'Cruise Brand' },
    { key: 'ship_name', label: 'Ship Name' },
    { key: 'sailing_start', label: 'Sailing Start' },
    { key: 'sailing_end', label: 'Sailing End' },
    { key: 'route', label: 'Route' },
    { key: 'pic_name', label: 'PIC Name' },
    { key: 'participant_names', label: 'Participants' },
    { key: 'phone_number', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'reservation_code', label: 'Reservation Code' },
    { key: 'staff_name', label: 'Staff Name' }
  ]);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal');
    if (modal && modal.classList.contains('active')) {
      document.getElementById('modalClose')?.click();
    }
  }
  
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    const modal = document.getElementById('modal');
    if (modal && modal.classList.contains('active')) {
      document.getElementById('modalSave')?.click();
    }
  }
});

// Add sortable headers
sortUtils.addSortableHeaders('cruiseTable', 
  ['cruise_brand', 'ship_name', 'sailing_start', 'sailing_end', 'pic_name', 'staff_name'],
  (field, direction) => {
    sortField = field;
    sortDirection = direction;
    applyFiltersAndRender();
  }
);

await loadStaff();
await loadCruises();
