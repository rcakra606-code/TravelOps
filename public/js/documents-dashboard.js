/* =========================================================
   DOCUMENTS DASHBOARD SCRIPT
   Focused analytics for document processing
   ========================================================= */

/* === GLOBAL HELPERS (auth-common.js provides shared auth) === */
const el = id => document.getElementById(id);

/* === DISPLAY USER INFO === */
(() => {
  const user = window.getUser();
  el('userName').textContent = user.name || user.username || '—';
  el('userRole').textContent = { admin: 'Administrator', semiadmin: 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';
})();

/* === CHARTS STORAGE === */
let charts = {};

/* === FILTER STATE === */
let filterState = {
  staff: 'all',
  processType: 'all',
  period: 'all',
  month: '',
  year: ''
};

let usersData = [];

/* === FILTER MANAGEMENT === */
function openDocumentsFilterModal() {
  const user = window.getUser();
  const isBasicUser = user.type === 'basic';
  
  const staffDropdown = isBasicUser ? '' : `
    <div class="form-group">
      <label>Staff</label>
      <select name="staff">
        <option value="all">Semua</option>
        ${usersData.map(u => `<option value="${u.name}" ${filterState.staff === u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
      </select>
    </div>
  `;
  
  window.openModal({
    title: 'Filter Documents Analytics',
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        ${staffDropdown}
        <div class="form-group">
          <label>Tipe Proses</label>
          <select name="processType">
            <option value="all" ${filterState.processType === 'all' ? 'selected' : ''}>Semua</option>
            <option value="normal" ${filterState.processType === 'normal' ? 'selected' : ''}>Normal</option>
            <option value="kilat" ${filterState.processType === 'kilat' ? 'selected' : ''}>Kilat</option>
          </select>
        </div>
        <div class="form-group">
          <label>Periode</label>
          <select name="period" id="modalFilterPeriod">
            <option value="all" ${filterState.period === 'all' ? 'selected' : ''}>Semua</option>
            <option value="month" ${filterState.period === 'month' ? 'selected' : ''}>Bulan</option>
            <option value="year" ${filterState.period === 'year' ? 'selected' : ''}>Tahun</option>
          </select>
        </div>
        <div class="form-group" id="monthGroup" style="display:${filterState.period === 'month' ? 'block' : 'none'}">
          <label>Pilih Bulan</label>
          <input type="month" name="month" value="${filterState.month || ''}">
        </div>
        <div class="form-group" id="yearGroup" style="display:${filterState.period === 'year' ? 'block' : 'none'}">
          <label>Pilih Tahun</label>
          <input type="number" name="year" min="2020" max="2100" value="${filterState.year || ''}" placeholder="YYYY">
        </div>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
        <button type="button" class="btn" data-reset-documents-filters>Reset Filters</button>
      </div>
    `,
    context: { entity: 'documents', action: 'filter' }
  });
  
  setTimeout(() => {
    const periodSelect = document.getElementById('modalFilterPeriod');
    const monthGroup = document.getElementById('monthGroup');
    const yearGroup = document.getElementById('yearGroup');
    
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        monthGroup.style.display = val === 'month' ? 'block' : 'none';
        yearGroup.style.display = val === 'year' ? 'block' : 'none';
      });
    }
  }, 100);
}

function resetDocumentsFilters() {
  filterState = {
    staff: 'all',
    processType: 'all',
    period: 'all',
    month: '',
    year: ''
  };
  if (window.closeModal) window.closeModal();
  renderDashboard();
}

function applyDocumentsFilters(formData) {
  console.log('Applying filters with data:', formData);
  filterState.staff = formData.staff || 'all';
  filterState.processType = formData.processType || 'all';
  filterState.period = formData.period || 'all';
  filterState.month = formData.month || '';
  filterState.year = formData.year || '';
  
  console.log('Updated filterState:', filterState);
  if (window.closeModal) window.closeModal();
  renderDashboard();
}

async function populateFilterDropdowns() {
  try {
    const users = await window.fetchJson('/api/users');
    usersData = users || [];
  } catch (err) {
    console.error('Error loading filter data:', err);
  }
}

