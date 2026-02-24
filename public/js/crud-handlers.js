/* =========================================================
   CRUD HANDLERS FOR ALL ENTITIES
   ========================================================= */

// NOTE: Do NOT re-declare globals exported by dashboard.js (fetchJson, openModal, formatCurrency)
// Doing so with const causes "Identifier 'fetchJson' has already been declared" errors.
// We simply reference the existing global functions directly.

// Submission protection flags
let isSubmitting = false;
// XSS helper — uses global escapeHtml from auth-common.js with local fallback
const esc = (v) => window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let lastSubmitTime = 0;
const SUBMIT_COOLDOWN = 2000; // 2 seconds cooldown between submissions

// Global state
let state = {
  regions: [],
  users: [],
  sales: [],
  tours: [],
  documents: [],
  targets: [],
  telecom: [],
  hotel_bookings: [],
  // Pagination & filtering state
  pagination: {
    sales: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    tours: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    documents: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    targets: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    regions: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    users: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    telecom: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' },
    hotel_bookings: { page: 1, pageSize: 10, sortBy: null, sortOrder: 'asc' }
  },
  filters: {
    sales: {},
    tours: {},
    documents: {},
    targets: {},
    regions: {},
    users: {},
    telecom: {},
    hotel_bookings: {}
  },
  // Selected items for bulk actions
  selected: {
    sales: new Set(),
    tours: new Set(),
    documents: new Set(),
    targets: new Set(),
    regions: new Set(),
    users: new Set(),
    telecom: new Set(),
    hotel_bookings: new Set()
  }
};

