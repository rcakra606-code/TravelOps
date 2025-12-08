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
    <tr class="fade-in">
      <td>${item.cruise_brand || '—'}</td>
      <td>${item.ship_name || '—'}</td>
      <td>${dateUtils.format(item.sailing_start)}</td>
      <td>${dateUtils.format(item.sailing_end)}</td>
      <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${item.route || '—'}</td>
      <td>${item.pic_name || '—'}</td>
      <td>${item.reservation_code || '—'}</td>
      <td>${item.staff_name || '—'}</td>
      <td>
        <div class="quick-actions">
          <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
          <button class="btn-edit" data-id="${item.id}">✏️</button>
          ${user.type !== 'basic' ? `<button class="btn-delete" data-id="${item.id}">🗑️</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function editCruise(id) {
  const item = cruiseData.find(c => c.id === id);
  if (!item) return;
  
  window.CRUDModal.edit('Edit Cruise Booking', [
    {
      type: 'text',
      name: 'cruise_brand',
      label: 'Cruise Brand',
      required: true,
      icon: '🚢',
      placeholder: 'e.g., Royal Caribbean'
    },
    {
      type: 'text',
      name: 'ship_name',
      label: 'Ship Name',
      required: true,
      icon: '⚓',
      placeholder: 'e.g., Symphony of the Seas'
    },
    {
      type: 'date',
      name: 'sailing_start',
      label: 'Sailing Start',
      required: true,
      
    },
    {
      type: 'date',
      name: 'sailing_end',
      label: 'Sailing End',
      required: true,
      
    },
    {
      type: 'text',
      name: 'route',
      label: 'Route',
      required: true,
      fullWidth: true,
      icon: '🗺️',
      placeholder: 'e.g., Singapore - Penang - Langkawi'
    },
    {
      type: 'text',
      name: 'pic_name',
      label: 'PIC Name',
      required: true,
      icon: '👤',
      placeholder: 'Person in charge'
    },
    {
      type: 'tags',
      name: 'participant_names',
      label: 'Participants',
      placeholder: 'Type name and press Enter',
      hint: 'Add participant names one by one'
    },
    {
      type: 'tel',
      name: 'phone_number',
      label: 'Phone Number',
      icon: '📞',
      placeholder: '+62...'
    },
    {
      type: 'email',
      name: 'email',
      label: 'Email',
      icon: '📧',
      placeholder: 'contact@example.com'
    },
    {
      type: 'text',
      name: 'reservation_code',
      label: 'Reservation Code',
      icon: '🎫',
      placeholder: 'Booking reference'
    },
    {
      type: 'select',
      name: 'staff_name',
      label: 'Staff Handling',
      required: true,
      options: staffList.map(s => ({ value: s.name, label: s.name }))
    }
  ], item, async (formData) => {
    // Convert tags array back to comma-separated string if needed
    if (Array.isArray(formData.participant_names)) {
      formData.participant_names = formData.participant_names.join(', ');
    }
    
    await fetchJson(`/api/cruise/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify(formData)
    });
    toast.success('Cruise booking updated successfully');
    await loadCruises();
  }, {
    entity: 'cruise',
    size: 'large',
    autoSave: true,
    validation: {
      cruise_brand: { required: true, minLength: 2 },
      ship_name: { required: true, minLength: 2 },
      sailing_start: { required: true },
      sailing_end: { required: true },
      route: { required: true, minLength: 5 },
      pic_name: { required: true, minLength: 2 },
      phone_number: { phone: true },
      email: { email: true },
      staff_name: { required: true }
    }
  });
};

async function deleteCruise(id) {
  const item = cruiseData.find(c => c.id === id);
  if (!item) return;
  
  const displayName = `${item.cruise_brand} - ${item.ship_name} (${item.sailing_start})`;
  
  window.CRUDModal.delete('Cruise Booking', displayName, async () => {
    await fetchJson(`/api/cruise/${id}`, { method: 'DELETE' });
    toast.success('Cruise booking deleted successfully');
    await loadCruises();
  });
};