/* === RENDER DASHBOARD === */
async function renderDashboard() {
  try {
    const user = window.getUser();
    
    let month = '';
    let year = '';
    
    if (filterState.period === 'month' && filterState.month) {
      const [y, m] = filterState.month.split('-');
      month = m;
      year = y;
    } else if (filterState.period === 'year' && filterState.year) {
      year = filterState.year;
    }
    
    let staff = filterState.staff !== 'all' ? filterState.staff : '';
    
    // For basic users, always filter to their own data
    if (user.type === 'basic') {
      staff = user.name || user.username;
    }
    
    const params = {};
    if (month) params.month = month;
    if (year) params.year = year;
    if (staff) params.staff = staff;
    
    console.log('Rendering documents dashboard with params:', params);
    const q = new URLSearchParams(params).toString();
    console.log('Query string:', q);
    
    // Fetch documents data
    let docsData = await window.fetchJson('/api/documents' + (q ? '?' + q : ''));
    
    console.log('Received docsData count (before processType filter):', docsData?.length || 0);
    
    if (!docsData) return;
    
    // Apply process type filter on client side
    if (filterState.processType !== 'all') {
      docsData = docsData.filter(d => d.process_type === filterState.processType);
      console.log('Filtered docsData count (after processType filter):', docsData.length);
    }
    
    // Destroy existing charts properly and clear canvas references
    Object.keys(charts).forEach(key => {
      if (charts[key] && typeof charts[key].destroy === 'function') {
        try {
          charts[key].destroy();
        } catch (e) {
          console.warn('Error destroying chart:', key, e);
        }
      }
      delete charts[key];
    });
    
    // Clear Chart.js instances from canvas elements
    const canvasIds = ['chartDocumentsMonthly', 'chartProcessTypes', 'chartDocumentsPerStaff', 'chartProcessingTime', 'chartDocumentTypes', 'chartMonthlyTrend'];
    canvasIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
          existingChart.destroy();
        }
      }
    });
    
    // Calculate metrics
    const totalDocs = docsData.length;
    const normalDocs = docsData.filter(d => d.process_type === 'Normal').length;
    const kilatDocs = docsData.filter(d => d.process_type === 'Kilat').length;
    const normalPercent = totalDocs > 0 ? ((normalDocs / totalDocs) * 100).toFixed(1) : 0;
    const kilatPercent = totalDocs > 0 ? ((kilatDocs / totalDocs) * 100).toFixed(1) : 0;
    
    // Calculate average processing time
    let totalDays = 0;
    let countWithDates = 0;
    docsData.forEach(doc => {
      if (doc.receive_date && doc.send_date) {
        const receive = new Date(doc.receive_date);
        const send = new Date(doc.send_date);
        const days = Math.ceil((send - receive) / (24 * 60 * 60 * 1000));
        if (days >= 0) {
          totalDays += days;
          countWithDates++;
        }
      }
    });
    const avgDays = countWithDates > 0 ? Math.round(totalDays / countWithDates) : 0;
    
    // Update metrics
    el('totalDocuments').textContent = totalDocs;
    el('normalDocs').textContent = normalDocs;
    el('kilatDocs').textContent = kilatDocs;
    el('normalPercent').textContent = `${normalPercent}% dari total`;
    el('kilatPercent').textContent = `${kilatPercent}% dari total`;
    el('avgProcessingDays').textContent = avgDays;
    
    // Chart options
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          padding: 12
        }
      }
    };
    
    // Documents per Month
    const monthlyData = {};
    docsData.forEach(doc => {
      if (doc.receive_date) {
        const month = doc.receive_date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + 1;
      }
    });
    
    const sortedMonths = Object.keys(monthlyData).sort();
    const ctxMonthly = document.getElementById('chartDocumentsMonthly')?.getContext('2d');
    if (ctxMonthly) {
      charts.monthly = new Chart(ctxMonthly, {
        type: 'line',
        data: {
          labels: sortedMonths,
          datasets: [{
            label: 'Documents',
            data: sortedMonths.map(m => monthlyData[m]),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });
    }
    
    // Process Types Chart
    const ctxProcess = document.getElementById('chartProcessTypes')?.getContext('2d');
    if (ctxProcess) {
      charts.processTypes = new Chart(ctxProcess, {
        type: 'doughnut',
        data: {
          labels: ['Normal', 'Kilat'],
          datasets: [{
            data: [normalDocs, kilatDocs],
            backgroundColor: ['#10b981', '#f59e0b']
          }]
        },
        options: commonOptions
      });
    }
    
    // Documents per Staff
    const staffData = {};
    docsData.forEach(doc => {
      if (doc.staff_name) {
        staffData[doc.staff_name] = (staffData[doc.staff_name] || 0) + 1;
      }
    });
    
    const ctxStaff = document.getElementById('chartDocumentsPerStaff')?.getContext('2d');
    if (ctxStaff) {
      charts.staff = new Chart(ctxStaff, {
        type: 'bar',
        data: {
          labels: Object.keys(staffData),
          datasets: [{
            label: 'Documents',
            data: Object.values(staffData),
            backgroundColor: '#8b5cf6',
            borderRadius: 8
          }]
        },
        options: {
          ...commonOptions,
          scales: { y: { beginAtZero: true } }
        }
      });
    }
    
    // Processing Time Distribution
    const timeBuckets = { '0-3 days': 0, '4-7 days': 0, '8-14 days': 0, '15-30 days': 0, '30+ days': 0 };
    docsData.forEach(doc => {
      if (doc.receive_date && doc.send_date) {
        const receive = new Date(doc.receive_date);
        const send = new Date(doc.send_date);
        const days = Math.ceil((send - receive) / (24 * 60 * 60 * 1000));
        
        if (days >= 0 && days <= 3) timeBuckets['0-3 days']++;
        else if (days <= 7) timeBuckets['4-7 days']++;
        else if (days <= 14) timeBuckets['8-14 days']++;
        else if (days <= 30) timeBuckets['15-30 days']++;
        else timeBuckets['30+ days']++;
      }
    });
    
    const ctxTime = document.getElementById('chartProcessingTime')?.getContext('2d');
    if (ctxTime) {
      charts.processingTime = new Chart(ctxTime, {
        type: 'bar',
        data: {
          labels: Object.keys(timeBuckets),
          datasets: [{
            label: 'Documents',
            data: Object.values(timeBuckets),
            backgroundColor: '#ec4899',
            borderRadius: 8
          }]
        },
        options: {
          ...commonOptions,
          scales: { y: { beginAtZero: true } }
        }
      });
    }
    
    // Removed document_type breakdown (field not in schema). Instead show process_type distribution already covered by processTypes chart.
    
    // Monthly Trend (Normal vs Kilat)
    const monthlyNormal = {};
    const monthlyKilat = {};
    docsData.forEach(doc => {
      if (doc.receive_date) {
        const month = doc.receive_date.substring(0, 7);
        if (doc.process_type === 'Normal') {
          monthlyNormal[month] = (monthlyNormal[month] || 0) + 1;
        } else if (doc.process_type === 'Kilat') {
          monthlyKilat[month] = (monthlyKilat[month] || 0) + 1;
        }
      }
    });
    
    const allMonths = [...new Set([...Object.keys(monthlyNormal), ...Object.keys(monthlyKilat)])].sort();
    const ctxTrend = document.getElementById('chartMonthlyTrend')?.getContext('2d');
    if (ctxTrend) {
      charts.trend = new Chart(ctxTrend, {
        type: 'line',
        data: {
          labels: allMonths,
          datasets: [
            {
              label: 'Normal',
              data: allMonths.map(m => monthlyNormal[m] || 0),
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.4
            },
            {
              label: 'Kilat',
              data: allMonths.map(m => monthlyKilat[m] || 0),
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: commonOptions
      });
    }
    
    // Pending Documents Table (not sent yet)
    const now = new Date();
    const pendingDocs = docsData.filter(d => !d.send_date || d.send_date === '')
      .sort((a, b) => new Date(a.receive_date) - new Date(b.receive_date));
    
    const tableBody = el('pendingDocsTable');
    if (tableBody) {
      if (pendingDocs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #9ca3af;">Semua dokumen sudah dikirim</td></tr>';
      } else {
        tableBody.innerHTML = pendingDocs.map(doc => {
          const receiveDate = new Date(doc.receive_date);
          const daysPending = Math.ceil((now - receiveDate) / (24 * 60 * 60 * 1000));
          const urgency = daysPending > 14 ? 'background-color: #fef2f2; color: #dc2626;' : daysPending > 7 ? 'background-color: #fef9c3; color: #ca8a04;' : '';
          
          return `
            <tr style="${urgency}">
              <td style="padding: 8px;">${doc.receive_date || '—'}</td>
              <td style="padding: 8px;">${doc.client_name || '—'}</td>
              <td style="padding: 8px;">${doc.process_type || '—'}</td>
              <td style="padding: 8px;">${doc.document_type || '—'}</td>
              <td style="padding: 8px; text-align: right;">${daysPending}</td>
              <td style="padding: 8px;">${doc.staff_name || '—'}</td>
            </tr>
          `;
        }).join('');
      }
    }
    
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    toast.error('Error loading dashboard: ' + err.message);
  }
}

/* === EXPORT CSV === */
el('exportDocumentsCSV')?.addEventListener('click', async () => {
  try {
    const data = await window.fetchJson('/api/documents');
    if (!data || !data.length) {
      toast.warning('Tidak ada data untuk di-export');
      return;
    }
    
    const headers = ['ID', 'Guest Name', 'Process Type', 'Passport Country', 'Receive Date', 'Send Date', 'Staff', 'Created At'];
    const rows = data.map(d => [
      d.id,
      d.guest_name || '',
      d.process_type || '',
      d.passport_country || '',
      d.receive_date || '',
      d.send_date || '',
      d.staff_name || '',
      d.created_at || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documents_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export error:', err);
    toast.error('Error exporting data: ' + err.message);
  }
});

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', async () => {
  const user = window.getUser();
  
  // Set up filter button
  const filterBtn = el('documentsFilterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', openDocumentsFilterModal);
  }
  
  // Handle modal submissions for filters
  document.addEventListener('modalSubmit', (e) => {
    const { data, context } = e.detail;
    if (context.entity === 'documents' && context.action === 'filter') {
      e.preventDefault();
      applyDocumentsFilters(data);
    }
  });
  
  // Handle filter reset
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-reset-documents-filters]')) {
      resetDocumentsFilters();
    }
  });
  
  await populateFilterDropdowns();
  renderDashboard();
  setInterval(renderDashboard, 60000); // Refresh every minute
  
  // Dark mode toggle
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const toggleBtn = document.getElementById('darkModeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      toggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    });
  }
});