// Helper: ensure date value is YYYY-MM-DD (handles ISO strings with time)
function formatDateValue(v) {
  if (!v) return '';
  if (typeof v === 'string' && v.length >= 10) return v.slice(0,10);
  return v;
}

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
  const getDateRangeStart = (it) => {
    switch(entity) {
      case 'sales': return it.transaction_date;
      case 'tours': return it.registration_date || it.departure_date;
      case 'documents': return it.receive_date || it.send_date;
      case 'telecom': return it.tanggal_mulai;
      case 'hotel_bookings': return it.check_in;
      case 'targets': return null; // no date filtering
      default: return it.created_at || it.tanggal_mulai || it.tanggal;
    }
  };
  const getDateRangeEnd = (it) => {
    switch(entity) {
      case 'sales': return it.transaction_date;
      case 'tours': return it.departure_date || it.registration_date;
      case 'documents': return it.send_date || it.receive_date;
      case 'telecom': return it.tanggal_selesai || it.tanggal_mulai;
      case 'hotel_bookings': return it.check_out || it.check_in;
      case 'targets': return null;
      default: return it.created_at || it.tanggal_selesai || it.tanggal;
    }
  };
  if (filters.dateFrom) {
    data = data.filter(it => {
      const start = getDateRangeStart(it);
      return !start || start >= filters.dateFrom ? true : false;
    });
  }
  if (filters.dateTo) {
    data = data.filter(it => {
      const end = getDateRangeEnd(it);
      return !end || end <= filters.dateTo ? true : false;
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
  html += `<button data-pagination-entity="${entity}" data-pagination-page="${pg.page - 1}" ${pg.page === 1 ? 'disabled' : ''}>‹ Prev</button>`;
  html += `<span class="page-info">Page ${pg.page} of ${totalPages} (${totalItems} items)</span>`;
  html += `<button data-pagination-entity="${entity}" data-pagination-page="${pg.page + 1}" ${pg.page === totalPages ? 'disabled' : ''}>Next ›</button>`;
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
            ${state.regions.map(r => `<option value="${r.id}" ${filters.region_id == r.id ? 'selected' : ''}>${esc(r.region_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Staff</label>
          <select name="staff_name">
            <option value="">Semua Staff</option>
            ${state.users.map(u => `<option value="${esc(u.name)}" ${filters.staff_name == u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
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
            ${state.regions.map(r => `<option value="${r.id}" ${filters.region_id == r.id ? 'selected' : ''}>${esc(r.region_name)}</option>`).join('')}
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
            ${state.regions.map(r => `<option value="${r.id}" ${filters.region_id == r.id ? 'selected' : ''}>${esc(r.region_name)}</option>`).join('')}
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
            ${state.users.map(u => `<option value="${esc(u.name)}" ${filters.staff_name == u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
          </select>
        </div>
      `;
      break;
    case 'hotel_bookings':
      specificFilters = `
        <div class="form-group">
          <label>Region</label>
          <select name="region_id">
            <option value="">Semua Region</option>
            ${state.regions.map(r => `<option value="${r.id}" ${filters.region_id == r.id ? 'selected' : ''}>${esc(r.region_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Staff</label>
          <select name="staff_name">
            <option value="">Semua Staff</option>
            ${state.users.map(u => `<option value="${esc(u.name)}" ${filters.staff_name == u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
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
          <input type="text" name="search" value="${esc(filters.search) || ''}" placeholder="Cari...">
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
        <button type="button" class="btn" data-reset-filters="${entity}">Reset Filters</button>
      </div>
    `,
    context: { entity, action: 'filter' }
  });
}

function resetFilters(entity) {
  state.filters[entity] = {};
  state.pagination[entity].page = 1;
  // Use global closeModal from dashboard.js; this local helper was shadowing
  if (window.closeModal) window.closeModal();
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

// Align closeModal with dashboard.js implementation to avoid inline style conflicts
// Removed local closeModal wrapper to avoid shadowing dashboard.js implementation.

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
  const current = getCurrentUser();
  
  // Basic users can't access /api/users - skip the call entirely
  if (current?.type === 'basic') {
    state.users = [{ name: current.name || current.username, username: current.username, type: current.type }];
    updateStaffSelects();
    return;
  }
  
  try {
    state.users = await fetchJson('/api/users');
    updateStaffSelects();
  } catch (err) {
    console.warn('Could not load users list:', err.message);
    // Fallback to current user
    if (current?.name) {
      state.users = [{ name: current.name, username: current.username, type: current.type }];
      updateStaffSelects();
    }
  }
}

function updateRegionSelects() {
  const selects = document.querySelectorAll('select[name="region_id"], select[name="passport_country"], #filterRegion, #globalRegion');
  selects.forEach(select => {
    const currentValue = select.value;
    const isFilter = select.id === 'filterRegion' || select.id === 'globalRegion';
    const isPassport = select.name === 'passport_country';
    
    select.innerHTML = isFilter ? '<option value="">Semua</option>' : 
                       isPassport ? '<option value="">Pilih Negara</option>' :
                       '<option value="">Pilih Region</option>';
    state.regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = isPassport ? r.region_name : r.id;
      opt.textContent = r.region_name;
      select.appendChild(opt);
    });
    
    if (currentValue) select.value = currentValue;
    
    // Make select searchable by adding data-searchable attribute
    if (!select.hasAttribute('data-searchable-initialized')) {
      makeSelectSearchable(select);
      select.setAttribute('data-searchable-initialized', 'true');
    }
  });
}

function makeSelectSearchable(selectElement) {
  // Add autocomplete attribute for better UX
  selectElement.setAttribute('autocomplete', 'off');
  
  // Listen for keydown events to enable type-to-search
  let searchBuffer = '';
  let searchTimeout = null;
  
  selectElement.addEventListener('keydown', (e) => {
    // Allow normal arrow key navigation
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
      return;
    }
    
    // Build search buffer from typed characters
    clearTimeout(searchTimeout);
    searchBuffer += e.key.toLowerCase();
    
    // Find first matching option
    const options = Array.from(selectElement.options);
    const match = options.find(opt => 
      opt.textContent.toLowerCase().startsWith(searchBuffer)
    );
    
    if (match) {
      selectElement.value = match.value;
    }
    
    // Clear search buffer after 1 second
    searchTimeout = setTimeout(() => {
      searchBuffer = '';
    }, 1000);
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
  // Check if user is admin
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.type !== 'admin') {
    toast.error('Akses ditolak: Hanya admin yang dapat menambah sales');
    return;
  }
  
  openModal({
    title: 'Tambah Sales',
    bodyHtml: `
      <div class="form-group">
        <label>Bulan *</label>
        <input type="month" name="month" required>
      </div>
      <div class="form-group">
        <label>Staff *</label>
        <select name="staff_name" required></select>
      </div>
      <div class="form-group">
        <label>Sales Amount *</label>
        <input type="number" name="sales_amount" required step="0.01" placeholder="0">
      </div>
      <div class="form-group">
        <label>Profit Amount *</label>
        <input type="number" name="profit_amount" required step="0.01" placeholder="0">
      </div>
    `,
    context: { entity: 'sales', action: 'create' }
  });
  updateStaffSelects();
}

function openEditSalesModal(id) {
  // Check if user is admin
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.type !== 'admin') {
    toast.error('Akses ditolak: Hanya admin yang dapat mengedit sales');
    return;
  }
  
  const item = state.sales.find(s => s.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Sales',
    bodyHtml: `
      <div class="form-group">
        <label>Bulan *</label>
        <input type="month" name="month" value="${item.month || ''}" required>
      </div>
      <div class="form-group">
        <label>Staff *</label>
        <select name="staff_name" required></select>
      </div>
      <div class="form-group">
        <label>Sales Amount *</label>
        <input type="number" name="sales_amount" value="${item.sales_amount || 0}" required step="0.01">
      </div>
      <div class="form-group">
        <label>Profit Amount *</label>
        <input type="number" name="profit_amount" value="${item.profit_amount || 0}" required step="0.01">
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
          <label>Tour Code *</label>
          <input type="text" name="tour_code" required placeholder="TRV-001">
        </div>
        <div class="form-group">
          <label>Booking Code</label>
          <input type="text" name="booking_code" placeholder="BKG-001">
        </div>
        <div class="form-group">
          <label>Departure Date *</label>
          <input type="date" name="departure_date" required>
        </div>
        <div class="form-group">
          <label>Region *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select name="status">
            <option value="belum jalan">Belum Jalan</option>
            <option value="sudah jalan">Sudah Jalan</option>
            <option value="tidak jalan">Tidak Jalan</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nama Penumpang Utama *</label>
          <input type="text" name="lead_passenger" required placeholder="Nama Penumpang Utama">
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
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Semua Penumpang</label>
          <textarea name="all_passengers" rows="2" placeholder="Semua nama penumpang (pisahkan dengan koma)"></textarea>
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Remarks</label>
          <textarea name="remarks" rows="3" placeholder="Additional notes or remarks"></textarea>
        </div>
        
        <!-- Financial Section -->
        <div class="form-group" style="grid-column: 1 / -1; margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border-medium);">
          <h4 style="margin: 0 0 10px 0; color: var(--primary); font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.3rem;">💰</span> Financial Information
          </h4>
        </div>
        <div class="form-group">
          <label>Harga Tour Perorang Sebelum Discount</label>
          <input type="number" name="tour_price" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Harga Tour Perorang Setelah Discount</label>
          <input type="number" name="sales_amount" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Total Discount Perorang</label>
          <input type="number" name="discount_amount" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Profit Amount</label>
          <input type="number" name="profit_amount" step="0.01" placeholder="0">
        </div>
        <div class="form-group">
          <label>Total Nominal Invoice</label>
          <input type="number" name="total_nominal_sales" step="0.01" placeholder="Total sales amount">
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Discount Remarks</label>
          <textarea name="discount_remarks" rows="3" placeholder="Keterangan diskon (detail lengkap)"></textarea>
        </div>
        <div class="form-group">
          <label>Invoice Number</label>
          <input type="text" name="invoice_number" placeholder="Nomor invoice">
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Link Pelunasan Tour & Bukti Discount</label>
          <input type="url" name="link_pelunasan_tour" placeholder="Upload to Google Drive or Lark">
          <small style="color: var(--text-secondary); font-size: 0.85rem; display: block; margin-top: 4px;">📁 Please upload payment & discount proof to Drive or Lark</small>
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
          <input type="date" name="registration_date" value="${formatDateValue(item.registration_date)}" required>
        </div>
        <div class="form-group">
          <label>Tour Code *</label>
          <input type="text" name="tour_code" value="${esc(item.tour_code) || ''}" required>
        </div>
        <div class="form-group">
          <label>Booking Code</label>
          <input type="text" name="booking_code" value="${esc(item.booking_code) || ''}">
        </div>
        <div class="form-group">
          <label>Departure Date *</label>
          <input type="date" name="departure_date" value="${formatDateValue(item.departure_date)}" required>
        </div>
        <div class="form-group">
          <label>Region *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select name="status">
            <option value="belum jalan" ${item.status === 'belum jalan' ? 'selected' : ''}>Belum Jalan</option>
            <option value="sudah jalan" ${item.status === 'sudah jalan' ? 'selected' : ''}>Sudah Jalan</option>
            <option value="tidak jalan" ${item.status === 'tidak jalan' ? 'selected' : ''}>Tidak Jalan</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nama Penumpang Utama *</label>
          <input type="text" name="lead_passenger" value="${esc(item.lead_passenger) || ''}" required>
        </div>
        <div class="form-group">
          <label>Jumlah Peserta *</label>
          <input type="number" name="jumlah_peserta" value="${item.jumlah_peserta || 1}" required min="1">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" value="${esc(item.phone_number) || ''}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" value="${esc(item.email) || ''}">
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Semua Penumpang</label>
          <textarea name="all_passengers" rows="2">${esc(item.all_passengers) || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
        <div class="form-group">
          <label>Remarks</label>
          <textarea name="remarks" rows="3" placeholder="Additional notes or remarks">${esc(item.remarks) || ''}</textarea>
        </div>
        
        <!-- Financial Section -->
        <div class="form-group" style="grid-column: 1 / -1; margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--border-medium);">
          <h4 style="margin: 0 0 10px 0; color: var(--primary); font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.3rem;">💰</span> Financial Information
          </h4>
        </div>
        <div class="form-group">
          <label>Harga Tour Perorang Sebelum Discount</label>
          <input type="number" name="tour_price" value="${item.tour_price || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Harga Tour Perorang Setelah Discount</label>
          <input type="number" name="sales_amount" value="${item.sales_amount || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Total Discount Perorang</label>
          <input type="number" name="discount_amount" value="${item.discount_amount || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Profit Amount</label>
          <input type="number" name="profit_amount" value="${item.profit_amount || 0}" step="0.01">
        </div>
        <div class="form-group">
          <label>Total Nominal Invoice</label>
          <input type="number" name="total_nominal_sales" value="${item.total_nominal_sales || item.sales_amount || 0}" step="0.01" placeholder="Total sales amount">
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Discount Remarks</label>
          <textarea name="discount_remarks" rows="3" placeholder="Keterangan diskon (detail lengkap)">${esc(item.discount_remarks) || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Invoice Number</label>
          <input type="text" name="invoice_number" value="${esc(item.invoice_number) || ''}" placeholder="Nomor invoice">
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Link Pelunasan Tour & Bukti Discount</label>
          <input type="url" name="link_pelunasan_tour" value="${esc(item.link_pelunasan_tour) || ''}" placeholder="Upload to Google Drive or Lark">
          <small style="color: var(--text-secondary); font-size: 0.85rem; display: block; margin-top: 4px;">📁 Please upload payment & discount proof to Drive or Lark</small>
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
          <label>Passport / Visa Country</label>
          <select name="passport_country">
            <option value="">Pilih Negara</option>
          </select>
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
  updateRegionSelects();
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
          <input type="date" name="receive_date" value="${formatDateValue(item.receive_date)}" required>
        </div>
        <div class="form-group">
          <label>Send Date</label>
          <input type="date" name="send_date" value="${formatDateValue(item.send_date)}">
        </div>
        <div class="form-group">
          <label>Guest Name *</label>
          <input type="text" name="guest_name" value="${esc(item.guest_name) || ''}" required>
        </div>
        <div class="form-group">
          <label>Passport / Visa Country</label>
          <select name="passport_country">
            <option value="">Pilih Negara</option>
          </select>
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
          <input type="text" name="booking_code" value="${esc(item.booking_code) || ''}">
        </div>
        <div class="form-group">
          <label>Invoice Number</label>
          <input type="text" name="invoice_number" value="${esc(item.invoice_number) || ''}">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" value="${esc(item.phone_number) || ''}">
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
          <input type="text" name="tour_code" value="${esc(item.tour_code) || ''}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="notes" rows="3">${esc(item.notes) || ''}</textarea>
        </div>
      </div>
    `,
    context: { entity: 'documents', action: 'update', id }
  });
  updateStaffSelects();
  updateRegionSelects();
  setTimeout(() => {
    document.querySelector('select[name="staff_name"]').value = item.staff_name || '';
    const passportSelect = document.querySelector('select[name="passport_country"]');
    if (passportSelect && item.passport_country) passportSelect.value = item.passport_country;
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
        <input type="text" name="region_name" value="${esc(item.region_name) || ''}" required>
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
        <input type="text" name="username" value="${esc(item.username) || ''}" required readonly>
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" value="${esc(item.name) || ''}" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${esc(item.email) || ''}">
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
    title: `Reset Password — ${esc(username)}`,
    size: 'small',
    bodyHtml: `
      <div class="form-group">
        <label>Password Baru *</label>
        <input type="password" name="password" required minlength="8" placeholder="Min 8 karakter, huruf besar, kecil, angka, simbol">
        <small class="form-hint">Minimal 8 karakter dengan huruf besar, huruf kecil, angka, dan karakter khusus (!@#$%^&*)</small>
      </div>
      <div class="form-group">
        <label>Konfirmasi Password *</label>
        <input type="password" name="password_confirm" required minlength="8" placeholder="Ulangi password">
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
          <input type="text" name="nama" value="${esc(item.nama) || ''}" required>
        </div>
        <div class="form-group">
          <label>No Telephone *</label>
          <input type="tel" name="no_telephone" value="${esc(item.no_telephone) || ''}" required>
        </div>
        <div class="form-group">
          <label>Type Product</label>
          <input type="text" name="type_product" value="${esc(item.type_product) || ''}" placeholder="Jenis Produk">
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
          <input type="text" name="no_rekening" value="${esc(item.no_rekening) || ''}">
        </div>
        <div class="form-group">
          <label>Bank</label>
          <input type="text" name="bank" value="${esc(item.bank) || ''}">
        </div>
        <div class="form-group">
          <label>Nama Rekening</label>
          <input type="text" name="nama_rekening" value="${esc(item.nama_rekening) || ''}">
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

/* === HOTEL BOOKINGS CRUD === */
function openAddHotelBookingModal() {
  openModal({
    title: 'Tambah Hotel Booking',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Check In *</label>
          <input type="date" name="check_in" required>
        </div>
        <div class="form-group">
          <label>Check Out *</label>
          <input type="date" name="check_out" required>
        </div>
        <div class="form-group">
          <label>Nama Hotel *</label>
          <input type="text" name="hotel_name" required placeholder="Nama Hotel">
        </div>
        <div class="form-group">
          <label>Region *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Confirmation Number</label>
          <input type="text" name="confirmation_number" placeholder="Nomor Konfirmasi">
        </div>
        <div class="form-group">
          <label>Guest List</label>
          <textarea name="guest_list" rows="3" placeholder="Daftar tamu (pisahkan dengan koma)"></textarea>
        </div>
        <div class="form-group">
          <label>Supplier Code</label>
          <input type="text" name="supplier_code" placeholder="Kode Supplier">
        </div>
        <div class="form-group">
          <label>Supplier Name</label>
          <input type="text" name="supplier_name" placeholder="Nama Supplier">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
      </div>
    `,
    context: { entity: 'hotel_bookings', action: 'create' }
  });
  updateRegionSelects();
  updateStaffSelects();
}

function openEditHotelBookingModal(id) {
  const item = state.hotel_bookings.find(h => h.id === id);
  if (!item) return;
  
  openModal({
    title: 'Edit Hotel Booking',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Check In *</label>
          <input type="date" name="check_in" value="${item.check_in || ''}" required>
        </div>
        <div class="form-group">
          <label>Check Out *</label>
          <input type="date" name="check_out" value="${item.check_out || ''}" required>
        </div>
        <div class="form-group">
          <label>Nama Hotel *</label>
          <input type="text" name="hotel_name" value="${esc(item.hotel_name) || ''}" required>
        </div>
        <div class="form-group">
          <label>Region *</label>
          <select name="region_id" required></select>
        </div>
        <div class="form-group">
          <label>Confirmation Number</label>
          <input type="text" name="confirmation_number" value="${esc(item.confirmation_number) || ''}">
        </div>
        <div class="form-group">
          <label>Guest List</label>
          <textarea name="guest_list" rows="3">${esc(item.guest_list) || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Supplier Code</label>
          <input type="text" name="supplier_code" value="${esc(item.supplier_code) || ''}">
        </div>
        <div class="form-group">
          <label>Supplier Name</label>
          <input type="text" name="supplier_name" value="${esc(item.supplier_name) || ''}">
        </div>
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required></select>
        </div>
      </div>
    `,
    context: { entity: 'hotel_bookings', action: 'update', id }
  });
  updateRegionSelects();
  updateStaffSelects();
  setTimeout(() => {
    document.querySelector('select[name="region_id"]').value = item.region_id || '';
    document.querySelector('select[name="staff_name"]').value = item.staff_name || '';
  }, 100);
}

/* === BULK SELECT/DELETE HANDLERS === */
function toggleSelectItem(entity, id) {
  if (state.selected[entity].has(id)) {
    state.selected[entity].delete(id);
  } else {
    state.selected[entity].add(id);
  }
  updateBulkActionsUI(entity);
  updateSelectAllCheckbox(entity);
}

function toggleSelectAll(entity) {
  const filtered = applyFiltersAndSort(entity);
  const paginated = paginateData(entity, filtered);
  const allSelected = paginated.every(item => state.selected[entity].has(item.id));
  
  if (allSelected) {
    // Deselect all on current page
    paginated.forEach(item => state.selected[entity].delete(item.id));
  } else {
    // Select all on current page
    paginated.forEach(item => state.selected[entity].add(item.id));
  }
  
  renderTable(entity);
  updateBulkActionsUI(entity);
}

function updateSelectAllCheckbox(entity) {
  const selectAllCb = document.querySelector(`#selectAll-${entity}`);
  if (!selectAllCb) return;
  
  const filtered = applyFiltersAndSort(entity);
  const paginated = paginateData(entity, filtered);
  const allSelected = paginated.length > 0 && paginated.every(item => state.selected[entity].has(item.id));
  const someSelected = paginated.some(item => state.selected[entity].has(item.id));
  
  selectAllCb.checked = allSelected;
  selectAllCb.indeterminate = someSelected && !allSelected;
}

function updateBulkActionsUI(entity) {
  const bulkBar = document.querySelector(`#bulkActions-${entity}`);
  const count = state.selected[entity].size;
  
  if (!bulkBar) return;
  
  if (count > 0) {
    bulkBar.style.display = 'flex';
    bulkBar.querySelector('.selected-count').textContent = `${count} selected`;
  } else {
    bulkBar.style.display = 'none';
  }
}

function clearSelection(entity) {
  state.selected[entity].clear();
  renderTable(entity);
  updateBulkActionsUI(entity);
}

async function bulkDelete(entity) {
  const count = state.selected[entity].size;
  if (count === 0) {
    toast.warning('No items selected');
    return;
  }
  
  // Check admin-only - bulk delete requires admin
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.type !== 'admin') {
    toast.error('Access denied: Only admin can perform bulk delete');
    return;
  }
  
  const confirmed = await confirmDialog.custom({
    title: 'Bulk Delete',
    message: `Are you sure you want to delete ${count} item(s)? This action cannot be undone.`,
    confirmText: 'Delete All',
    cancelText: 'Cancel',
    confirmColor: '#dc2626',
    icon: '🗑️'
  });
  
  if (!confirmed) return;
  
  try {
    // Use bulk delete endpoint for efficiency
    const ids = Array.from(state.selected[entity]);
    const result = await fetchJson(`/api/${entity}/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    
    state.selected[entity].clear();
    toast.success(`Successfully deleted ${result.deleted} item(s)`);
    
    await loadData(entity);
    renderTable(entity);
    updateBulkActionsUI(entity);
  } catch (err) {
    const errorMsg = err.message || err.details?.error || 'Failed to delete items';
    toast.error(errorMsg);
    console.error('Bulk delete error:', err);
  }
}

/* === DELETE HANDLER === */
async function deleteItem(entity, id) {
  // Check admin-only for sales
  if (entity === 'sales') {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.type !== 'admin') {
      toast.error('Akses ditolak: Hanya admin yang dapat menghapus sales');
      return;
    }
  }
  
  // Check if item exists in local state before attempting delete
  const item = state[entity]?.find(i => i.id === id);
  if (!item) {
    toast.warning('Data tidak ditemukan, mungkin sudah dihapus');
    await loadData(entity);
    renderTable(entity);
    return;
  }
  
  const confirmed = await confirmDialog.delete();
  if (!confirmed) return;
  
  // Optimistic UI update - remove from local state immediately
  const originalData = [...state[entity]];
  state[entity] = state[entity].filter(i => i.id !== id);
  renderTable(entity);
  
  try {
    await fetchJson(`/api/${entity}/${id}`, { method: 'DELETE' });
    toast.success('Data berhasil dihapus');
    // Refresh data from server to ensure sync
    await loadData(entity);
    renderTable(entity);
  } catch (err) {
    // Restore data if delete failed
    state[entity] = originalData;
    renderTable(entity);
    toast.error('Gagal menghapus data: ' + err.message);
  }
}

/* === FORM SUBMIT HANDLER === */
async function handleModalSubmit(formData, context) {
  const { entity, action, id } = context;
  
  // Handle filter modal submission (no protection needed for filters)
  if (action === 'filter') {
    applyFilterFromModal(entity, formData);
    return true;
  }
  
  // Prevent double submission
  if (isSubmitting) {
    toast.warning('Mohon tunggu, data sedang diproses...');
    return false;
  }
  
  // Check cooldown period to prevent rapid submissions
  const now = Date.now();
  if (now - lastSubmitTime < SUBMIT_COOLDOWN) {
    toast.warning('Mohon tunggu sebentar sebelum menyimpan lagi');
    return false;
  }
  
  // Set submission flags
  isSubmitting = true;
  lastSubmitTime = now;
  
  // Robust normalization for numeric (financial) fields.
  // Accept inputs like: "1,234", "Rp 1.234,00", "1.234.567", "1,234.50", "1234567", "1.234,5".
  function normalizeMoney(raw) {
    if (raw == null) return 0;
    let s = String(raw).trim().toLowerCase();
    if (!s) return 0;
    s = s.replace(/(rp|idr|usd|eur|sgd|rm|aud|gbp|£|€|¥|\$)/g,'');
    s = s.replace(/[a-z\s]/g,'');
    s = s.replace(/[^0-9.,-]/g,'');
    if (!s) return 0;
    let decSep = null;
    if (s.includes(',')) {
      const lastComma = s.lastIndexOf(',');
      const tail = s.slice(lastComma + 1);
      if (/^\d{1,2}$/.test(tail)) decSep = ',';
    } else if (s.includes('.')) {
      const lastDot = s.lastIndexOf('.');
      const tail = s.slice(lastDot + 1);
      const head = s.slice(0, lastDot);
      const headGroups = head.split('.');
      const thousandsPattern = headGroups.slice(1).every(g => /^\d{3}$/.test(g));
      const headFirstOk = /^\d{1,3}$/.test(headGroups[0] || '');
      const isPureThousands = thousandsPattern && headFirstOk;
      if (/^\d{1,2}$/.test(tail) && !isPureThousands) decSep = '.';
    }
    if (!decSep) {
      return parseInt(s.replace(/[.,]/g,''),10) || 0;
    }
    const parts = s.split(decSep);
    const intPart = parts[0].replace(/[.,]/g,'') || '0';
    const fracPart = parts.slice(1).join('').replace(/[^0-9]/g,'');
    return parseFloat(intPart + '.' + (fracPart || '0')) || 0;
  }
  Object.keys(formData).forEach(key => {
    if (/(amount|price|deposit|target|_sales|_profit|jumlah_deposit|tour_price)/i.test(key)) {
      const raw = formData[key];
      if (typeof raw === 'string') {
        formData[key] = normalizeMoney(raw);
      }
    }
  });
  
  // Remove empty password field for user updates
  if (entity === 'users' && action === 'update' && !formData.password) {
    delete formData.password;
  }
  
  // Remove username from update (readonly)
  if (entity === 'users' && action === 'update') {
    delete formData.username;
  }
  
  // Validate mandatory fields for tours
  if (entity === 'tours' && (action === 'create' || action === 'update')) {
    const mandatoryFields = [
      { field: 'registration_date', label: 'Registration Date' },
      { field: 'tour_code', label: 'Tour Code' },
      { field: 'departure_date', label: 'Departure Date' },
      { field: 'region_id', label: 'Region' },
      { field: 'lead_passenger', label: 'Nama Penumpang Utama' },
      { field: 'jumlah_peserta', label: 'Jumlah Peserta' },
      { field: 'staff_name', label: 'Staff' }
    ];
    
    const missingFields = mandatoryFields.filter(f => {
      const value = formData[f.field];
      return value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '');
    });
    
    if (missingFields.length > 0) {
      isSubmitting = false;
      const fieldNames = missingFields.map(f => f.label).join(', ');
      throw new Error(`Please fill in the mandatory fields: ${fieldNames}`);
    }
    
    // Validate jumlah_peserta is at least 1
    if (parseInt(formData.jumlah_peserta) < 1) {
      isSubmitting = false;
      throw new Error('Jumlah Peserta must be at least 1');
    }
  }
  
  // Validate booking code uniqueness for tours
  if (entity === 'tours' && formData.booking_code) {
    const existingTour = state.tours.find(t => 
      t.booking_code === formData.booking_code && 
      (action === 'create' || t.id !== id)
    );
    if (existingTour) {
      throw new Error(`Booking code "${formData.booking_code}" already exists for tour ${existingTour.tour_code}. Please use a different booking code.`);
    }
  }
  
  try {
    // Handle reset password
    if (entity === 'users' && action === 'reset') {
      const password = formData.password;
      if (!password || password.length < 8) {
        throw new Error('Password minimal 8 karakter');
      }
      if (!/[A-Z]/.test(password)) {
        throw new Error('Password harus mengandung huruf besar');
      }
      if (!/[a-z]/.test(password)) {
        throw new Error('Password harus mengandung huruf kecil');
      }
      if (!/\d/.test(password)) {
        throw new Error('Password harus mengandung angka');
      }
      if (!/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'`~]/.test(password)) {
        throw new Error('Password harus mengandung karakter khusus (!@#$%^&*)');
      }
      if (password !== formData.password_confirm) {
        throw new Error('Password konfirmasi tidak sama');
      }
      
      const result = await fetchJson(`/api/users/${context.username}/reset`, {
        method: 'POST',
        body: { password: password }
      });
      
      if (result && result.updated > 0) {
        toast.success('Password berhasil direset');
      } else {
        console.warn('⚠️ Password reset returned but no rows updated:', result);
        toast.warning('Password mungkin tidak terupdate, silakan coba lagi');
      }
      return true;
    }

    if (action === 'create') {
      await fetchJson(`/api/${entity}`, {
        method: 'POST',
        body: formData
      });
      toast.success('Data berhasil ditambahkan');
    } else if (action === 'update') {
      await fetchJson(`/api/${entity}/${id}`, {
        method: 'PUT',
        body: formData
      });
      toast.success('Data berhasil diperbarui');
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
  } finally {
    // Reset submission flag
    isSubmitting = false;
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
    case 'hotel_bookings':
      renderHotelBookingsTable();
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
      actions += `<button class=\"btn-action view\" data-action=\"view\" data-entity=\"sales\" data-id=\"${item.id}\">View</button>`;
    } else {
      actions += `<button class=\"btn-action edit\" data-action=\"edit\" data-entity=\"sales\" data-id=\"${item.id}\">Edit</button>`;
    }
    if (!isBasic) {
      actions += ` <button class=\"btn-action delete\" data-action=\"delete\" data-entity=\"sales\" data-id=\"${item.id}\">Delete</button>`;
    }
    return `
    <tr>
      <td>${esc(item.transaction_date) || '-'}</td>
      <td>${esc(item.invoice_no) || '-'}</td>
      <td>${esc(item.staff_name) || '-'}</td>
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
    tbody.innerHTML = '<tr><td colspan="11">Tidak ada data</td></tr>';
    renderPagination('tours', 0);
    return;
  }
  
  tbody.innerHTML = paginated.map(item => {
    const region = state.regions.find(r => r.id === item.region_id);
    const owned = item.staff_name && item.staff_name === current.name;
    let actions = '';
    if (isBasic && !owned) {
      actions += `<button class=\"btn-action view\" data-action=\"view\" data-entity=\"tours\" data-id=\"${item.id}\">View</button>`;
    } else {
      actions += `<button class=\"btn-action edit\" data-action=\"edit\" data-entity=\"tours\" data-id=\"${item.id}\">Edit</button>`;
    }
    if (!isBasic) {
      actions += ` <button class=\"btn-action delete\" data-action=\"delete\" data-entity=\"tours\" data-id=\"${item.id}\">Delete</button>`;
    }
    
    // Format status for display (icon only)
    const statusMap = {
      'belum jalan': '⏳',
      'sudah jalan': '✅',
      'tidak jalan': '❌'
    };
    const statusDisplay = statusMap[item.status] || '-';
    
    // Truncate lead passenger name if too long
    const leadName = item.lead_passenger ? 
      (item.lead_passenger.length > 15 ? item.lead_passenger.substring(0, 15) + '...' : item.lead_passenger) 
      : '-';
    
    return `
      <tr>
        <td>${esc(item.registration_date) || '-'}</td>
        <td>${esc(item.tour_code) || '-'}</td>
        <td>${esc(item.booking_code) || '-'}</td>
        <td>${item.jumlah_peserta || 0}</td>
        <td>${esc(item.departure_date) || '-'}</td>
        <td>${region ? esc(region.region_name) : '-'}</td>
        <td title="${esc(item.status) || '-'}">${statusDisplay}</td>
        <td title="${esc(item.lead_passenger) || '-'}">${esc(leadName)}</td>
        <td>${item.total_nominal_sales ? formatCurrency(item.total_nominal_sales) : '-'}</td>
        <td>${esc(item.staff_name) || '-'}</td>
        <td style=\"white-space: nowrap;\">${actions}</td>
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
      <td>${esc(item.receive_date) || '-'}</td>
      <td>${esc(item.guest_name) || '-'}</td>
      <td>${item.process_type ? (item.process_type === 'Kilat' 
        ? '<span class=\"badge badge-warning\">Kilat</span>' 
        : '<span class=\"badge badge-info\">Normal</span>') : '-'}</td>
      <td>${esc(item.staff_name) || '-'}</td>
      <td>${(() => {
        const owned = item.staff_name && item.staff_name === current.name;
        if (isBasic && !owned) return `<button class=\"btn-action view\" data-action=\"view\" data-entity=\"documents\" data-id=\"${item.id}\">View</button>`;
        let a = `<button class=\"btn-action edit\" data-action=\"edit\" data-entity=\"documents\" data-id=\"${item.id}\">Edit</button>`;
        if (!isBasic) a += ` <button class=\"btn-action delete\" data-action=\"delete\" data-entity=\"documents\" data-id=\"${item.id}\">Delete</button>`;
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
      <td>${esc(item.staff_name) || '-'}</td>
      <td>${formatCurrency(item.target_sales)}</td>
      <td>${formatCurrency(item.target_profit)}</td>
      <td>${(() => {
        // Basic staff can only view targets, no edit/delete
        if (isBasic) return `<button class=\"btn-action view\" data-action=\"view\" data-entity=\"targets\" data-id=\"${item.id}\">View</button>`;
        // Admin/semi-admin can edit and delete
        return `<button class=\"btn-action edit\" data-action=\"edit\" data-entity=\"targets\" data-id=\"${item.id}\">Edit</button> <button class=\"btn-action delete\" data-action=\"delete\" data-entity=\"targets\" data-id=\"${item.id}\">Delete</button>`;
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
      <td>${esc(item.region_name) || '-'}</td>
      <td>
        <button class="btn-action edit" data-action="edit" data-entity="regions" data-id="${item.id}">Edit</button>
        <button class="btn-action delete" data-action="delete" data-entity="regions" data-id="${item.id}">Delete</button>
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

  tbody.innerHTML = paginated.map(item => {
    const locked = item.locked_until && new Date(item.locked_until) > new Date();
    return `
    <tr>
      <td>${esc(item.username) || '-'}${locked ? ' <span class=\"badge badge-danger\" title=\"Locked until '+esc(item.locked_until)+'\">Locked</span>' : ''}</td>
      <td>${esc(item.name) || '-'}</td>
      <td>${item.type ? (item.type === 'admin'
        ? '<span class="badge badge-primary">Admin</span>'
        : item.type === 'semiadmin'
          ? '<span class="badge badge-warning">Semi Admin</span>'
          : '<span class="badge badge-info">Basic</span>') : '-'}</td>
      <td>
        <button class="btn-action edit" data-action="edit" data-entity="users" data-id="${item.id}">Edit</button>
        <button class="btn-action delete" data-action="delete" data-entity="users" data-id="${item.id}">Delete</button>
        ${isAdmin ? `<button class=\"btn-action reset\" data-action=\"reset-user\" data-username=\"${esc(item.username)}\">Reset</button>` : ''}
        ${isAdmin && locked ? `<button class=\"btn-action unlock\" data-action=\"unlock-user\" data-username=\"${esc(item.username)}\">Unlock</button>` : ''}
        ${isAdmin && !locked && item.type !== 'admin' ? `<button class=\"btn-action lock\" data-action=\"lock-user\" data-username=\"${esc(item.username)}\">Lock</button>` : ''}
      </td>
    </tr>
    `;
  }).join('');
  
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
      actions += `<button class=\"btn-action view\" data-action=\"view\" data-entity=\"telecom\" data-id=\"${item.id}\">View</button>`;
    } else {
      actions += `<button class=\"btn-action edit\" data-action=\"edit\" data-entity=\"telecom\" data-id=\"${item.id}\">Edit</button>`;
    }
    if (!isBasic) {
      actions += ` <button class=\"btn-action delete\" data-action=\"delete\" data-entity=\"telecom\" data-id=\"${item.id}\">Delete</button>`;
    }
    return `
      <tr>
        <td>${esc(item.nama) || '-'}</td>
        <td>${esc(item.no_telephone) || '-'}</td>
        <td>${esc(item.type_product) || '-'}</td>
        <td>${region ? esc(region.region_name) : '-'}</td>
        <td>${esc(item.tanggal_mulai) || '-'}</td>
        <td>${esc(item.tanggal_selesai) || '-'}</td>
        <td>${esc(item.staff_name) || '-'}</td>
        <td>${item.deposit ? (item.deposit === 'sudah' 
          ? '<span class="badge badge-success">Sudah</span>' 
          : '<span class="badge badge-warning">Belum</span>') : '-'}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
  
  renderPagination('telecom', filtered.length);
}

function renderHotelBookingsTable() {
  const tbody = document.getElementById('tblHotelBookings');
  if (!tbody) return;
  
  const filtered = applyFiltersAndSort('hotel_bookings');
  const paginated = paginateData('hotel_bookings', filtered);
  const current = getCurrentUser();
  const isBasic = current.type === 'basic';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">Tidak ada data</td></tr>';
    renderPagination('hotel_bookings', 0);
    return;
  }
  
  tbody.innerHTML = paginated.map(item => {
    const region = state.regions.find(r => r.id === item.region_id);
    const owned = item.staff_name && item.staff_name === current.name;
    let actions = '';
    if (isBasic && !owned) {
      actions += `<button class=\"btn-action view\" data-action=\"view\" data-entity=\"hotel_bookings\" data-id=\"${item.id}\">View</button>`;
    } else {
      actions += `<button class=\"btn-action edit\" data-action=\"edit\" data-entity=\"hotel_bookings\" data-id=\"${item.id}\">Edit</button>`;
    }
    if (!isBasic) {
      actions += ` <button class=\"btn-action delete\" data-action=\"delete\" data-entity=\"hotel_bookings\" data-id=\"${item.id}\">Delete</button>`;
    }
    return `
      <tr>
        <td>${esc(item.check_in) || '-'}</td>
        <td>${esc(item.check_out) || '-'}</td>
        <td>${esc(item.hotel_name) || '-'}</td>
        <td>${region ? esc(region.region_name) : '-'}</td>
        <td>${esc(item.confirmation_number) || '-'}</td>
        <td>${item.guest_list ? esc(item.guest_list.length > 50 ? item.guest_list.substring(0, 50) + '...' : item.guest_list) : '-'}</td>
        <td>${esc(item.staff_name) || '-'}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
  
  renderPagination('hotel_bookings', filtered.length);
}

/* === INITIALIZE === */
async function init() {
  // IMPORTANT: Attach modalSubmit listener FIRST, before any data loading
  // This ensures password reset and other modal actions work even if data loading fails
  document.addEventListener('modalSubmit', (e) => {
    const { data, context } = e.detail;
    
    // Handle the submit through handleModalSubmit
    if (context && context.entity) {
      // IMPORTANT: preventDefault must be called synchronously before any async work
      e.preventDefault();
      
      // Now do the async work
      (async () => {
        try {
          const result = await handleModalSubmit(data, context);
          if (result !== false) {
            // Close modal on success
            if (window.closeModal) window.closeModal(true);
            // Refresh table
            await loadData(context.entity);
            renderTable(context.entity);
          }
        } catch (err) {
          console.error('Modal submit error:', err);
          toast.error(err.message || 'Gagal menyimpan data');
        } finally {
          // Reset submission flag
          isSubmitting = false;
        }
      })();
    }
  });
  
  try {
    await Promise.all([
      loadRegions(),
      loadUsers(),
      loadData('sales'),
      loadData('tours'),
      loadData('documents'),
      loadData('targets'),
      loadData('telecom'),
      loadData('hotel_bookings')
    ]);
    
    // Render all tables
    renderSalesTable();
    renderToursTable();
    renderDocsTable();
    renderTargetsTable();
    renderRegionsTable();
    renderUsersTable();
    renderTelecomTable();
    renderHotelBookingsTable();

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
      
      // Delegated click handlers for pagination and action buttons
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        // Handle pagination
        const pagEntity = btn.dataset.paginationEntity;
        if (pagEntity) {
          const page = parseInt(btn.dataset.paginationPage, 10);
          if (!isNaN(page)) goToPage(pagEntity, page);
          return;
        }

        // Reset filters from modal
        if (btn.dataset.resetFilters) {
          resetFilters(btn.dataset.resetFilters);
          return;
        }

        // CRUD action buttons
        const action = btn.dataset.action;
        if (!action) return;
        const entity = btn.dataset.entity;
        const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : null;

        try {
          switch (action) {
            case 'view':
              if (entity && id != null) openViewItem(entity, id);
              break;
            case 'edit':
              if (entity && id != null) {
                switch (entity) {
                  case 'sales': window.crudHandlers.openEditSalesModal(id); break;
                  case 'tours': window.crudHandlers.openEditTourModal(id); break;
                  case 'documents': window.crudHandlers.openEditDocModal(id); break;
                  case 'targets': window.crudHandlers.openEditTargetModal(id); break;
                  case 'regions': window.crudHandlers.openEditRegionModal(id); break;
                  case 'users': window.crudHandlers.openEditUserModal(id); break;
                  case 'telecom': window.crudHandlers.openEditTelecomModal(id); break;
                  case 'hotel_bookings': window.crudHandlers.openEditHotelBookingModal(id); break;
                }
              }
              break;
            case 'delete':
              if (entity && id != null) deleteItem(entity, id);
              break;
            case 'reset-user':
              if (btn.dataset.username) window.crudHandlers.openResetUserModal(btn.dataset.username);
              break;
            case 'unlock-user':
              if (btn.dataset.username) window.crudHandlers.unlockUser(btn.dataset.username);
              break;
            case 'lock-user':
              if (btn.dataset.username) window.crudHandlers.lockUser(btn.dataset.username);
              break;
          }
        } catch (err) {
          console.error('Action handler error:', err);
        }
      });
      
      // Wire up search inputs for all entities
      wireSearchHandlers();
      
  } catch (err) {
    console.error('❌ Error initializing CRUD handlers:', err);
  }
}

  // Wire search input handlers
  function wireSearchHandlers() {
    const entities = ['sales', 'tours', 'documents', 'targets', 'regions', 'users', 'telecom', 'hotel_bookings'];
    
    entities.forEach(entity => {
      const searchInput = document.getElementById(`${entity}Search`) || 
                         document.getElementById(`${entity === 'hotel_bookings' ? 'hotelBookings' : entity === 'documents' ? 'documents' : entity}Search`);
      
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const searchTerm = e.target.value.trim();
          if (searchTerm) {
            state.filters[entity].search = searchTerm;
          } else {
            delete state.filters[entity].search;
          }
          state.pagination[entity].page = 1; // Reset to first page
          renderTable(entity);
        });
      }
    });
  }

  // Update sort indicators
  function updateAllSortIndicators() {
    ['sales','tours','documents','targets','regions','users','telecom','hotel_bookings'].forEach(updateSortIndicators);
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
  unlockUser,
  lockUser,
  openAddTelecomModal,
  openEditTelecomModal,
  openAddHotelBookingModal,
  openEditHotelBookingModal,
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
  applyFilterFromModal,
  // Bulk actions
  toggleSelectItem,
  toggleSelectAll,
  bulkDelete,
  clearSelection
};

// === VIEW-ONLY MODAL ===
function openViewItem(entity, id) {
  const item = state[entity].find(r => r.id === id);
  if (!item) { toast.error('Data tidak ditemukan'); return; }
  const rows = Object.entries(item)
    .filter(([k]) => !['password'].includes(k))
    .map(([k,v]) => `<tr><th style=\"text-align:left;padding:6px 10px;background:#f3f4f6;width:160px;font-weight:600;text-transform:capitalize\">${esc(k.replace(/_/g,' '))}</th><td style=\"padding:6px 10px\">${esc(v) || '-'}</td></tr>`)
    .join('');
  openModal({
    title: `Detail ${entity} #${id}`,
    size: 'medium',
    bodyHtml: `<div style=\"max-height:60vh;overflow:auto\"><table style=\"width:100%;border-collapse:collapse;font-size:14px\">${rows}</table></div>`,
    context: { entity, action: 'view', id }
  });
}
window.openViewItem = openViewItem;

// === UNLOCK USER (Admin) ===
async function unlockUser(username) {
  const confirmed = await confirmDialog.custom({
    title: 'Unlock User',
    message: `Unlock account for ${username}?`,
    confirmText: 'Unlock',
    cancelText: 'Cancel',
    icon: '🔓'
  });
  if (!confirmed) return;
  try {
    await fetchJson(`/api/users/${username}/unlock`, { method: 'POST' });
    toast.success('User unlocked');
    await loadUsers();
    renderTable('users');
  } catch (err) {
    toast.error('Gagal unlock user: ' + (err.message || 'Unknown error'));
  }
}

// === LOCK USER (Admin) ===
async function lockUser(username) {
  const confirmed = await confirmDialog.custom({
    title: 'Lock User Account',
    message: `Are you sure you want to lock the account for ${username}? The user will not be able to login until unlocked.`,
    confirmText: 'Lock Account',
    cancelText: 'Cancel',
    confirmColor: '#dc2626',
    icon: '🔒'
  });
  if (!confirmed) return;
  try {
    await fetchJson(`/api/users/${username}/lock`, { method: 'POST' });
    toast.success('User account locked');
    await loadUsers();
    renderTable('users');
  } catch (err) {
    toast.error('Failed to lock user: ' + (err.message || 'Unknown error'));
  }
}

// === EXPORT FILTERED DATA TO CSV ===
function exportCsv(entity) {
  const filtered = applyFiltersAndSort(entity);
  if (!filtered.length) {
    toast.warning('Tidak ada data untuk diexport');
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

// === EXPORT FILTERED DATA TO EXCEL (XLSX) ===
async function exportExcel(entity) {
  const filtered = applyFiltersAndSort(entity);
  if (!filtered.length) {
    toast.warning('No data to export');
    return;
  }
  
  // Load SheetJS if not already loaded
  if (!window.XLSX) {
    toast.info('Loading Excel library...');
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }
  
  if (!window.XLSX) {
    toast.error('Failed to load Excel library. Using CSV export instead.');
    exportCsv(entity);
    return;
  }
  
  try {
    // Prepare data - exclude password field
    const headers = Object.keys(filtered[0]).filter(k => !['password'].includes(k));
    const data = filtered.map(item => {
      const row = {};
      headers.forEach(h => {
        row[h] = item[h] ?? '';
      });
      return row;
    });
    
    // Create workbook and worksheet
    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, entity.charAt(0).toUpperCase() + entity.slice(1));
    
    // Auto-fit column widths
    const colWidths = headers.map(h => {
      const maxLen = Math.max(h.length, ...data.map(row => String(row[h] || '').length));
      return { wch: Math.min(maxLen + 2, 50) };
    });
    ws['!cols'] = colWidths;
    
    // Generate and download
    const filename = `${entity}-export-${new Date().toISOString().slice(0,10)}.xlsx`;
    window.XLSX.writeFile(wb, filename);
    toast.success(`Exported ${filtered.length} rows to ${filename}`);
  } catch (err) {
    console.error('Excel export failed:', err);
    toast.error('Excel export failed. Using CSV instead.');
    exportCsv(entity);
  }
}

// Helper to load external scripts
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Wire export buttons after init renders
document.addEventListener('DOMContentLoaded', () => {
  // Wire filter buttons (data-filter-entity)
  document.querySelectorAll('[data-filter-entity]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.crudHandlers.openFilterModal(btn.dataset.filterEntity);
    });
  });
  
  // Wire page size selects (data-pagesize-entity)
  document.querySelectorAll('[data-pagesize-entity]').forEach(select => {
    select.addEventListener('change', () => {
      window.crudHandlers.changePageSize(select.dataset.pagesizeEntity, select.value);
    });
  });
  
  // Export CSV buttons
  const map = {
    exportSales: 'sales',
    exportTours: 'tours',
    exportDocs: 'documents',
    exportTargets: 'targets',
    exportTelecom: 'telecom',
    exportHotelBookings: 'hotel_bookings',
    exportRegions: 'regions',
    exportUsers: 'users'
  };
  Object.entries(map).forEach(([btnId, entity]) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', () => exportCsv(entity));
  });
  
  // Wire download template buttons
  const templateMap = {
    downloadSalesTemplate: 'sales',
    downloadToursTemplate: 'tours',
    downloadDocsTemplate: 'documents',
    downloadTargetsTemplate: 'targets'
  };
  Object.entries(templateMap).forEach(([btnId, entity]) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', () => downloadTemplate(entity));
  });
  
  // Wire import CSV buttons
  const importMap = {
    importSalesBtn: { entity: 'sales', fileInput: 'importSalesFile' },
    importToursBtn: { entity: 'tours', fileInput: 'importToursFile' },
    importDocsBtn: { entity: 'documents', fileInput: 'importDocsFile' },
    importTargetsBtn: { entity: 'targets', fileInput: 'importTargetsFile' }
  };
  Object.entries(importMap).forEach(([btnId, config]) => {
    const btn = document.getElementById(btnId);
    const fileInput = document.getElementById(config.fileInput);
    if (btn && fileInput) {
      btn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => handleImportCsv(config.entity, e));
    }
  });
});

// === DOWNLOAD CSV TEMPLATE ===
function downloadTemplate(entity) {
  const templates = {
    sales: 'transaction_date,invoice_no,staff_name,status,sales_amount,profit_amount,notes',
    tours: 'registration_date,lead_passenger,all_passengers,tour_code,region_id,departure_date,booking_code,tour_price,sales_amount,profit_amount,staff_name,jumlah_peserta,phone_number,email,status,link_pelunasan_tour,invoice_number',
    documents: 'receive_date,send_date,guest_name,passport_country,process_type,booking_code,invoice_number,phone_number,estimated_done,staff_name,tour_code,notes',
    targets: 'month,year,staff_name,target_sales,target_profit'
  };
  
  const csv = templates[entity] || '';
  if (!csv) {
    toast.error('Template tidak tersedia');
    return;
  }
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entity}-template.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// === IMPORT CSV ===
async function handleImportCsv(entity, event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      toast.error('File CSV kosong atau tidak valid');
      return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1);
    // Allowed columns per entity (reflect current schema). Extra columns rejected early.
    const allowed = {
      sales: ['transaction_date','invoice_no','unique_code','staff_name','status','sales_amount','profit_amount','notes','region_id'],
      tours: ['registration_date','lead_passenger','all_passengers','tour_code','region_id','departure_date','booking_code','tour_price','sales_amount','profit_amount','discount_amount','discount_remarks','staff_name','jumlah_peserta','phone_number','email','status','link_pelunasan_tour','invoice_number'],
      documents: ['receive_date','send_date','guest_name','passport_country','process_type','booking_code','invoice_number','phone_number','estimated_done','staff_name','tour_code','notes'],
      targets: ['month','year','staff_name','target_sales','target_profit'],
      telecom: ['nama','no_telephone','type_product','region_id','tanggal_mulai','tanggal_selesai','no_rekening','bank','nama_rekening','estimasi_pengambilan','staff_name','deposit','jumlah_deposit','tanggal_pengambilan','tanggal_pengembalian'],
      hotel_bookings: ['check_in','check_out','hotel_name','region_id','confirmation_number','guest_list','supplier_code','supplier_name','staff_name'],
      regions: ['region_name'],
      users: ['username','password','name','email','type']
    }[entity] || [];

    // Support alternative header region_name -> region_id mapping for entities needing region.
    const needsRegionMap = ['sales','tours','telecom','hotel_bookings'];

    // Pre-fetch regions if necessary for name mapping
    let regionMap = {};
    if (needsRegionMap.includes(entity)) {
      try {
        const regs = await fetchJson('/api/regions');
        regionMap = Object.fromEntries((regs||[]).map(r => [r.region_name, r.id]));
      } catch (e) {
        console.warn('Gagal memuat regions untuk mapping nama -> id', e);
      }
    }

    // Validate headers
    const unknownHeaders = headers.filter(h => !allowed.includes(h) && !(needsRegionMap.includes(entity) && h === 'region_name'));
    if (unknownHeaders.length) {
      toast.error('Header tidak dikenal: ' + unknownHeaders.join(', ') + '\nHarus salah satu dari: ' + allowed.join(', '));
      return;
    }

    // Prepare numeric columns sets
    const numericCols = new Set(['sales_amount','profit_amount','tour_price','discount_amount','jumlah_deposit','jumlah_peserta','target_sales','target_profit','month','year']);
    const intCols = new Set(['jumlah_peserta','month','year','region_id']);

    let successCount = 0;
    let errorCount = 0;
    const rowErrors = [];

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const rowLine = rows[rowIdx];
      if (!rowLine.trim()) continue;
      try {
        const values = rowLine.split(',').map(v => v.trim());
        const data = {};
        headers.forEach((h, i) => {
          const raw = values[i];
          if (!raw) return;
          // Map region_name -> region_id if provided
          if (h === 'region_name') {
            const rid = regionMap[raw];
            if (!rid) throw new Error(`Region name '${raw}' tidak ditemukan`);
            data['region_id'] = rid;
            return;
          }
          let val = raw;
          if (numericCols.has(h)) {
            // Strip currency markers or commas
            const cleaned = raw.replace(/Rp\s*/i,'').replace(/,/g,'');
            val = cleaned === '' ? null : (intCols.has(h) ? parseInt(cleaned,10) : parseFloat(cleaned));
            if (val !== null && Number.isNaN(val)) throw new Error(`Nilai numerik tidak valid untuk kolom ${h}: '${raw}'`);
          }
          // Basic date format sanity (YYYY-MM-DD) for common date columns
          if (/date$/.test(h) || ['transaction_date','registration_date','departure_date','receive_date','send_date','estimated_done','tanggal_mulai','tanggal_selesai','tanggal_pengambilan','tanggal_pengembalian','check_in','check_out'].includes(h)) {
            if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) console.warn(`Format tanggal mungkin tidak valid (kolom ${h}): ${raw}`);
          }
          data[h] = val;
        });
        await fetchJson(`/api/${entity}`, { method: 'POST', body: data });
        successCount++;
      } catch (err) {
        errorCount++;
        rowErrors.push({ row: rowIdx+2, line: rowLine.slice(0,120), error: err.message }); // +2 accounts for header + 1-indexing
        if (rowErrors.length < 10) console.error('Import row error:', err);
      }
    }

    let msg = `Import selesai:\n✅ Berhasil: ${successCount}\n❌ Gagal: ${errorCount}`;
    if (rowErrors.length) {
      msg += '\nContoh error (max 5):\n' + rowErrors.slice(0,5).map(e => `Baris ${e.row}: ${e.error}`).join('\n');
    }
    toast.info(msg);

    await loadData(entity);
    renderTable(entity);
    event.target.value = '';
  } catch (err) {
    toast.error('Gagal membaca file CSV: ' + err.message);
  }
}
