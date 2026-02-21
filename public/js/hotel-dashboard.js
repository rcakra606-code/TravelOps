// Hotel Dashboard - Manage hotel bookings with CRUD improvements
await new Promise(resolve => {
  const checkReady = () => {
    if (window.getUser && window.fetchJson && window.openModal && window.toast && window.dateUtils && window.CRUDModal) {
      console.log('✅ Hotel Dashboard: All dependencies loaded');
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
let hotelData = [];
let regionsData = [];
let usersData = [];
const user = getUser();

// Pagination state
let currentPage = 1;
const pageSize = 25;

el('userName').textContent = user.name || user.username || '—';
el('userRole').textContent = { admin: 'Administrator', 'semi-admin': 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';

let filters = { search: '', startDate: '', endDate: '' };

async function loadRegions() {
  try {
    regionsData = await fetchJson('/api/regions') || [];
  } catch (err) {
    console.error('Failed to load regions:', err);
  }
}

async function loadUsers() {
  // Basic users can't access /api/users - skip the call entirely
  if (user.type === 'basic') {
    usersData = [{ name: user.name || user.username }];
    return;
  }
  
  try {
    usersData = await fetchJson('/api/users') || [];
  } catch (err) {
    console.warn('Could not load users:', err.message);
    usersData = [{ name: user.name || user.username }];
  }
}

async function loadHotel() {
  try {
    window.loadingUtils.showTableLoader('hotelTableBody', 8);
    hotelData = await fetchJson('/api/hotel_bookings') || [];
    applyFiltersAndRender();
  } catch (err) {
    console.error('Failed to load hotel:', err);
    window.toast.error('Failed to load hotel data');
    window.loadingUtils.hideTableLoader('hotelTableBody', 'Failed to load data');
  }
}

function updateMetrics() {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today for comparison
  
  // Active bookings = check-in date has not passed yet (>= today)
  const activeBookings = hotelData.filter(h => {
    if (!h.check_in) return false;
    const checkIn = new Date(h.check_in);
    checkIn.setHours(0, 0, 0, 0);
    return checkIn >= now;
  });
  
  // Without Confirmation = active bookings missing confirmation number
  const withoutConfirmation = activeBookings.filter(h => {
    return !h.confirmation_number || h.confirmation_number.toString().trim() === '';
  }).length;
  
  // With Confirmation = active bookings that have confirmation number
  const withConfirmation = activeBookings.filter(h => {
    return h.confirmation_number && h.confirmation_number.toString().trim() !== '';
  }).length;
  
  el('totalBookings').textContent = hotelData.length;
  el('activeBookings').textContent = activeBookings.length;
  el('totalNights').textContent = withoutConfirmation;
  el('totalCost').textContent = withConfirmation;
}

function applyFiltersAndRender() {
  let filtered = [...hotelData];
  if (filters.search) filtered = window.filterUtils.search(filtered, filters.search, ['hotel_name', 'confirmation_number', 'guest_list', 'supplier_name']);
  if (filters.startDate) filtered = filtered.filter(h => !h.check_in || h.check_in >= filters.startDate);
  if (filters.endDate) filtered = filtered.filter(h => !h.check_out || h.check_out <= filters.endDate);
  
  // Apply pagination
  const paginated = window.paginationUtils.paginate(filtered, currentPage, pageSize);
  
  updateMetrics();
  renderTable(paginated.data);
  
  // Render pagination controls
  window.paginationUtils.renderPaginationControls('paginationControls', paginated, (page) => {
    currentPage = page;
    applyFiltersAndRender();
  });
}

function renderTable(data) {
  const tbody = el('hotelTableBody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hotel bookings found</td></tr>';
    return;
  }
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      window.editHotel(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      window.deleteHotel(id);
    }
  };
  
  tbody.innerHTML = data.map(item => {
    const region = regionsData.find(r => r.id === item.region_id);
    return `
    <tr class="table-row">
      <td><strong>${item.hotel_name || '—'}</strong></td>
      <td>${region ? region.region_name : '—'}</td>
      <td>${item.check_in || '—'}</td>
      <td>${item.check_out || '—'}</td>
      <td>${item.confirmation_number || '—'}</td>
      <td>${(item.guest_list || '').substring(0, 30)}${item.guest_list && item.guest_list.length > 30 ? '...' : ''}</td>
      <td>${item.staff_name || '—'}</td>
      <td class="actions">
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        <button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>
        ${user.type !== 'basic' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `;
  }).join('');
}

window.editHotel = async function(id) {
  console.log('✏️ Edit Hotel called with id:', id);
  console.log('CRUDModal available:', !!window.CRUDModal);
  const item = hotelData.find(h => h.id === id);
  if (!item) {
    console.error('Hotel item not found:', id);
    return;
  }
  
  console.log('Calling CRUDModal.edit for hotel:', item);
  window.CRUDModal.edit('Edit Hotel Booking', [
    { type: 'date', name: 'check_in', label: 'Check-In', required: true },
    { type: 'date', name: 'check_out', label: 'Check-Out', required: true },
    { type: 'text', name: 'hotel_name', label: 'Hotel Name', required: true, icon: '🏨', placeholder: 'e.g., Grand Hyatt Jakarta' },
    { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
    { type: 'text', name: 'confirmation_number', label: 'Confirmation Number', icon: '🔖', placeholder: 'Booking confirmation number' },
    { type: 'textarea', name: 'guest_list', label: 'Guest List', fullWidth: true, rows: 3, placeholder: 'List of guests (comma separated)' },
    { type: 'text', name: 'supplier_code', label: 'Supplier Code', icon: '🏢', placeholder: 'Hotel supplier code' },
    { type: 'text', name: 'supplier_name', label: 'Supplier Name', icon: '🏢', placeholder: 'Hotel supplier name' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) }
  ], item, async (formData) => {
    await fetchJson(`/api/hotel_bookings/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
    window.toast.success('Hotel booking updated');
    await loadHotel();
  }, {
    entity: 'hotel',
    size: 'large',
    validation: { 
      hotel_name: { required: true, minLength: 2 },
      check_in: { required: true },
      check_out: { required: true },
      region_id: { required: true },
      staff_name: { required: true }
    }
  });
};

window.deleteHotel = async function(id) {
  console.log('🗑️ Delete Hotel called with id:', id);
  console.log('CRUDModal available:', !!window.CRUDModal);
  const item = hotelData.find(h => h.id === id);
  if (!item) {
    console.error('Hotel item not found:', id);
    return;
  }
  
  console.log('Calling CRUDModal.delete for hotel:', item);
  window.CRUDModal.delete('Hotel Booking', `${item.hotel_name} - ${item.confirmation_number || 'No confirmation'}`, async () => {
    await fetchJson(`/api/hotel_bookings/${id}`, { method: 'DELETE' });
    window.toast.success('Hotel booking deleted');
    await loadHotel();
  });
};

el('addHotelBtn').addEventListener('click', () => {
  console.log('🏨 Add Hotel button clicked');
  console.log('CRUDModal:', window.CRUDModal);
  console.log('openModal:', window.openModal);
  console.log('regionsData:', regionsData);
  console.log('usersData:', usersData);
  
  window.CRUDModal.create('Add Hotel Booking', [
    { type: 'date', name: 'check_in', label: 'Check-In', required: true },
    { type: 'date', name: 'check_out', label: 'Check-Out', required: true },
    { type: 'text', name: 'hotel_name', label: 'Hotel Name', required: true, icon: '🏨', placeholder: 'e.g., Grand Hyatt Jakarta' },
    { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
    { type: 'text', name: 'confirmation_number', label: 'Confirmation Number', icon: '🔖', placeholder: 'Booking confirmation number' },
    { type: 'textarea', name: 'guest_list', label: 'Guest List', fullWidth: true, rows: 3, placeholder: 'List of guests (comma separated)' },
    { type: 'text', name: 'supplier_code', label: 'Supplier Code', icon: '🏢', placeholder: 'Hotel supplier code' },
    { type: 'text', name: 'supplier_name', label: 'Supplier Name', icon: '🏢', placeholder: 'Hotel supplier name' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) }
  ], async (formData) => {
    await fetchJson('/api/hotel_bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
    window.toast.success('Hotel booking added');
    await loadHotel();
  }, {
    entity: 'hotel',
    size: 'large',
    validation: { 
      hotel_name: { required: true, minLength: 2 },
      check_in: { required: true },
      check_out: { required: true },
      region_id: { required: true },
      staff_name: { required: true }
    }
  });
});

// Search functionality - use searchInput from HTML
const searchHotelInput = el('searchInput');
if (searchHotelInput) {
  searchHotelInput.addEventListener('input', (e) => { filters.search = e.target.value; applyFiltersAndRender(); });
}

// Quick View functionality
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = hotelData.find(h => h.id == id);
    if (item) {
      const region = regionsData.find(r => r.id === item.region_id);
      const nights = item.check_in && item.check_out ? 
        Math.ceil((new Date(item.check_out) - new Date(item.check_in)) / (1000 * 60 * 60 * 24)) : 0;
      window.quickView.open([
        {
          title: 'Hotel Information',
          fields: {
            'Hotel Name': item.hotel_name || '—',
            'Region': region ? region.region_name : '—',
            'Confirmation Number': item.confirmation_number || '—',
            'Staff Name': item.staff_name || '—'
          }
        },
        {
          title: 'Booking Details',
          fields: {
            'Check-In': item.check_in || '—',
            'Check-Out': item.check_out || '—',
            'Total Nights': nights + ' night' + (nights !== 1 ? 's' : ''),
            'Guest List': item.guest_list || '—'
          }
        },
        {
          title: 'Supplier Information',
          fields: {
            'Supplier Code': item.supplier_code || '—',
            'Supplier Name': item.supplier_name || '—'
          }
        },
        {
          title: 'Additional Info',
          fields: {
            'Notes': item.notes || '—',
            'Created At': item.created_at ? new Date(item.created_at).toLocaleString() : '—',
            'Booking ID': item.id
          }
        }
      ], `Hotel: ${item.hotel_name}`);
    }
  }
});

el('exportHotelBtn').addEventListener('click', () => {
  const csv = [['Check In', 'Check Out', 'Hotel Name', 'Region', 'Confirmation', 'Guest List', 'Supplier Code', 'Supplier Name', 'Staff'], 
    ...hotelData.map(h => {
      const region = regionsData.find(r => r.id === h.region_id);
      return [h.check_in, h.check_out, h.hotel_name, region ? region.region_name : '', h.confirmation_number, h.guest_list, h.supplier_code, h.supplier_name, h.staff_name];
    })].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hotel_bookings_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  window.toast.success('Exported');
});

// Import functionality
el('importHotelBtn')?.addEventListener('click', () => {
  el('importHotelFileInput').click();
});

el('importHotelFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      window.toast.error('CSV file is empty or has no data rows');
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
        hotel_name: row['hotel name'] || row['hotel_name'] || row['name'] || '',
        location: row['location'] || row['region'] || '',
        check_in: row['check-in date'] || row['check_in_date'] || row['check_in'] || row['check in'] || '',
        check_out: row['check-out date'] || row['check_out_date'] || row['check_out'] || row['check out'] || '',
        confirmation_number: row['confirmation number'] || row['confirmation_number'] || row['confirmation'] || '',
        guest_list: row['guest list'] || row['guest_list'] || row['guests'] || '',
        room_type: row['room type'] || row['room_type'] || '',
        room_count: row['room count'] || row['room_count'] || row['rooms'] || '',
        staff_name: row['staff name'] || row['staff_name'] || row['staff'] || user.name || user.username
      };
      
      // Validate required fields
      if (!mapped.hotel_name) {
        errors.push(`Row ${i + 1}: Hotel name is required`);
        continue;
      }
      
      // Find region by name if location provided
      if (mapped.location) {
        const region = regionsData.find(r => 
          r.region_name?.toLowerCase() === mapped.location.toLowerCase()
        );
        if (region) {
          mapped.region_id = region.id;
        }
      }
      
      imported.push(mapped);
    }
    
    if (errors.length > 0) {
      window.toast.warning(`${errors.length} rows had errors. Importing valid rows...`);
      console.warn('Import errors:', errors);
    }
    
    if (imported.length === 0) {
      window.toast.error('No valid data to import');
      return;
    }
    
    // Confirm import
    if (!confirm(`Import ${imported.length} hotel bookings?`)) {
      return;
    }
    
    // Import each record
    let success = 0;
    for (const record of imported) {
      try {
        await fetchJson('/api/hotel_bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record)
        });
        success++;
      } catch (err) {
        console.error('Failed to import record:', record, err);
      }
    }
    
    window.toast.success(`Imported ${success} of ${imported.length} hotel bookings`);
    await loadHotel();
    
  } catch (err) {
    console.error('Import failed:', err);
    window.toast.error('Failed to import CSV file');
  }
  
  // Reset file input
  e.target.value = '';
});

// Initialize
Promise.all([loadRegions(), loadUsers()]).then(() => loadHotel());