/* =========================================================
   CRUD FUNCTIONALITY WITH CRUDMODAL
   ========================================================= */

let documentsDataForCRUD = [];
let documentsFilters = { search: '' };

async function loadDocumentsData() {
  try {
    documentsDataForCRUD = await window.fetchJson('/api/documents') || [];
    renderDocumentsTable();
  } catch (err) {
    console.error('Failed to load documents:', err);
    window.toast.error('Failed to load documents data');
  }
}

function renderDocumentsTable() {
  const tbody = el('documentsTableBody');
  if (!tbody) return;
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      window.editDocument(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      window.deleteDocument(id);
    }
  };
  
  let filtered = [...documentsDataForCRUD];
  if (documentsFilters.search) {
    const search = documentsFilters.search.toLowerCase();
    filtered = filtered.filter(d => 
      (d.guest_name || '').toLowerCase().includes(search) ||
      (d.passport_country || '').toLowerCase().includes(search) ||
      (d.staff_name || '').toLowerCase().includes(search) ||
      (d.booking_code || '').toLowerCase().includes(search)
    );
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No documents found</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(item => `
    <tr class="table-row">
      <td>${item.receive_date || '—'}</td>
      <td><strong>${item.guest_name || '—'}</strong></td>
      <td><span class="badge badge-${item.process_type === 'Kilat' ? 'warning' : 'info'}">${item.process_type || 'Normal'}</span></td>
      <td>${item.passport_country || '—'}</td>
      <td>${item.estimated_done || '—'}</td>
      <td>${item.staff_name || '—'}</td>
      <td class="actions">
        <button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>
        ${window.getUser().type !== 'basic' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `).join('');
}