el('addCruiseBtn').addEventListener('click', () => {
  window.CRUDModal.create('Add New Cruise Booking', [
    {
      type: 'text',
      name: 'cruise_brand',
      label: 'Cruise Brand',
      required: true,
      icon: '🚢',
      placeholder: 'e.g., Royal Caribbean'
    },
    {
      type: 'text',
      name: 'ship_name',
      label: 'Ship Name',
      required: true,
      icon: '⚓',
      placeholder: 'e.g., Symphony of the Seas'
    },
    {
      type: 'date',
      name: 'sailing_start',
      label: 'Sailing Start',
      required: true,
      
    },
    {
      type: 'date',
      name: 'sailing_end',
      label: 'Sailing End',
      required: true,
      
    },
    {
      type: 'text',
      name: 'route',
      label: 'Route',
      required: true,
      fullWidth: true,
      icon: '🗺️',
      placeholder: 'e.g., Singapore - Penang - Langkawi'
    },
    {
      type: 'text',
      name: 'pic_name',
      label: 'PIC Name',
      required: true,
      icon: '👤',
      placeholder: 'Person in charge'
    },
    {
      type: 'tags',
      name: 'participant_names',
      label: 'Participants',
      placeholder: 'Type name and press Enter',
      hint: 'Add participant names one by one'
    },
    {
      type: 'tel',
      name: 'phone_number',
      label: 'Phone Number',
      icon: '📞',
      placeholder: '+62...'
    },
    {
      type: 'email',
      name: 'email',
      label: 'Email',
      icon: '📧',
      placeholder: 'contact@example.com'
    },
    {
      type: 'text',
      name: 'reservation_code',
      label: 'Reservation Code',
      icon: '🎫',
      placeholder: 'Booking reference'
    },
    {
      type: 'select',
      name: 'staff_name',
      label: 'Staff Handling',
      required: true,
      defaultValue: user.type === 'basic' ? user.name : '',
      readonly: user.type === 'basic',
      options: staffList.map(s => ({ value: s.name, label: s.name }))
    }
  ], async (formData) => {
    // Convert tags array back to comma-separated string if needed
    if (Array.isArray(formData.participant_names)) {
      formData.participant_names = formData.participant_names.join(', ');
    }
    
    await fetchJson('/api/cruise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    toast.success('Cruise booking added successfully');
    await loadCruises();
  }, {
    entity: 'cruise',
    size: 'large',
    autoSave: true,
    validation: {
      cruise_brand: { required: true, minLength: 2 },
      ship_name: { required: true, minLength: 2 },
      sailing_start: { required: true },
      sailing_end: { required: true },
      route: { required: true, minLength: 5 },
      pic_name: { required: true, minLength: 2 },
      phone_number: { phone: true },
      email: { email: true },
      staff_name: { required: true }
    }
  });
});

// Handle modal form submissions (legacy support)
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
const debouncedSearch = performanceUtils.debounce((value) => {
  filters.search = value;
  currentPage = 1;
  applyFiltersAndRender();
}, 300);

el('searchInput').addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
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

// Quick View functionality
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = cruiseData.find(c => c.id == id);
    if (item) {
      const nights = item.sailing_start && item.sailing_end ? 
        Math.ceil((new Date(item.sailing_end) - new Date(item.sailing_start)) / (1000 * 60 * 60 * 24)) : 0;
      window.quickView.open([
        {
          title: 'Cruise Information',
          fields: {
            'Cruise Brand': item.cruise_brand || '—',
            'Ship Name': item.ship_name || '—',
            'Reservation Code': item.reservation_code || '—',
            'PIC Name': item.pic_name || '—',
            'Staff Name': item.staff_name || '—'
          }
        },
        {
          title: 'Sailing Details',
          fields: {
            'Sailing Start': dateUtils.format(item.sailing_start),
            'Sailing End': dateUtils.format(item.sailing_end),
            'Duration': nights + ' night' + (nights !== 1 ? 's' : ''),
            'Route': item.route || '—'
          }
        },
        {
          title: 'Passenger Information',
          fields: {
            'Guest List': item.guest_list || '—',
            'Cabin Type': item.cabin_type || '—'
          }
        },
        {
          title: 'Additional Info',
          fields: {
            'Notes': item.notes || '—',
            'Created At': item.created_at ? new Date(item.created_at).toLocaleString() : '—',
            'Cruise ID': item.id
          }
        }
      ], `Cruise: ${item.ship_name || item.cruise_brand}`);
    }
  }
});

await loadStaff();
await loadCruises();
