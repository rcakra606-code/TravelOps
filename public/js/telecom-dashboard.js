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
  try {
    usersData = await fetchJson('/api/users') || [];
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

async function loadTelecom() {
  try {
    window.loadingUtils.showTableLoader('telecomTableBody', 9);
    telecomData = await fetchJson('/api/telecom') || [];
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
  el('metricsRow').style.display = 'grid';
}

function applyFiltersAndRender() {
  let filtered = [...telecomData];
  if (filters.search) filtered = window.filterUtils.search(filtered, filters.search, ['nama', 'no_telephone', 'type_product', 'bank', 'nama_rekening']);
  if (filters.startDate) filtered = filtered.filter(t => !t.tanggal_mulai || t.tanggal_mulai >= filters.startDate);
  if (filters.endDate) filtered = filtered.filter(t => !t.tanggal_selesai || t.tanggal_selesai <= filters.endDate);
  if (filters.deposit) filtered = filtered.filter(t => t.deposit === filters.deposit);
  
  updateMetrics();
  renderTable(filtered);
}

function renderTable(data) {
  const tbody = el('telecomTableBody');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No telecom data found</td></tr>';
    return;
  }
  
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
        <button class="btn btn-sm" onclick="editTelecom(${item.id})">✏️ Edit</button>
        ${user.type !== 'basic' ? `<button class="btn btn-sm btn-danger" onclick="deleteTelecom(${item.id})">🗑️</button>` : ''}
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
    { type: 'date', name: 'tanggal_mulai', label: 'Tanggal Mulai', required: true, quickDates: true },
    { type: 'date', name: 'tanggal_selesai', label: 'Tanggal Selesai', quickDates: true, hint: 'Kosongkan jika masih aktif' },
    { type: 'text', name: 'no_rekening', label: 'No. Rekening', icon: '💳', placeholder: 'Nomor rekening' },
    { type: 'text', name: 'bank', label: 'Bank', icon: '🏦', placeholder: 'Nama bank' },
    { type: 'text', name: 'nama_rekening', label: 'Nama Rekening', icon: '👤', placeholder: 'Nama pemilik rekening' },
    { type: 'date', name: 'estimasi_pengambilan', label: 'Estimasi Pengambilan', quickDates: true },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'select', name: 'deposit', label: 'Deposit Status', required: true, options: [
      { value: 'sudah', label: 'Sudah' },
      { value: 'belum', label: 'Belum' }
    ]},
    { type: 'currency', name: 'jumlah_deposit', label: 'Jumlah Deposit', currency: 'Rp', min: 0 },
    { type: 'date', name: 'tanggal_pengambilan', label: 'Tanggal Pengambilan', quickDates: true },
    { type: 'date', name: 'tanggal_pengembalian', label: 'Tanggal Pengembalian', quickDates: true }
  ], item, async (formData) => {
    await fetchJson(`/api/telecom/${item.id}`, { method: 'PUT', body: JSON.stringify(formData) });
    window.toast.success('Telecom updated');
    await loadTelecom();
  }, {
    entity: 'telecom',
    validation: { nama: { required: true }, no_telephone: { required: true }, tanggal_mulai: { required: true }, region_id: { required: true }, staff_name: { required: true }, deposit: { required: true } }
  });
};

window.deleteTelecom = async function(id) {
  console.log('🗑️ Delete Telecom called with id:', id);
  console.log('CRUDModal available:', !!window.CRUDModal);
  const item = telecomData.find(t => t.id === id);
  if (!item) {
    console.error('Telecom item not found:', id);
    return;
  }
  
  console.log('Calling CRUDModal.delete for telecom:', item);
  window.CRUDModal.delete('Telecom', `${item.nama} - ${item.no_telephone}`, async () => {
    await fetchJson(`/api/telecom/${id}`, { method: 'DELETE' });
    window.toast.success('Telecom deleted');
    await loadTelecom();
  });
};

el('addTelecomBtn').addEventListener('click', () => {
  console.log('📞 Add Telecom button clicked');
  console.log('CRUDModal available:', !!window.CRUDModal);
  window.CRUDModal.create('Add Telecom', [
    { type: 'text', name: 'nama', label: 'Nama', required: true, icon: '👤' },
    { type: 'tel', name: 'no_telephone', label: 'No. Telephone', required: true, icon: '📞', placeholder: '+62...' },
    { type: 'text', name: 'type_product', label: 'Type Product', icon: '📦', placeholder: 'Jenis produk telecom' },
    { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
    { type: 'date', name: 'tanggal_mulai', label: 'Tanggal Mulai', required: true, quickDates: true },
    { type: 'date', name: 'tanggal_selesai', label: 'Tanggal Selesai', quickDates: true, hint: 'Kosongkan jika masih aktif' },
    { type: 'text', name: 'no_rekening', label: 'No. Rekening', icon: '💳', placeholder: 'Nomor rekening' },
    { type: 'text', name: 'bank', label: 'Bank', icon: '🏦', placeholder: 'Nama bank' },
    { type: 'text', name: 'nama_rekening', label: 'Nama Rekening', icon: '👤', placeholder: 'Nama pemilik rekening' },
    { type: 'date', name: 'estimasi_pengambilan', label: 'Estimasi Pengambilan', quickDates: true },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'select', name: 'deposit', label: 'Deposit Status', required: true, options: [
      { value: 'sudah', label: 'Sudah' },
      { value: 'belum', label: 'Belum' }
    ]},
    { type: 'currency', name: 'jumlah_deposit', label: 'Jumlah Deposit', currency: 'Rp', min: 0 },
    { type: 'date', name: 'tanggal_pengambilan', label: 'Tanggal Pengambilan', quickDates: true },
    { type: 'date', name: 'tanggal_pengembalian', label: 'Tanggal Pengembalian', quickDates: true }
  ], async (formData) => {
    await fetchJson('/api/telecom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
    window.toast.success('Telecom added');
    await loadTelecom();
  }, {
    entity: 'telecom',
    validation: { nama: { required: true }, no_telephone: { required: true }, tanggal_mulai: { required: true }, region_id: { required: true }, staff_name: { required: true }, deposit: { required: true } }
  });
});

el('searchTelecom').addEventListener('input', (e) => { filters.search = e.target.value; applyFiltersAndRender(); });

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

