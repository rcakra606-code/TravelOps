/* =========================================================
   CRUD HANDLERS FOR ALL ENTITIES
   ========================================================= */

// Helper functions with fallback
const fetchJson = (...args) => {
  if (!window.fetchJson) {
    console.error('❌ fetchJson not available');
    throw new Error('fetchJson function not loaded');
  }
  return window.fetchJson(...args);
};

const openModal = (...args) => {
  if (!window.openModal) {
    console.error('❌ openModal not available');
    alert('Modal system not ready. Please refresh the page.');
    return;
  }
  return window.openModal(...args);
};

const formatCurrency = (...args) => {
  if (!window.formatCurrency) {
    console.error('❌ formatCurrency not available');
    return args[0];
  }
  return window.formatCurrency(...args);
};

// Global state
let state = {
  regions: [],
  users: [],
  sales: [],
  tours: [],
  documents: [],
  targets: [],
  telecom: [],
  // Pagination & filtering state
  pagination: {
    sales: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    tours: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    documents: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    targets: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    regions: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    users: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    telecom: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' }
  },
  filters: {
    sales: {},
    tours: {},
    documents: {},
    targets: {},
    regions: {},
    users: {},
    telecom: {}
  }
};

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

/* === PAGINATION & FILTERING UTILITIES === */
function applyFiltersAndSort(entity) {
  let data = [...state[entity]];
  const filters = state.filters[entity];
  
  // Apply search filter
  if (filters.search) {
    const search = filters.search.toLowerCase();
    data = data.filter(item => {
      return Object.values(item).some(val => 
        String(val).toLowerCase().includes(search)
      );
    });
  }
  
  // Apply date range filter
  if (filters.dateFrom) {
    data = data.filter(item => {
      const itemDate = item.tanggal_mulai || item.tanggal || item.created_at;
      return itemDate >= filters.dateFrom;
    });
  }
  if (filters.dateTo) {
    data = data.filter(item => {
      const itemDate = item.tanggal_selesai || item.tanggal || item.created_at;
      return itemDate <= filters.dateTo;
    });
  }
  
  // Apply entity-specific filters
  Object.keys(filters).forEach(key => {
    if (!['search', 'dateFrom', 'dateTo'].includes(key) && filters[key]) {
      data = data.filter(item => item[key] == filters[key]);
    }
  });
  
  // Apply sorting
  const pg = state.pagination[entity];
  if (pg.sortBy) {
    data.sort((a, b) => {
      let aVal = a[pg.sortBy];
      let bVal = b[pg.sortBy];
      
      // Handle numeric sorting
      if (!isNaN(aVal) && !isNaN(bVal)) {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }
      
      if (aVal < bVal) return pg.sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return pg.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }
  
  return data;
}

function paginateData(entity, data) {
  const pg = state.pagination[entity];
  const start = (pg.page - 1) * pg.pageSize;
  const end = start + pg.pageSize;
  return data.slice(start, end);
}

function renderPagination(entity, totalItems) {
  const container = document.getElementById(`${entity}Pagination`);
  if (!container) return;
  
  const pg = state.pagination[entity];
  const totalPages = Math.ceil(totalItems / pg.pageSize);
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<div class="pagination-controls">';
  html += `<button onclick="window.crudHandlers.goToPage('${entity}', ${pg.page - 1})" ${pg.page === 1 ? 'disabled' : ''}>‹ Prev</button>`;
  html += `<span class="page-info">Page ${pg.page} of ${totalPages} (${totalItems} items)</span>`;
  html += `<button onclick="window.crudHandlers.goToPage('${entity}', ${pg.page + 1})" ${pg.page === totalPages ? 'disabled' : ''}>Next ›</button>`;
  html += '</div>';
  
  container.innerHTML = html;
}

function goToPage(entity, page) {
  const totalItems = applyFiltersAndSort(entity).length;
  const totalPages = Math.ceil(totalItems / state.pagination[entity].pageSize);
  
  if (page < 1 || page > totalPages) return;
  
  state.pagination[entity].page = page;
  renderTable(entity);
}

function changePageSize(entity, size) {
  state.pagination[entity].pageSize = parseInt(size);
  state.pagination[entity].page = 1;
  renderTable(entity);
}

function toggleSort(entity, column) {
  const pg = state.pagination[entity];
  
  if (pg.sortBy === column) {
    pg.sortOrder = pg.sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    pg.sortBy = column;
    pg.sortOrder = 'asc';
  }
  
  renderTable(entity);
}

function openFilterModal(entity) {
  const filters = state.filters[entity];
  
  let specificFilters = '';
  
  // Entity-specific filter fields
  switch(entity) {
    case 'sales':
    case 'tours':
      specificFilters = `
        <div class="form-group">
          <label>Region</label>
          <select name="region_id">
            <option value="">Semua Region</option>
            ${state.regions.map(r => `<option value="${r.id}" ${filters.region_id == r.id ? 'selected' : ''}>${r.region_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Staff</label>
          <select name="staff_name">
            <option value="">Semua Staff</option>
            ${state.users.map(u => `<option value="${u.name}" ${filters.staff_name == u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
          </select>
        </div>
      `;
      break;
    case 'documents':
      specificFilters = `
        <div class="form-group">
          <label>Tipe Dokumen</label>
          <select name="doc_type">
            <option value="">Semua Tipe</option>
            <option value="normal" ${filters.doc_type === 'normal' ? 'selected' : ''}>Normal</option>
            <option value="kilat" ${filters.doc_type === 'kilat' ? 'selected' : ''}>Kilat</option>
          </select>
        </div>
        <div class="form-group">
          <label>Region</label>
          <select name="region_id">
            <option value="">Semua Region</option>
            ${state.regions.map(r => `<option value="${r.id}" ${filters.region_id == r.id ? 'selected' : ''}>${r.region_name}</option>`).join('')}
          </select>
        </div>
      `;
      break;
    case 'telecom':
      specificFilters = `
        <div class="form-group">
          <label>Region</label>
          <select name="region_id">
            <option value="">Semua Region</option>
            ${state.regions.map(r => `<option value="${r.id}" ${filters.region_id == r.id ? 'selected' : ''}>${r.region_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Deposit Status</label>
          <select name="deposit">
            <option value="">Semua Status</option>
            <option value="sudah" ${filters.deposit === 'sudah' ? 'selected' : ''}>Sudah</option>
            <option value="belum" ${filters.deposit === 'belum' ? 'selected' : ''}>Belum</option>
          </select>
        </div>
        <div class="form-group">
          <label>Staff</label>
          <select name="staff_name">
            <option value="">Semua Staff</option>
            ${state.users.map(u => `<option value="${u.name}" ${filters.staff_name == u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
          </select>
        </div>
      `;
      break;
    case 'users':
      specificFilters = `
        <div class="form-group">
          <label>User Type</label>
          <select name="type">
            <option value="">Semua Type</option>
            <option value="admin" ${filters.type === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="semiadmin" ${filters.type === 'semiadmin' ? 'selected' : ''}>Semi Admin</option>
            <option value="basic" ${filters.type === 'basic' ? 'selected' : ''}>Basic</option>
          </select>
        </div>
      `;
      break;
  }
  
  openModal({
    title: `Filter ${entity.charAt(0).toUpperCase() + entity.slice(1)}`,
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Search</label>
          <input type="text" name="search" value="${filters.search || ''}" placeholder="Cari...">
        </div>
        <div class="form-group">
          <label>Date From</label>
          <input type="date" name="dateFrom" value="${filters.dateFrom || ''}">
        </div>
        <div class="form-group">
          <label>Date To</label>
          <input type="date" name="dateTo" value="${filters.dateTo || ''}">
        </div>
        ${specificFilters}
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
        <button type="button" class="btn" onclick="window.crudHandlers.resetFilters('${entity}')">Reset Filters</button>
      </div>
    `,
    context: { entity, action: 'filter' }
  });
}

function resetFilters(entity) {
  state.filters[entity] = {};
  state.pagination[entity].page = 1;
  closeModal();
  renderTable(entity);
}

function applyFilterFromModal(entity, formData) {
  const filters = {};
  
  for (let [key, value] of Object.entries(formData)) {
    if (value) filters[key] = value;
  }
  
  state.filters[entity] = filters;
  state.pagination[entity].page = 1;
  renderTable(entity);
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
}

/* === DATA LOADING === */
async function loadRegions() {
  try {
    state.regions = await fetchJson('/api/regions');
    updateRegionSelects();
  } catch (err) {
    console.error('Error loading regions:', err);
  }
}

async function loadUsers() {
  try {
    state.users = await fetchJson('/api/users');
    updateStaffSelects();
  } catch (err) {
    console.error('Error loading users:', err);
    // Fallback: for basic users (403 on /api/users), populate with current user only
    try {
      const current = getCurrentUser();
      if (current?.name) {
        state.users = [{ name: current.name, username: current.username, type: current.type }];
        updateStaffSelects();
      }
    } catch {}
  }
}

function updateRegionSelects() {
  const selects = document.querySelectorAll('select[name="region_id"], #filterRegion, #globalRegion');
  selects.forEach(select => {
    const currentValue = select.value;
    const isFilter = select.id === 'filterRegion' || select.id === 'globalRegion';
    
    select.innerHTML = isFilter ? '<option value="">Semua</option>' : '<option value="">Pilih Region</option>';
    state.regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.region_name;
      select.appendChild(opt);
    });
    
    if (currentValue) select.value = currentValue;
  });
}

function updateStaffSelects() {
  const selects = document.querySelectorAll('select[name="staff_name"], #filterStaff, #globalStaff');
  selects.forEach(select => {
    const currentValue = select.value;
    const isFilter = select.id === 'filterStaff' || select.id === 'globalStaff';
    const currentUser = getCurrentUser();
    
    select.innerHTML = isFilter ? '<option value="">Semua</option>' : '<option value="">Pilih Staff</option>';
    state.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.name;
      opt.textContent = u.name;
      select.appendChild(opt);
    });
    
    if (currentValue) {
      select.value = currentValue;
    }
    // For non-filter staff selects, default to current user for basic and lock the field
    if (!isFilter && select.name === 'staff_name') {
      if (currentUser?.type === 'basic') {
        if (currentUser?.name) select.value = currentUser.name;
        select.disabled = true;
      } else {
        select.disabled = false;
      }
    }
  });
}

/* === SALES CRUD === */
function openAddSalesModal() {
  console.log('📝 Opening Add Sales Modal');
  
  openModal({
    title: 'Tambah Sales',
    bodyHtml: `
      <div class="form-group">
        <label>Tanggal Transaksi *</label>
        <input type="date" name="transaction_date" required>
      </div>
      <div class="form-group">
        <label>Invoice Number *</label>
        <input type="text" name="invoice_no" required placeholder="INV-001">
      </div>
      <div class="form-group">
        <label>Staff *</label>
        <select name="staff_name" required></select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="status">
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <div class="form-group">
        <label>Sales Amount *</label>
        <input type="number" name="sales_amount" required step="0.01" placeholder="0">
      </div>
      <div class="form-group">
        <label>Profit Amount *</label>
        <input type="number" name="profit_amount" required step="0.01" placeholder="0">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes" rows="3"></textarea>
      </div>
    `,
    context: { entity: 'sales', action: 'create' }
  });
  updateStaffSelects();
}

function openEditSalesModal(id) {
  const item = state.sales.find(s => s.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Sales',
    bodyHtml: `
      <div class="form-group">
        <label>Tanggal Transaksi *</label>
        <input type="date" name="transaction_date" value="${item.transaction_date || ''}" required>
      </div>
      <div class="form-group">
        <label>Invoice Number *</label>
        <input type="text" name="invoice_no" value="${item.invoice_no || ''}" required>
      </div>
      <div class="form-group">
        <label>Staff *</label>
        <select name="staff_name" required></select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="status">
          <option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Paid" ${item.status === 'Paid' ? 'selected' : ''}>Paid</option>
          <option value="Cancelled" ${item.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
      <div class="form-group">
        <label>Sales Amount *</label>
        <input type="number" name="sales_amount" value="${item.sales_amount || 0}" required step="0.01">
      </div>
      <div class="form-group">
        <label>Profit Amount *</label>
        <input type="number" name="profit_amount" value="${item.profit_amount || 0}" required step="0.01">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes" rows="3">${item.notes || ''}</textarea>
      </div>
    `,
    context: { entity: 'sales', action: 'update', id }
  });
  updateStaffSelects();
  setTimeout(() => {
    document.querySelector('select[name="staff_name"]').value = item.staff_name || '';
  }, 100);
}

/* === TOURS CRUD === */
function openAddTourModal() {
  openModal({
    title: 'Tambah Tour',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Registration Date *</label>
          <input type="date" name="registration_date" required>
        </div>
        <div class="form-group">
          <label>Lead Passenger *</label>
          <input type="text" name="lead_passenger" required placeholder="Nama Jamaah Utama">
        </div>
        <div class="form-group">
          <label>All Passengers</label>
          <textarea name="all_passengers" rows="2" placeholder="Semua nama peserta (pisahkan dengan koma)"></textarea>
        </div>
        <div class="form-group">
          <label>Tour Code *</label>
          <input type="text" name="tour_code" required placeholder="TRV-001">
        </div>
        <div class="form-group">
          <label>Region *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Departure Date *</label>
          <input type="date" name="departure_date" required>
        </div>
        <div class="form-group">
          <label>Booking Code</label>
          <input type="text" name="booking_code" placeholder="BKG-001">
        </div>
        <div class="form-group">
          <label>Tour Price</label>
          <input type="number" name="tour_price" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Sales Amount</label>
          <input type="number" name="sales_amount" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Profit Amount</label>
          <input type="number" name="profit_amount" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Jumlah Peserta *</label>
          <input type="number" name="jumlah_peserta" required min="1" value="1">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" placeholder="+62xxx">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" placeholder="email@example.com">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select name="status">
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <div class="form-group">
          <label>Link Pelunasan Tour</label>
          <input type="url" name="link_pelunasan_tour" placeholder="https://">
        </div>
      </div>
    `,
    context: { entity: 'tours', action: 'create' }
  });
  updateRegionSelects();
  updateStaffSelects();
}

function openEditTourModal(id) {
  const item = state.tours.find(t => t.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Tour',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Registration Date *</label>
          <input type="date" name="registration_date" value="${item.registration_date || ''}" required>
        </div>
        <div class="form-group">
          <label>Lead Passenger *</label>
          <input type="text" name="lead_passenger" value="${item.lead_passenger || ''}" required>
        </div>
        <div class="form-group">
          <label>All Passengers</label>
          <textarea name="all_passengers" rows="2">${item.all_passengers || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Tour Code *</label>
          <input type="text" name="tour_code" value="${item.tour_code || ''}" required>
        </div>
        <div class="form-group">
          <label>Region *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Departure Date *</label>
          <input type="date" name="departure_date" value="${item.departure_date || ''}" required>
        </div>
        <div class="form-group">
          <label>Booking Code</label>
          <input type="text" name="booking_code" value="${item.booking_code || ''}">
        </div>
        <div class="form-group">
          <label>Tour Price</label>
          <input type="number" name="tour_price" value="${item.tour_price || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Sales Amount</label>
          <input type="number" name="sales_amount" value="${item.sales_amount || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Profit Amount</label>
          <input type="number" name="profit_amount" value="${item.profit_amount || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Jumlah Peserta *</label>
          <input type="number" name="jumlah_peserta" value="${item.jumlah_peserta || 1}" required min="1">
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
          <label>Status</label>
          <select name="status">
            <option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Confirmed" ${item.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="Completed" ${item.status === 'Completed' ? 'selected' : ''}>Completed</option>
            <option value="Cancelled" ${item.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        <div class="form-group">
          <label>Link Pelunasan Tour</label>
          <input type="url" name="link_pelunasan_tour" value="${item.link_pelunasan_tour || ''}">
        </div>
      </div>
    `,
    context: { entity: 'tours', action: 'update', id }
  });
  updateRegionSelects();
  updateStaffSelects();
  setTimeout(() => {
    document.querySelector('select[name="region_id"]').value = item.region_id || '';
    document.querySelector('select[name="staff_name"]').value = item.staff_name || '';
  }, 100);
}

/* === DOCUMENTS CRUD === */
function openAddDocModal() {
  openModal({
    title: 'Tambah Dokumen',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Receive Date *</label>
          <input type="date" name="receive_date" required>
        </div>
        <div class="form-group">
          <label>Send Date</label>
          <input type="date" name="send_date">
        </div>
        <div class="form-group">
          <label>Guest Name *</label>
          <input type="text" name="guest_name" required placeholder="Nama Tamu">
        </div>
        <div class="form-group">
          <label>Passport Country</label>
          <input type="text" name="passport_country" placeholder="Indonesia">
        </div>
        <div class="form-group">
          <label>Process Type *</label>
          <select name="process_type" required>
            <option value="">Pilih Proses</option>
            <option value="Normal">Normal</option>
            <option value="Kilat">Kilat</option>
          </select>
        </div>
        <div class="form-group">
          <label>Booking Code</label>
          <input type="text" name="booking_code" placeholder="BKG-001">
        </div>
        <div class="form-group">
          <label>Invoice Number</label>
          <input type="text" name="invoice_number" placeholder="INV-001">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" placeholder="+62xxx">
        </div>
        <div class="form-group">
          <label>Estimated Done</label>
          <input type="date" name="estimated_done">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Tour Code</label>
          <input type="text" name="tour_code" placeholder="TRV-001">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="notes" rows="3"></textarea>
        </div>
      </div>
    `,
    context: { entity: 'documents', action: 'create' }
  });
  updateStaffSelects();
}

function openEditDocModal(id) {
  const item = state.documents.find(d => d.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Dokumen',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Receive Date *</label>
          <input type="date" name="receive_date" value="${item.receive_date || ''}" required>
        </div>
        <div class="form-group">
          <label>Send Date</label>
          <input type="date" name="send_date" value="${item.send_date || ''}">
        </div>
        <div class="form-group">
          <label>Guest Name *</label>
          <input type="text" name="guest_name" value="${item.guest_name || ''}" required>
        </div>
        <div class="form-group">
          <label>Passport Country</label>
          <input type="text" name="passport_country" value="${item.passport_country || ''}">
        </div>
        <div class="form-group">
          <label>Process Type *</label>
          <select name="process_type" required>
            <option value="Normal" ${item.process_type === 'Normal' ? 'selected' : ''}>Normal</option>
            <option value="Kilat" ${item.process_type === 'Kilat' ? 'selected' : ''}>Kilat</option>
          </select>
        </div>
        <div class="form-group">
          <label>Booking Code</label>
          <input type="text" name="booking_code" value="${item.booking_code || ''}">
        </div>
        <div class="form-group">
          <label>Invoice Number</label>
          <input type="text" name="invoice_number" value="${item.invoice_number || ''}">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" value="${item.phone_number || ''}">
        </div>
        <div class="form-group">
          <label>Estimated Done</label>
          <input type="date" name="estimated_done" value="${item.estimated_done || ''}">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Tour Code</label>
          <input type="text" name="tour_code" value="${item.tour_code || ''}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="notes" rows="3">${item.notes || ''}</textarea>
        </div>
      </div>
    `,
    context: { entity: 'documents', action: 'update', id }
  });
  updateStaffSelects();
  setTimeout(() => {
    document.querySelector('select[name="staff_name"]').value = item.staff_name || '';
  }, 100);
}

/* === TARGETS CRUD === */
function openAddTargetModal() {
  openModal({
    title: 'Tambah Target',
    bodyHtml: `
      <div class="form-group">
        <label>Bulan *</label>
        <select name="month" required>
          <option value="">Pilih Bulan</option>
          <option value="1">Januari</option>
          <option value="2">Februari</option>
          <option value="3">Maret</option>
          <option value="4">April</option>
          <option value="5">Mei</option>
          <option value="6">Juni</option>
          <option value="7">Juli</option>
          <option value="8">Agustus</option>
          <option value="9">September</option>
          <option value="10">Oktober</option>
          <option value="11">November</option>
          <option value="12">Desember</option>
        </select>
      </div>
      <div class="form-group">
        <label>Tahun *</label>
        <input type="number" name="year" required min="2000" max="2100" value="${new Date().getFullYear()}">
      </div>
      <div class="form-group">
        <label>Staff *</label>
        <select name="staff_name" required></select>
      </div>
      <div class="form-group">
        <label>Target Sales *</label>
        <input type="number" name="target_sales" required step="0.01" placeholder="0">
      </div>
      <div class="form-group">
        <label>Target Profit *</label>
        <input type="number" name="target_profit" required step="0.01" placeholder="0">
      </div>
    `,
    context: { entity: 'targets', action: 'create' }
  });
  updateStaffSelects();
}

function openEditTargetModal(id) {
  const item = state.targets.find(t => t.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Target',
    bodyHtml: `
      <div class="form-group">
        <label>Bulan *</label>
        <select name="month" required>
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
            const names = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
            return `<option value="${m}" ${item.month == m ? 'selected' : ''}>${names[m]}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Tahun *</label>
        <input type="number" name="year" value="${item.year || new Date().getFullYear()}" required min="2000" max="2100">
      </div>
      <div class="form-group">
        <label>Staff *</label>
        <select name="staff_name" required></select>
      </div>
      <div class="form-group">
        <label>Target Sales *</label>
        <input type="number" name="target_sales" value="${item.target_sales || 0}" required step="0.01">
      </div>
      <div class="form-group">
        <label>Target Profit *</label>
        <input type="number" name="target_profit" value="${item.target_profit || 0}" required step="0.01">
      </div>
    `,
    context: { entity: 'targets', action: 'update', id }
  });
  updateStaffSelects();
  setTimeout(() => {
    document.querySelector('select[name="staff_name"]').value = item.staff_name || '';
  }, 100);
}

/* === REGIONS CRUD === */
function openAddRegionModal() {
  openModal({
    title: 'Tambah Region',
    bodyHtml: `
      <div class="form-group">
        <label>Nama Region *</label>
        <input type="text" name="region_name" required placeholder="Contoh: Asia, Europe, Africa">
      </div>
    `,
    context: { entity: 'regions', action: 'create' }
  });
}

function openEditRegionModal(id) {
  const item = state.regions.find(r => r.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Region',
    bodyHtml: `
      <div class="form-group">
        <label>Nama Region *</label>
        <input type="text" name="region_name" value="${item.region_name || ''}" required>
      </div>
    `,
    context: { entity: 'regions', action: 'update', id }
  });
}

/* === USERS CRUD === */
function openAddUserModal() {
  openModal({
    title: 'Tambah User',
    bodyHtml: `
      <div class="form-group">
        <label>Username *</label>
        <input type="text" name="username" required placeholder="username">
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" required placeholder="Full Name">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label>Password *</label>
        <input type="password" name="password" required placeholder="Minimal 6 karakter">
      </div>
      <div class="form-group">
        <label>Type *</label>
        <select name="type" required>
          <option value="basic">Basic</option>
          <option value="semiadmin">Semi Admin</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    `,
    context: { entity: 'users', action: 'create' }
  });
}

function openEditUserModal(id) {
  const item = state.users.find(u => u.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit User',
    bodyHtml: `
      <div class="form-group">
        <label>Username *</label>
        <input type="text" name="username" value="${item.username || ''}" required readonly>
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" value="${item.name || ''}" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${item.email || ''}">
      </div>
      <div class="form-group">
        <label>Type *</label>
        <select name="type" required>
          <option value="basic" ${item.type === 'basic' ? 'selected' : ''}>Basic</option>
          <option value="semiadmin" ${item.type === 'semiadmin' ? 'selected' : ''}>Semi Admin</option>
          <option value="admin" ${item.type === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label>Password Baru (kosongkan jika tidak diubah)</label>
        <input type="password" name="password" placeholder="Minimal 6 karakter">
      </div>
    `,
    context: { entity: 'users', action: 'update', id }
  });
}

/* === USERS: RESET PASSWORD === */
function openResetUserModal(username) {
  openModal({
    title: `Reset Password — ${username}`,
    size: 'small',
    bodyHtml: `
      <div class="form-group">
        <label>Password Baru *</label>
        <input type="password" name="password" required minlength="6" placeholder="Minimal 6 karakter">
      </div>
      <div class="form-group">
        <label>Konfirmasi Password *</label>
        <input type="password" name="password_confirm" required minlength="6" placeholder="Ulangi password">
      </div>
    `,
    context: { entity: 'users', action: 'reset', username }
  });
}

/* === TELECOM CRUD === */
function openAddTelecomModal() {
  openModal({
    title: 'Tambah Telecom',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Nama *</label>
          <input type="text" name="nama" required placeholder="Nama">
        </div>
        <div class="form-group">
          <label>No Telephone *</label>
          <input type="tel" name="no_telephone" required placeholder="+62xxx">
        </div>
        <div class="form-group">
          <label>Type Product</label>
          <input type="text" name="type_product" placeholder="Jenis Produk">
        </div>
        <div class="form-group">
          <label>Negara *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Tanggal Mulai *</label>
          <input type="date" name="tanggal_mulai" required>
        </div>
        <div class="form-group">
          <label>Tanggal Selesai</label>
          <input type="date" name="tanggal_selesai">
        </div>
        <div class="form-group">
          <label>No Rekening</label>
          <input type="text" name="no_rekening" placeholder="1234567890">
        </div>
        <div class="form-group">
          <label>Bank</label>
          <input type="text" name="bank" placeholder="Nama Bank">
        </div>
        <div class="form-group">
          <label>Nama Rekening</label>
          <input type="text" name="nama_rekening" placeholder="Nama Pemilik Rekening">
        </div>
        <div class="form-group">
          <label>Estimasi Pengambilan</label>
          <input type="date" name="estimasi_pengambilan">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Deposit *</label>
          <select name="deposit" required>
            <option value="">Pilih Status</option>
            <option value="sudah">Sudah</option>
            <option value="belum">Belum</option>
          </select>
        </div>
        <div class="form-group">
          <label>Jumlah Deposit</label>
          <input type="number" name="jumlah_deposit" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Tanggal Pengambilan</label>
          <input type="date" name="tanggal_pengambilan">
        </div>
        <div class="form-group">
          <label>Tanggal Pengembalian</label>
          <input type="date" name="tanggal_pengembalian">
        </div>
      </div>
    `,
    context: { entity: 'telecom', action: 'create' }
  });
  updateRegionSelects();
  updateStaffSelects();
}

function openEditTelecomModal(id) {
  const item = state.telecom.find(t => t.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Telecom',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Nama *</label>
          <input type="text" name="nama" value="${item.nama || ''}" required>
        </div>
        <div class="form-group">
          <label>No Telephone *</label>
          <input type="tel" name="no_telephone" value="${item.no_telephone || ''}" required>
        </div>
        <div class="form-group">
          <label>Type Product</label>
          <input type="text" name="type_product" value="${item.type_product || ''}" placeholder="Jenis Produk">
        </div>
        <div class="form-group">
          <label>Negara *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Tanggal Mulai *</label>
          <input type="date" name="tanggal_mulai" value="${item.tanggal_mulai || ''}" required>
        </div>
        <div class="form-group">
          <label>Tanggal Selesai</label>
          <input type="date" name="tanggal_selesai" value="${item.tanggal_selesai || ''}">
        </div>
        <div class="form-group">
          <label>No Rekening</label>
          <input type="text" name="no_rekening" value="${item.no_rekening || ''}">
        </div>
        <div class="form-group">
          <label>Bank</label>
          <input type="text" name="bank" value="${item.bank || ''}">
        </div>
        <div class="form-group">
          <label>Nama Rekening</label>
          <input type="text" name="nama_rekening" value="${item.nama_rekening || ''}">
        </div>
        <div class="form-group">
          <label>Estimasi Pengambilan</label>
          <input type="date" name="estimasi_pengambilan" value="${item.estimasi_pengambilan || ''}">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Deposit *</label>
          <select name="deposit" required>
            <option value="sudah" ${item.deposit === 'sudah' ? 'selected' : ''}>Sudah</option>
            <option value="belum" ${item.deposit === 'belum' ? 'selected' : ''}>Belum</option>
          </select>
        </div>
        <div class="form-group">
          <label>Jumlah Deposit</label>
          <input type="number" name="jumlah_deposit" value="${item.jumlah_deposit || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Tanggal Pengambilan</label>
          <input type="date" name="tanggal_pengambilan" value="${item.tanggal_pengambilan || ''}">
        </div>
        <div class="form-group">
          <label>Tanggal Pengembalian</label>
          <input type="date" name="tanggal_pengembalian" value="${item.tanggal_pengembalian || ''}">
        </div>
      </div>
    `,
    context: { entity: 'telecom', action: 'update', id }
  });
  updateRegionSelects();
  updateStaffSelects();
  setTimeout(() => {
    document.querySelector('select[name="region_id"]').value = item.region_id || '';
    document.querySelector('select[name="staff_name"]').value = item.staff_name || '';
  }, 100);
}

/* === DELETE HANDLER === */
async function deleteItem(entity, id) {
  if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
  
  try {
    await fetchJson(`/api/${entity}/${id}`, { method: 'DELETE' });
    alert('Data berhasil dihapus');
    await loadData(entity);
    renderTable(entity);
  } catch (err) {
    alert('Gagal menghapus data: ' + err.message);
  }
}

/* === FORM SUBMIT HANDLER === */
async function handleModalSubmit(formData, context) {
  const { entity, action, id } = context;
  
    // Handle filter modal submission
    if (action === 'filter') {
      applyFilterFromModal(entity, formData);
      return true;
    }
  
  // Remove empty password field for user updates
  if (entity === 'users' && action === 'update' && !formData.password) {
    delete formData.password;
  }
  
  // Remove username from update (readonly)
  if (entity === 'users' && action === 'update') {
    delete formData.username;
  }
  
  try {
    // Handle reset password
    if (entity === 'users' && action === 'reset') {
      if (!formData.password || formData.password.length < 6) {
        throw new Error('Password minimal 6 karakter');
      }
      if (formData.password !== formData.password_confirm) {
        throw new Error('Password konfirmasi tidak sama');
      }
      await fetchJson(`/api/users/${context.username}/reset`, {
        method: 'POST',
        body: { password: formData.password }
      });
      alert('Password berhasil direset');
      return true;
    }

    if (action === 'create') {
      await fetchJson(`/api/${entity}`, {
        method: 'POST',
        body: formData
      });
      alert('Data berhasil ditambahkan');
    } else if (action === 'update') {
      await fetchJson(`/api/${entity}/${id}`, {
        method: 'PUT',
        body: formData
      });
      alert('Data berhasil diperbarui');
    }
    
    // Reload data
    await loadData(entity);
    
    // Refresh table if we're on that section
    const activeSection = document.querySelector('.section.active');
    if (activeSection && activeSection.id === entity) {
      renderTable(entity);
    }
    
    // Reload regions/users if those were updated
    if (entity === 'regions') await loadRegions();
    if (entity === 'users') await loadUsers();
    
    return true;
  } catch (err) {
    throw new Error(err.message || 'Gagal menyimpan data');
  }
}

/* === LOAD DATA === */
async function loadData(entity) {
  try {
    state[entity] = await fetchJson(`/api/${entity}`);
  } catch (err) {
    console.error(`Error loading ${entity}:`, err);
  }
}

/* === RENDER TABLES === */
function renderTable(entity) {
  const tableId = `tbl${entity.charAt(0).toUpperCase() + entity.slice(1).replace(/s$/, '')}${entity.endsWith('s') ? '' : 's'}`;
  
  switch(entity) {
    case 'sales':
      renderSalesTable();
      break;
    case 'tours':
      renderToursTable();
      break;
    case 'documents':
      renderDocsTable();
      break;
    case 'targets':
      renderTargetsTable();
      break;
    case 'regions':
      renderRegionsTable();
      break;
    case 'users':
      renderUsersTable();
      break;
    case 'telecom':
      renderTelecomTable();
      break;
  }
}

function renderSalesTable() {
  const tbody = document.getElementById('tblSales');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('sales');
  const paginated = paginateData('sales', filtered);
  const current = getCurrentUser();
  const isBasic = current.type === 'basic';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Tidak ada data</td></tr>';
    renderPagination('sales', 0);
    return;
  }
  
  tbody.innerHTML = paginated.map(item => {
    const owned = item.staff_name && item.staff_name === current.name;
    let actions = '';
    if (isBasic && !owned) {
      actions += `<button class=\"btn-action view\" onclick=\"openViewItem('sales',${item.id})\">View</button>`;
    } else {
      actions += `<button class=\"btn-action edit\" onclick=\"editSales(${item.id})\">Edit</button>`;
    }
    if (!isBasic) {
      actions += ` <button class=\"btn-action delete\" onclick=\"deleteItem('sales', ${item.id})\">Delete</button>`;
    }
    return `
    <tr>
      <td>${item.transaction_date || '-'}</td>
      <td>${item.invoice_no || '-'}</td>
      <td>${item.staff_name || '-'}</td>
      <td>${formatCurrency(item.sales_amount)}</td>
      <td>${formatCurrency(item.profit_amount)}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  
  renderPagination('sales', filtered.length);
}

function renderToursTable() {
  const tbody = document.getElementById('tblTours');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('tours');
  const paginated = paginateData('tours', filtered);
  const current = getCurrentUser();
  const isBasic = current.type === 'basic';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">Tidak ada data</td></tr>';
    renderPagination('tours', 0);
    return;
  }
  
  tbody.innerHTML = paginated.map(item => {
    const region = state.regions.find(r => r.id === item.region_id);
    const owned = item.staff_name && item.staff_name === current.name;
    let actions = '';
    if (isBasic && !owned) {
      actions += `<button class=\"btn-action view\" onclick=\"openViewItem('tours',${item.id})\">View</button>`;
    } else {
      actions += `<button class=\"btn-action edit\" onclick=\"editTour(${item.id})\">Edit</button>`;
    }
    if (!isBasic) {
      actions += ` <button class=\"btn-action delete\" onclick=\"deleteItem('tours', ${item.id})\">Delete</button>`;
    }
    return `
      <tr>
        <td>${item.registration_date || '-'}</td>
        <td>${item.tour_code || '-'}</td>
        <td>${item.jumlah_peserta || 0}</td>
        <td>${item.departure_date || '-'}</td>
        <td>${region ? region.region_name : '-'}</td>
        <td>${item.staff_name || '-'}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
  
  renderPagination('tours', filtered.length);
}

function renderDocsTable() {
  const tbody = document.getElementById('tblDocs');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('documents');
  const paginated = paginateData('documents', filtered);
  const current = getCurrentUser();
  const isBasic = current.type === 'basic';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Tidak ada data</td></tr>';
    renderPagination('documents', 0);
    return;
  }
  
  tbody.innerHTML = paginated.map(item => `
    <tr>
      <td>${item.receive_date || '-'}</td>
      <td>${item.guest_name || '-'}</td>
      <td>${item.process_type ? (item.process_type === 'Kilat' 
        ? '<span class="badge badge-warning">Kilat</span>' 
        : '<span class="badge badge-info">Normal</span>') : '-'}</td>
      <td>${item.staff_name || '-'}</td>
      <td>${(() => {
        const owned = item.staff_name && item.staff_name === current.name;
  if (isBasic && !owned) return `<button class=\"btn-action view\" onclick=\"openViewItem('documents',${item.id})\">View</button>`;
        let a = `<button class=\"btn-action edit\" onclick=\"editDoc(${item.id})\">Edit</button>`;
        if (!isBasic) a += ` <button class=\"btn-action delete\" onclick=\"deleteItem('documents', ${item.id})\">Delete</button>`;
        return a;
      })()}</td>
    </tr>
  `).join('');
  
  renderPagination('documents', filtered.length);
}

function renderTargetsTable() {
  const tbody = document.getElementById('tblTargets');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('targets');
  const paginated = paginateData('targets', filtered);
  const current = getCurrentUser();
  const isBasic = current.type === 'basic';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Tidak ada data</td></tr>';
    renderPagination('targets', 0);
    return;
  }
  
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  tbody.innerHTML = paginated.map(item => `
    <tr>
      <td>${monthNames[item.month] || '-'}</td>
      <td>${item.year || '-'}</td>
      <td>${item.staff_name || '-'}</td>
      <td>${formatCurrency(item.target_sales)}</td>
      <td>${formatCurrency(item.target_profit)}</td>
      <td>${(() => {
        const owned = item.staff_name && item.staff_name === current.name;
  if (isBasic && !owned) return `<button class=\"btn-action view\" onclick=\"openViewItem('targets',${item.id})\">View</button>`;
        let a = `<button class=\"btn-action edit\" onclick=\"editTarget(${item.id})\">Edit</button>`;
        if (!isBasic) a += ` <button class=\"btn-action delete\" onclick=\"deleteItem('targets', ${item.id})\">Delete</button>`;
        return a;
      })()}</td>
    </tr>
  `).join('');
  
  renderPagination('targets', filtered.length);
}

function renderRegionsTable() {
  const tbody = document.getElementById('tblRegions');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('regions');
  const paginated = paginateData('regions', filtered);
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">Tidak ada data</td></tr>';
    renderPagination('regions', 0);
    return;
  }
  
  tbody.innerHTML = paginated.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>${item.region_name || '-'}</td>
      <td>
        <button class="btn-action edit" onclick="editRegion(${item.id})">Edit</button>
        <button class="btn-action delete" onclick="deleteItem('regions', ${item.id})">Delete</button>
      </td>
    </tr>
  `).join('');
  
  renderPagination('regions', filtered.length);
}

function renderUsersTable() {
  const tbody = document.getElementById('tblUsers');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('users');
  const paginated = paginateData('users', filtered);
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Tidak ada data</td></tr>';
    renderPagination('users', 0);
    return;
  }
  const current = getCurrentUser();
  const isAdmin = current.type === 'admin';

  tbody.innerHTML = paginated.map(item => `
    <tr>
      <td>${item.username || '-'}</td>
      <td>${item.name || '-'}</td>
      <td>${item.type ? (item.type === 'admin'
        ? '<span class="badge badge-primary">Admin</span>'
        : item.type === 'semiadmin'
          ? '<span class="badge badge-warning">Semi Admin</span>'
          : '<span class="badge badge-info">Basic</span>') : '-'}</td>
      <td>
        <button class="btn-action edit" onclick="editUser(${item.id})">Edit</button>
        <button class="btn-action delete" onclick="deleteItem('users', ${item.id})">Delete</button>
        ${isAdmin ? `<button class=\"btn-action reset\" onclick=\"window.crudHandlers.openResetUserModal('${item.username}')\">Reset</button>` : ''}
      </td>
    </tr>
  `).join('');
  
  renderPagination('users', filtered.length);
}

function renderTelecomTable() {
  const tbody = document.getElementById('tblTelecom');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('telecom');
  const paginated = paginateData('telecom', filtered);
  const current = getCurrentUser();
  const isBasic = current.type === 'basic';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">Tidak ada data</td></tr>';
    renderPagination('telecom', 0);
    return;
  }
  
  tbody.innerHTML = paginated.map(item => {
    const region = state.regions.find(r => r.id === item.region_id);
    const owned = item.staff_name && item.staff_name === current.name;
    let actions = '';
    if (isBasic && !owned) {
      actions += `<button class=\"btn-action view\" onclick=\"openViewItem('telecom',${item.id})\">View</button>`;
    } else {
      actions += `<button class=\"btn-action edit\" onclick=\"editTelecom(${item.id})\">Edit</button>`;
    }
    if (!isBasic) {
      actions += ` <button class=\"btn-action delete\" onclick=\"deleteItem('telecom', ${item.id})\">Delete</button>`;
    }
    return `
      <tr>
        <td>${item.nama || '-'}</td>
        <td>${item.no_telephone || '-'}</td>
        <td>${item.type_product || '-'}</td>
        <td>${region ? region.region_name : '-'}</td>
        <td>${item.tanggal_mulai || '-'}</td>
        <td>${item.tanggal_selesai || '-'}</td>
        <td>${item.staff_name || '-'}</td>
        <td>${item.deposit ? (item.deposit === 'sudah' 
          ? '<span class="badge badge-success">Sudah</span>' 
          : '<span class="badge badge-warning">Belum</span>') : '-'}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
  
  renderPagination('telecom', filtered.length);
}

/* === INITIALIZE === */
async function init() {
  console.log('🔄 Initializing CRUD handlers...');
  
  try {
    await Promise.all([
      loadRegions(),
      loadUsers(),
      loadData('sales'),
      loadData('tours'),
      loadData('documents'),
      loadData('targets'),
      loadData('telecom')
    ]);
    
    console.log('✅ Data loaded:', {
      regions: state.regions.length,
      users: state.users.length,
      sales: state.sales.length,
      tours: state.tours.length,
      documents: state.documents.length,
      targets: state.targets.length,
      telecom: state.telecom.length
    });
    
    // Render all tables
    renderSalesTable();
    renderToursTable();
    renderDocsTable();
    renderTargetsTable();
    renderRegionsTable();
    renderUsersTable();
    renderTelecomTable();
    
    console.log('✅ All tables rendered');

      // Attach sortable header listeners (delegated)
      document.addEventListener('click', (e) => {
        const th = e.target.closest('th.sortable');
        if (!th) return;
        const table = th.closest('table');
        if (!table) return;
        const section = th.closest('.section');
        if (!section) return;
        const entity = section.id;
        const column = th.getAttribute('data-column');
        if (!column) return;
        toggleSort(entity, column);
        updateSortIndicators(entity);
      });
      updateAllSortIndicators();
  } catch (err) {
    console.error('❌ Error initializing CRUD handlers:', err);
  }
}

  // Update sort indicators
  function updateAllSortIndicators() {
    ['sales','tours','documents','targets','regions','users','telecom'].forEach(updateSortIndicators);
  }

  function updateSortIndicators(entity) {
    const pg = state.pagination[entity];
    const section = document.getElementById(entity);
    if (!section) return;
    section.querySelectorAll('th.sortable').forEach(th => {
      const col = th.getAttribute('data-column');
      th.classList.remove('sorted-asc','sorted-desc');
      if (pg.sortBy === col) {
        th.classList.add(pg.sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  }

// Export functions to global scope
window.crudHandlers = {
  openAddSalesModal,
  openEditSalesModal,
  openAddTourModal,
  openEditTourModal,
  openAddDocModal,
  openEditDocModal,
  openAddTargetModal,
  openEditTargetModal,
  openAddRegionModal,
  openEditRegionModal,
  openAddUserModal,
  openEditUserModal,
  openResetUserModal,
  openAddTelecomModal,
  openEditTelecomModal,
  deleteItem,
  handleModalSubmit,
  init,
  state,
  renderTable,
  loadData,
  goToPage,
  changePageSize,
  toggleSort,
  openFilterModal,
  resetFilters,
  applyFilterFromModal
};

// === VIEW-ONLY MODAL ===
function openViewItem(entity, id) {
  const item = state[entity].find(r => r.id === id);
  if (!item) { alert('Data tidak ditemukan'); return; }
  const rows = Object.entries(item)
    .filter(([k]) => !['password'].includes(k))
    .map(([k,v]) => `<tr><th style=\"text-align:left;padding:6px 10px;background:#f3f4f6;width:160px;font-weight:600;text-transform:capitalize\">${k.replace(/_/g,' ')}</th><td style=\"padding:6px 10px\">${v ?? '-'}</td></tr>`)
    .join('');
  openModal({
    title: `Detail ${entity} #${id}`,
    size: 'medium',
    bodyHtml: `<div style=\"max-height:60vh;overflow:auto\"><table style=\"width:100%;border-collapse:collapse;font-size:14px\">${rows}</table></div>`,
    context: { entity, action: 'view', id }
  });
}
window.openViewItem = openViewItem;

// === EXPORT FILTERED DATA TO CSV ===
function exportCsv(entity) {
  const filtered = applyFiltersAndSort(entity);
  if (!filtered.length) {
    alert('Tidak ada data untuk diexport');
    return;
  }
  const headers = Object.keys(filtered[0]).filter(k => !['password'].includes(k));
  const rows = filtered.map(item => headers.map(h => JSON.stringify(item[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entity}-export.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Wire export buttons after init renders
document.addEventListener('DOMContentLoaded', () => {
  const map = {
    exportSales: 'sales',
    exportTours: 'tours',
    exportDocs: 'documents',
    exportTargets: 'targets',
    exportTelecom: 'telecom',
    exportRegions: 'regions',
    exportUsers: 'users'
  };
  Object.entries(map).forEach(([btnId, entity]) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', () => exportCsv(entity));
  });
});

