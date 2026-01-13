/* =========================================================
   DOCUMENTS DASHBOARD SCRIPT
   Focused analytics for document processing
   ========================================================= */

/* === GLOBAL HELPERS (auth-common.js provides shared auth) === */
const el = id => document.getElementById(id);

// Store interval reference for cleanup
let refreshInterval = null;

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
  
  // Generate month options for quick select
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  
  const staffDropdown = isBasicUser ? '' : `
    <div class="filter-group">
      <label><span class="icon">👤</span> Staff</label>
      <select name="staff">
        <option value="all">All Staff</option>
        ${usersData.map(u => `<option value="${u.name}" ${filterState.staff === u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
      </select>
    </div>
  `;
  
  window.openModal({
    title: '🔍 Filter Documents Analytics',
    size: 'medium',
    bodyHtml: `
      <div class="filter-modal-content">
        <!-- Quick Period Filters -->
        <div class="quick-filters">
          <button type="button" class="quick-filter-chip ${filterState.period === 'all' ? 'active' : ''}" data-quick-period="all">
            📊 All Time
          </button>
          <button type="button" class="quick-filter-chip ${filterState.month === currentMonth ? 'active' : ''}" data-quick-period="current">
            📅 This Month
          </button>
          <button type="button" class="quick-filter-chip ${filterState.month === lastMonthStr ? 'active' : ''}" data-quick-period="last">
            📆 Last Month
          </button>
          <button type="button" class="quick-filter-chip ${filterState.year === String(now.getFullYear()) ? 'active' : ''}" data-quick-period="year">
            🗓️ This Year
          </button>
        </div>
        
        <div class="filter-section">
          <div class="filter-section-title">Filter Options</div>
          <div class="filter-grid">
            ${staffDropdown}
            <div class="filter-group">
              <label><span class="icon">📄</span> Process Type</label>
              <select name="processType">
                <option value="all" ${filterState.processType === 'all' ? 'selected' : ''}>All Types</option>
                <option value="normal" ${filterState.processType === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="kilat" ${filterState.processType === 'kilat' ? 'selected' : ''}>Kilat (Express)</option>
              </select>
            </div>
            <div class="filter-group">
              <label><span class="icon">⏱️</span> Period</label>
              <select name="period" id="modalFilterPeriod">
                <option value="all" ${filterState.period === 'all' ? 'selected' : ''}>All Time</option>
                <option value="month" ${filterState.period === 'month' ? 'selected' : ''}>Specific Month</option>
                <option value="year" ${filterState.period === 'year' ? 'selected' : ''}>Specific Year</option>
              </select>
            </div>
          </div>
          
          <!-- Conditional Month/Year Fields -->
          <div class="filter-conditional ${filterState.period === 'month' ? 'visible' : ''}" id="monthGroup">
            <div class="filter-grid filter-grid-single">
              <div class="filter-group">
                <label><span class="icon">📅</span> Select Month</label>
                <input type="month" name="month" value="${filterState.month || ''}">
              </div>
            </div>
          </div>
          <div class="filter-conditional ${filterState.period === 'year' ? 'visible' : ''}" id="yearGroup">
            <div class="filter-grid filter-grid-single">
              <div class="filter-group">
                <label><span class="icon">🗓️</span> Select Year</label>
                <input type="number" name="year" min="2020" max="2100" value="${filterState.year || ''}" placeholder="Enter year (e.g., 2025)">
              </div>
            </div>
          </div>
        </div>
        
        <div class="filter-footer">
          <div class="filter-footer-left">
            <button type="button" class="btn-reset-filter" data-reset-documents-filters>
              🔄 Reset Filters
            </button>
          </div>
          <div class="filter-footer-right">
            <button type="submit" class="btn-apply-filter">
              ✓ Apply Filters
            </button>
          </div>
        </div>
      </div>
    `,
    context: { entity: 'documents', action: 'filter' }
  });
  
  setTimeout(() => {
    const periodSelect = document.getElementById('modalFilterPeriod');
    const monthGroup = document.getElementById('monthGroup');
    const yearGroup = document.getElementById('yearGroup');
    const monthInput = document.querySelector('input[name="month"]');
    const yearInput = document.querySelector('input[name="year"]');
    
    // Period change handler
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        monthGroup.classList.toggle('visible', val === 'month');
        yearGroup.classList.toggle('visible', val === 'year');
      });
    }
    
    // Quick filter handlers
    document.querySelectorAll('[data-quick-period]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.quickPeriod;
        const now = new Date();
        
        document.querySelectorAll('[data-quick-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (action === 'all') {
          periodSelect.value = 'all';
          monthGroup.classList.remove('visible');
          yearGroup.classList.remove('visible');
        } else if (action === 'current') {
          periodSelect.value = 'month';
          monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          monthGroup.classList.add('visible');
          yearGroup.classList.remove('visible');
        } else if (action === 'last') {
          periodSelect.value = 'month';
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          monthInput.value = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
          monthGroup.classList.add('visible');
          yearGroup.classList.remove('visible');
        } else if (action === 'year') {
          periodSelect.value = 'year';
          yearInput.value = String(now.getFullYear());
          yearGroup.classList.add('visible');
          monthGroup.classList.remove('visible');
        }
      });
    });
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
  const user = window.getUser();
  
  // Basic users can't access /api/users - skip the call entirely
  if (user.type === 'basic') {
    usersData = [{ name: user.name || user.username }];
    return;
  }
  
  try {
    const users = await window.fetchJson('/api/users');
    usersData = users || [];
  } catch (err) {
    console.warn('Could not load users:', err.message);
    usersData = [{ name: user.name || user.username }];
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

/* === IMPORT CSV === */
el('importDocumentsBtn')?.addEventListener('click', () => {
  el('importDocumentsFileInput').click();
});

el('importDocumentsFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      toast.error('CSV file is empty or has no data rows');
      return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const imported = [];
    const errors = [];
    const user = window.getUser();
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      
      // Map common header names to our field names
      const mapped = {
        guest_name: row['document name'] || row['document_name'] || row['guest name'] || row['guest_name'] || row['name'] || '',
        process_type: row['document type'] || row['document_type'] || row['process type'] || row['process_type'] || row['type'] || '',
        tour_code: row['tour code'] || row['tour_code'] || '',
        passport_country: row['passport country'] || row['passport_country'] || row['country'] || '',
        receive_date: row['issue date'] || row['issue_date'] || row['receive date'] || row['receive_date'] || '',
        send_date: row['expiry date'] || row['expiry_date'] || row['send date'] || row['send_date'] || '',
        status: row['status'] || 'pending',
        staff_name: row['staff name'] || row['staff_name'] || row['staff'] || user.name || user.username,
        notes: row['notes'] || ''
      };
      
      // Validate required fields
      if (!mapped.guest_name) {
        errors.push(`Row ${i + 1}: Document/Guest name is required`);
        continue;
      }
      
      imported.push(mapped);
    }
    
    if (errors.length > 0) {
      toast.warning(`${errors.length} rows had errors. Importing valid rows...`);
      console.warn('Import errors:', errors);
    }
    
    if (imported.length === 0) {
      toast.error('No valid data to import');
      return;
    }
    
    // Confirm import
    if (!confirm(`Import ${imported.length} documents?`)) {
      return;
    }
    
    // Import each record
    let success = 0;
    for (const record of imported) {
      try {
        await window.fetchJson('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record)
        });
        success++;
      } catch (err) {
        console.error('Failed to import record:', record, err);
      }
    }
    
    toast.success(`Imported ${success} of ${imported.length} documents`);
    renderDashboard();
    
  } catch (err) {
    console.error('Import failed:', err);
    toast.error('Failed to import CSV file');
  }
  
  // Reset file input
  e.target.value = '';
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
  
  // Store interval reference for cleanup
  refreshInterval = setInterval(() => {
    // Don't refresh if modal is open
    const modal = document.getElementById('modal');
    if (modal && modal.classList.contains('active')) {
      return;
    }
    renderDashboard();
  }, 60000); // Refresh every minute
  
  // Cleanup interval on page unload to prevent memory leaks
  window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  });
  
  // Dark mode is handled by theme-toggle.js - no duplicate handler needed here
});

/* =========================================================
   CRUD FUNCTIONALITY WITH CRUDMODAL
   ========================================================= */

let documentsDataForCRUD = [];
let documentsFilters = { search: '' };
let documentsCurrentPage = 1;
const documentsPageSize = 25;

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
  
  // Apply pagination
  const paginated = window.paginationUtils.paginate(filtered, documentsCurrentPage, documentsPageSize);
  
  if (paginated.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No documents found</td></tr>';
    // Still render pagination to show total
    window.paginationUtils.renderPaginationControls('documentsPaginationControls', paginated, (page) => {
      documentsCurrentPage = page;
      renderDocumentsTable();
    });
    return;
  }
  
  tbody.innerHTML = paginated.data.map(item => `
    <tr class="table-row">
      <td>${item.receive_date || '—'}</td>
      <td><strong>${item.guest_name || '—'}</strong></td>
      <td><span class="badge badge-${item.process_type === 'Kilat' ? 'warning' : 'info'}">${item.process_type || 'Normal'}</span></td>
      <td>${item.passport_country || '—'}</td>
      <td>${item.estimated_done || '—'}</td>
      <td>${item.staff_name || '—'}</td>
      <td class="actions">
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        <button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>
        ${window.getUser().type !== 'basic' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `).join('');
  
  // Render pagination controls
  window.paginationUtils.renderPaginationControls('documentsPaginationControls', paginated, (page) => {
    documentsCurrentPage = page;
    renderDocumentsTable();
  });
}

window.editDocument = async function(id) {
  const item = documentsDataForCRUD.find(d => d.id === id);
  if (!item) return;
  
  window.CRUDModal.edit('Edit Document', [
    { type: 'date', name: 'receive_date', label: 'Receive Date', required: true },
    { type: 'date', name: 'send_date', label: 'Send Date' },
    { type: 'text', name: 'guest_name', label: 'Guest Name', required: true, icon: '👤', placeholder: 'Nama Tamu' },
    { type: 'text', name: 'passport_country', label: 'Passport/Visa Country', icon: '🌍', placeholder: 'Country name' },
    { type: 'select', name: 'process_type', label: 'Process Type', required: true, options: [
      { value: 'Normal', label: 'Normal' },
      { value: 'Kilat', label: 'Kilat' }
    ]},
    { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
    { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'INV-001' },
    { type: 'tel', name: 'phone_number', label: 'Phone Number', icon: '📞', placeholder: '+62...' },
    { type: 'date', name: 'estimated_done', label: 'Estimated Done' },
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
      { type: 'date', name: 'receive_date', label: 'Receive Date', required: true },
      { type: 'date', name: 'send_date', label: 'Send Date' },
      { type: 'text', name: 'guest_name', label: 'Guest Name', required: true, icon: '👤', placeholder: 'Nama Tamu' },
      { type: 'text', name: 'passport_country', label: 'Passport/Visa Country', icon: '🌍', placeholder: 'Country name' },
      { type: 'select', name: 'process_type', label: 'Process Type', required: true, options: [
        { value: 'Normal', label: 'Normal' },
        { value: 'Kilat', label: 'Kilat' }
      ]},
      { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
      { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'INV-001' },
      { type: 'tel', name: 'phone_number', label: 'Phone Number', icon: '📞', placeholder: '+62...' },
      { type: 'date', name: 'estimated_done', label: 'Estimated Done' },
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

// Quick View functionality
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = documentsDataForCRUD.find(d => d.id == id);
    if (item) {
      window.quickView.open([
        {
          title: 'Guest Information',
          fields: {
            'Guest Name': item.guest_name || '—',
            'Passport Number': item.passport_number || '—',
            'Passport Country': item.passport_country || '—',
            'Phone Number': item.phone_number || '—'
          }
        },
        {
          title: 'Processing Details',
          fields: {
            'Process Type': item.process_type || 'Normal',
            'Receive Date': item.receive_date || '—',
            'Estimated Done': item.estimated_done || '—',
            'Status': item.status || 'Pending',
            'Staff Name': item.staff_name || '—'
          }
        },
        {
          title: 'Additional Info',
          fields: {
            'Notes': item.notes || '—',
            'Created At': item.created_at ? new Date(item.created_at).toLocaleString() : '—',
            'Document ID': item.id
          }
        }
      ], `Document: ${item.guest_name}`);
    }
  }
});

// Load documents data on page load
loadDocumentsData();