window.editDocument = async function(id) {
  const item = documentsDataForCRUD.find(d => d.id === id);
  if (!item) return;
  
  window.CRUDModal.edit('Edit Document', [
    { type: 'date', name: 'receive_date', label: 'Receive Date', required: true, quickDates: true },
    { type: 'date', name: 'send_date', label: 'Send Date', quickDates: true },
    { type: 'text', name: 'guest_name', label: 'Guest Name', required: true, icon: '👤', placeholder: 'Nama Tamu' },
    { type: 'text', name: 'passport_country', label: 'Passport/Visa Country', icon: '🌍', placeholder: 'Country name' },
    { type: 'select', name: 'process_type', label: 'Process Type', required: true, options: [
      { value: 'Normal', label: 'Normal' },
      { value: 'Kilat', label: 'Kilat' }
    ]},
    { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
    { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'INV-001' },
    { type: 'tel', name: 'phone_number', label: 'Phone Number', icon: '📞', placeholder: '+62...' },
    { type: 'date', name: 'estimated_done', label: 'Estimated Done', quickDates: true },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'text', name: 'tour_code', label: 'Tour Code', icon: '🎫', placeholder: 'TRV-001' },
    { type: 'textarea', name: 'notes', label: 'Notes', fullWidth: true, rows: 3, maxlength: 500 }
  ], item, async (formData) => {
    await window.fetchJson(`/api/documents/${item.id}`, { method: 'PUT', body: JSON.stringify(formData) });
    window.toast.success('Document updated successfully');
    await Promise.all([loadDocumentsData(), renderDashboard()]);
  }, {
    entity: 'documents',
    size: 'large',
    validation: { receive_date: { required: true }, guest_name: { required: true }, process_type: { required: true }, staff_name: { required: true } }
  });
};

