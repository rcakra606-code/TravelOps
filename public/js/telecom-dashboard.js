// Telecom Dashboard - Manage telecom with CRUD improvements
await new Promise(resolve => {
  const checkReady = () => {
    if (window.getUser && window.fetchJson && window.openModal && window.toast && window.dateUtils && window.CRUDModal) {
      console.log('✅ Telecom Dashboard: All dependencies loaded');
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
let telecomData = [];
let regionsData = [];
let usersData = [];
const user = getUser();

// Pagination state
let currentPage = 1;
const pageSize = 25;

el('userName').textContent = user.name || user.username || '—';
el('userRole').textContent = { admin: 'Administrator', 'semi-admin': 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';

let filters = { search: '', startDate: '', endDate: '', deposit: '' };

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

async function loadTelecom() {
  try {
    window.loadingUtils.showTableLoader('telecomTableBody', 9);
    telecomData = await fetchJson('/api/telecom?_t=' + Date.now()) || [];
    applyFiltersAndRender();
  } catch (err) {
    console.error('Failed to load telecom:', err);
    window.toast.error('Failed to load telecom data');
    window.loadingUtils.hideTableLoader('telecomTableBody', 'Failed to load data');
  }
}

function updateMetrics() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  const active = telecomData.filter(t => {
    if (!t.tanggal_selesai) return true;
    return new Date(t.tanggal_selesai) >= now;
  }).length;
  
  const depositSudah = telecomData.filter(t => t.deposit === 'sudah').length;
  const depositBelum = telecomData.filter(t => t.deposit === 'belum').length;
  
  const thisYearData = telecomData.filter(t => t.tanggal_mulai && new Date(t.tanggal_mulai).getFullYear() === currentYear);
  const thisMonthData = telecomData.filter(t => {
    if (!t.tanggal_mulai) return false;
    const d = new Date(t.tanggal_mulai);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });
  
  const totalDeposit = telecomData.reduce((sum, t) => sum + (parseFloat(t.jumlah_deposit) || 0), 0);
  
  el('totalExpenses').textContent = telecomData.length;
  el('activeSubscriptions').textContent = active;
  el('monthlyCost').textContent = depositSudah + ' Sudah / ' + depositBelum + ' Belum';
  el('yearTotal').textContent = 'Rp ' + Math.round(totalDeposit).toLocaleString('id-ID');
}

function applyFiltersAndRender() {
  let filtered = [...telecomData];
  if (filters.search) filtered = window.filterUtils.search(filtered, filters.search, ['nama', 'no_telephone', 'type_product', 'bank', 'nama_rekening']);
  if (filters.startDate) filtered = filtered.filter(t => !t.tanggal_mulai || t.tanggal_mulai >= filters.startDate);
  if (filters.endDate) filtered = filtered.filter(t => !t.tanggal_selesai || t.tanggal_selesai <= filters.endDate);
  if (filters.deposit) filtered = filtered.filter(t => t.deposit === filters.deposit);
  
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
  const tbody = el('telecomTableBody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No telecom data found</td></tr>';
    return;
  }
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      window.editTelecom(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      window.deleteTelecom(id);
    }
  };
  
  tbody.innerHTML = data.map(item => {
    const region = regionsData.find(r => r.id === item.region_id);
    const depositBadge = item.deposit === 'sudah' 
      ? '<span class="badge badge-success">Sudah</span>' 
      : '<span class="badge badge-warning">Belum</span>';
    
    return `
    <tr class="table-row">
      <td><strong>${item.nama || '—'}</strong></td>
      <td>${item.no_telephone || '—'}</td>
      <td>${item.type_product || '—'}</td>
      <td>${region ? region.region_name : '—'}</td>
      <td>${item.tanggal_mulai || '—'}</td>
      <td>${item.tanggal_selesai || 'Ongoing'}</td>
      <td>${item.staff_name || '—'}</td>
      <td>${depositBadge}</td>
      <td class="actions">
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        <button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>
        ${user.type !== 'basic' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `;
  }).join('');
}

window.editTelecom = async function(id) {
  console.log('✏️ Edit Telecom called with id:', id);
  console.log('CRUDModal available:', !!window.CRUDModal);
  const item = telecomData.find(t => t.id === id);
  if (!item) {
    console.error('Telecom item not found:', id);
    return;
  }
  
  console.log('Calling CRUDModal.edit for telecom:', item);
  window.CRUDModal.edit('Edit Telecom', [
    { type: 'text', name: 'nama', label: 'Nama', required: true, icon: '👤' },
    { type: 'tel', name: 'no_telephone', label: 'No. Telephone', required: true, icon: '📞', placeholder: '+62...' },
    { type: 'text', name: 'type_product', label: 'Type Product', icon: '📦', placeholder: 'Jenis produk telecom' },
    { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
    { type: 'date', name: 'tanggal_mulai', label: 'Tanggal Mulai', required: true },
    { type: 'date', name: 'tanggal_selesai', label: 'Tanggal Selesai', hint: 'Kosongkan jika masih aktif' },
    { type: 'text', name: 'no_rekening', label: 'No. Rekening', icon: '💳', placeholder: 'Nomor rekening' },
    { type: 'text', name: 'bank', label: 'Bank', icon: '🏦', placeholder: 'Nama bank' },
    { type: 'text', name: 'nama_rekening', label: 'Nama Rekening', icon: '👤', placeholder: 'Nama pemilik rekening' },
    { type: 'date', name: 'estimasi_pengambilan', label: 'Estimasi Pengambilan' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'select', name: 'deposit', label: 'Deposit Status', required: true, options: [
      { value: 'sudah', label: 'Sudah' },
      { value: 'belum', label: 'Belum' }
    ]},
    { type: 'currency', name: 'jumlah_deposit', label: 'Jumlah Deposit', currency: 'Rp', min: 0 },
    { type: 'date', name: 'tanggal_pengambilan', label: 'Tanggal Pengambilan' },
    { type: 'date', name: 'tanggal_pengembalian', label: 'Tanggal Pengembalian' }
  ], item, async (formData) => {
    // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
    if (formData.jumlah_deposit) {
      formData.jumlah_deposit = window.parseFormattedNumber(formData.jumlah_deposit);
    }
    const idx = telecomData.findIndex(i => i.id === item.id);
    if (idx !== -1) Object.assign(telecomData[idx], formData);
    applyFiltersAndRender();
    fetchJson(`/api/telecom/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      .then(() => { window.toast.success('Telecom updated'); loadTelecom(); })
      .catch(err => { window.toast.error(err.message || 'Update failed'); loadTelecom(); });
  }, {
    entity: 'telecom',
    validation: { nama: { required: true }, no_telephone: { required: true }, tanggal_mulai: { required: true }, region_id: { required: true }, staff_name: { required: true }, deposit: { required: true } }
  });
};

window.deleteTelecom = async function(id) {
  const item = telecomData.find(t => t.id === id);
  if (!item) return;
  
  const displayName = `${item.nama} - ${item.no_telephone}`;
  
  let confirmed = false;
  if (window.confirmDialog) {
    confirmed = await window.confirmDialog.show({
      title: 'Delete Telecom?',
      message: `Are you sure you want to delete "${displayName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: '#dc2626',
      icon: '🗑️'
    });
  } else {
    confirmed = confirm(`Delete telecom "${displayName}"? This action cannot be undone.`);
  }
  if (!confirmed) return;
  
  try {
    telecomData = telecomData.filter(i => i.id !== id); applyFiltersAndRender();
    await fetchJson(`/api/telecom/${id}`, { method: 'DELETE' });
    window.toast.success('Telecom deleted');
    loadTelecom();
  } catch (error) {
    console.error('Delete telecom failed:', error);
    window.toast.error(error.message || 'Failed to delete telecom');
  }
};

el('addTelecomBtn').addEventListener('click', () => {
  console.log('📞 Add Telecom button clicked');
  console.log('CRUDModal available:', !!window.CRUDModal);
  window.CRUDModal.create('Add Telecom', [
    { type: 'text', name: 'nama', label: 'Nama', required: true, icon: '👤' },
    { type: 'tel', name: 'no_telephone', label: 'No. Telephone', required: true, icon: '📞', placeholder: '+62...' },
    { type: 'text', name: 'type_product', label: 'Type Product', icon: '📦', placeholder: 'Jenis produk telecom' },
    { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
    { type: 'date', name: 'tanggal_mulai', label: 'Tanggal Mulai', required: true },
    { type: 'date', name: 'tanggal_selesai', label: 'Tanggal Selesai', hint: 'Kosongkan jika masih aktif' },
    { type: 'text', name: 'no_rekening', label: 'No. Rekening', icon: '💳', placeholder: 'Nomor rekening' },
    { type: 'text', name: 'bank', label: 'Bank', icon: '🏦', placeholder: 'Nama bank' },
    { type: 'text', name: 'nama_rekening', label: 'Nama Rekening', icon: '👤', placeholder: 'Nama pemilik rekening' },
    { type: 'date', name: 'estimasi_pengambilan', label: 'Estimasi Pengambilan' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'select', name: 'deposit', label: 'Deposit Status', required: true, options: [
      { value: 'sudah', label: 'Sudah' },
      { value: 'belum', label: 'Belum' }
    ]},
    { type: 'currency', name: 'jumlah_deposit', label: 'Jumlah Deposit', currency: 'Rp', min: 0 },
    { type: 'date', name: 'tanggal_pengambilan', label: 'Tanggal Pengambilan' },
    { type: 'date', name: 'tanggal_pengembalian', label: 'Tanggal Pengembalian' }
  ], async (formData) => {
    // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
    if (formData.jumlah_deposit) {
      formData.jumlah_deposit = window.parseFormattedNumber(formData.jumlah_deposit);
    }
    telecomData.push({ ...formData, id: Date.now() });
    applyFiltersAndRender();
    fetchJson('/api/telecom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      .then(() => { window.toast.success('Telecom added'); loadTelecom(); })
      .catch(err => { window.toast.error(err.message || 'Create failed'); loadTelecom(); });
  }, {
    entity: 'telecom',
    validation: { nama: { required: true }, no_telephone: { required: true }, tanggal_mulai: { required: true }, region_id: { required: true }, staff_name: { required: true }, deposit: { required: true } }
  });
});

// Search functionality - use searchInput from HTML
const searchTelecomInput = el('searchInput');
if (searchTelecomInput) {
  searchTelecomInput.addEventListener('input', (e) => { filters.search = e.target.value; applyFiltersAndRender(); });
}

// Quick View functionality
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = telecomData.find(t => t.id == id);
    if (item) {
      const region = regionsData.find(r => r.id === item.region_id);
      window.quickView.open([
        {
          title: 'Telecom Information',
          fields: {
            'Name': item.nama || '—',
            'Phone Number': item.no_telephone || '—',
            'Type/Product': item.type_product || '—',
            'Region': region ? region.region_name : '—',
            'Staff Name': item.staff_name || '—'
          }
        },
        {
          title: 'Service Period',
          fields: {
            'Start Date': item.tanggal_mulai || '—',
            'End Date': item.tanggal_selesai || 'Ongoing',
            'Duration': item.tanggal_mulai && item.tanggal_selesai ? 
              Math.ceil((new Date(item.tanggal_selesai) - new Date(item.tanggal_mulai)) / (1000 * 60 * 60 * 24)) + ' days' : '—'
          }
        },
        {
          title: 'Deposit Details',
          fields: {
            'Deposit Status': item.deposit || '—',
            'Deposit Amount': item.jumlah_deposit ? 'Rp ' + item.jumlah_deposit.toLocaleString('id-ID') : '—'
          }
        },
        {
          title: 'Additional Info',
          fields: {
            'Notes': item.notes || '—',
            'Created At': item.created_at ? new Date(item.created_at).toLocaleString() : '—',
            'Telecom ID': item.id
          }
        }
      ], `Telecom: ${item.nama || item.no_telephone}`);
    }
  }
});

el('exportTelecomBtn').addEventListener('click', () => {
  const csv = [['Nama', 'No Telephone', 'Type Product', 'Region', 'Tanggal Mulai', 'Tanggal Selesai', 'Staff', 'Deposit', 'Jumlah Deposit'], 
    ...telecomData.map(t => {
      const region = regionsData.find(r => r.id === t.region_id);
      return [t.nama, t.no_telephone, t.type_product, region ? region.region_name : '', t.tanggal_mulai, t.tanggal_selesai, t.staff_name, t.deposit, t.jumlah_deposit];
    })].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `telecom_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  window.toast.success('Exported');
});

// Initialize
Promise.all([loadRegions(), loadUsers()]).then(() => loadTelecom());

// Auto-refresh every 60s (skip if modal open)
let _telecomRefresh = setInterval(() => {
  if (document.querySelector('.modal.show, .modal[style*="flex"]')) return;
  loadTelecom();
}, 60000);
window.addEventListener('beforeunload', () => clearInterval(_telecomRefresh));

