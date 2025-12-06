// Hotel Dashboard - Manage hotel bookings with CRUD improvements
await new Promise(resolve => {
  const checkReady = () => {
    if (window.getUser && window.fetchJson && window.openModal && window.toast && window.dateUtils && window.CRUDModal) {
      resolve();
    } else {
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
  try {
    usersData = await fetchJson('/api/users') || [];
  } catch (err) {
    console.error('Failed to load users:', err);
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
  const active = hotelData.filter(h => {
    if (!h.check_out) return false;
    return new Date(h.check_out) >= now;
  }).length;
  
  const totalNights = hotelData.reduce((sum, h) => {
    if (!h.check_in || !h.check_out) return sum;
    const nights = Math.ceil((new Date(h.check_out) - new Date(h.check_in)) / (1000 * 60 * 60 * 24));
    return sum + (nights > 0 ? nights : 0);
  }, 0);
  
  const avgNights = hotelData.length > 0 ? (totalNights / hotelData.length).toFixed(1) : 0;
  
  el('totalBookings').textContent = hotelData.length;
  el('activeBookings').textContent = active;
  el('totalNights').textContent = totalNights;
  el('totalCost').textContent = avgNights + ' nights/booking';
  el('metricsRow').style.display = 'grid';
}

function applyFiltersAndRender() {
  let filtered = [...hotelData];
  if (filters.search) filtered = window.filterUtils.search(filtered, filters.search, ['hotel_name', 'confirmation_number', 'guest_list', 'supplier_name']);
  if (filters.startDate) filtered = filtered.filter(h => !h.check_in || h.check_in >= filters.startDate);
  if (filters.endDate) filtered = filtered.filter(h => !h.check_out || h.check_out <= filters.endDate);
  
  updateMetrics();
  renderTable(filtered);
}

function renderTable(data) {
  const tbody = el('hotelTableBody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hotel bookings found</td></tr>';
    return;
  }
  
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
        <button class="btn btn-sm" onclick="editHotel(${item.id})">✏️ Edit</button>
        ${user.type !== 'basic' ? `<button class="btn btn-sm btn-danger" onclick="deleteHotel(${item.id})">🗑️</button>` : ''}
      </td>
    </tr>
  `;
  }).join('');
}

window.editHotel = async function(id) {
  const item = hotelData.find(h => h.id === id);
  if (!item) return;
  
  CRUDModal.edit('Edit Hotel Booking', [
    { type: 'date', name: 'check_in', label: 'Check-In', required: true, quickDates: true },
    { type: 'date', name: 'check_out', label: 'Check-Out', required: true, quickDates: true },
    { type: 'text', name: 'hotel_name', label: 'Hotel Name', required: true, icon: '🏨', placeholder: 'e.g., Grand Hyatt Jakarta' },
    { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
    { type: 'text', name: 'confirmation_number', label: 'Confirmation Number', icon: '🔖', placeholder: 'Booking confirmation number' },
    { type: 'textarea', name: 'guest_list', label: 'Guest List', fullWidth: true, rows: 3, placeholder: 'List of guests (comma separated)' },
    { type: 'text', name: 'supplier_code', label: 'Supplier Code', icon: '🏢', placeholder: 'Hotel supplier code' },
    { type: 'text', name: 'supplier_name', label: 'Supplier Name', icon: '🏢', placeholder: 'Hotel supplier name' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) }
  ], item, async (formData) => {
    await fetchJson(`/api/hotel_bookings/${item.id}`, { method: 'PUT', body: JSON.stringify(formData) });
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
  const item = hotelData.find(h => h.id === id);
  if (!item) return;
  
  CRUDModal.delete('Hotel Booking', `${item.hotel_name} - ${item.confirmation_number || 'No confirmation'}`, async () => {
    await fetchJson(`/api/hotel_bookings/${id}`, { method: 'DELETE' });
    window.toast.success('Hotel booking deleted');
    await loadHotel();
  });
};

el('addHotelBtn').addEventListener('click', () => {
  CRUDModal.create('Add Hotel Booking', [
    { type: 'date', name: 'check_in', label: 'Check-In', required: true, quickDates: true },
    { type: 'date', name: 'check_out', label: 'Check-Out', required: true, quickDates: true },
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

el('searchHotel').addEventListener('input', (e) => { filters.search = e.target.value; applyFiltersAndRender(); });

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

// Initialize
Promise.all([loadRegions(), loadUsers()]).then(() => loadHotel());