window.deleteDocument = async function(id) {
  const item = documentsDataForCRUD.find(d => d.id === id);
  if (!item) return;
  
  window.CRUDModal.delete('Document', `${item.guest_name || 'this document'}`, async () => {
    await window.fetchJson(`/api/documents/${id}`, { method: 'DELETE' });
    window.toast.success('Document deleted successfully');
    await Promise.all([loadDocumentsData(), renderDashboard()]);
  });
};

if (el('addDocumentBtn')) {
  el('addDocumentBtn').addEventListener('click', () => {
    window.CRUDModal.create('Add Document', [
      { type: 'date', name: 'receive_date', label: 'Receive Date', required: true, quickDates: true },
      { type: 'date', name: 'send_date', label: 'Send Date', quickDates: true },
      { type: 'text', name: 'guest_name', label: 'Guest Name', required: true, icon: '👤', placeholder: 'Nama Tamu' },
      { type: 'text', name: 'passport_country', label: 'Passport/Visa Country', icon: '🌍', placeholder: 'Country name' },
      { type: 'select', name: 'process_type', label: 'Process Type', required: true, options: [
        { value: 'Normal', label: 'Normal' },
        { value: 'Kilat', label: 'Kilat' }
      ]},
      { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
      { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'INV-001' },
      { type: 'tel', name: 'phone_number', label: 'Phone Number', icon: '📞', placeholder: '+62...' },
      { type: 'date', name: 'estimated_done', label: 'Estimated Done', quickDates: true },
      { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
      { type: 'text', name: 'tour_code', label: 'Tour Code', icon: '🎫', placeholder: 'TRV-001' },
      { type: 'textarea', name: 'notes', label: 'Notes', fullWidth: true, rows: 3, maxlength: 500 }
    ], async (formData) => {
      await window.fetchJson('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
      window.toast.success('Document added successfully');
      await Promise.all([loadDocumentsData(), renderDashboard()]);
    }, {
      entity: 'documents',
      size: 'large',
      validation: { receive_date: { required: true }, guest_name: { required: true }, process_type: { required: true }, staff_name: { required: true } }
    });
  });
}

if (el('searchDocuments')) {
  el('searchDocuments').addEventListener('input', (e) => {
    documentsFilters.search = e.target.value;
    renderDocumentsTable();
  });
}

// Load documents data on page load
loadDocumentsData();

