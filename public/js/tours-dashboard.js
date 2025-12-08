/* =========================================================
   TOURS DASHBOARD SCRIPT
   Focused analytics for tours, participants, and departures
   Includes 7-day departure warnings
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
  region: 'all',
  period: 'all',
  month: '',
  year: '',
  dateType: 'departure' // 'departure' or 'registration'
};

let regionsData = [];
let usersData = [];

/* === FILTER MANAGEMENT === */
function openToursFilterModal() {
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
    title: 'Filter Tours Analytics',
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        ${staffDropdown}
        <div class="form-group">
          <label>Region</label>
          <select name="region">
            <option value="all">Semua</option>
            ${regionsData.map(r => `<option value="${r.id}" ${filterState.region == r.id ? 'selected' : ''}>${r.region_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Tipe Tanggal</label>
          <select name="dateType">
            <option value="departure" ${filterState.dateType === 'departure' ? 'selected' : ''}>Tanggal Keberangkatan</option>
            <option value="registration" ${filterState.dateType === 'registration' ? 'selected' : ''}>Tanggal Registrasi</option>
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
        <button type="button" class="btn" data-reset-tours-filters>Reset Filters</button>
      </div>
    `,
    context: { entity: 'tours', action: 'filter' }
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

function resetToursFilters() {
  filterState = {
    staff: 'all',
    region: 'all',
    period: 'all',
    month: '',
    year: '',
    dateType: 'departure'
  };
  if (window.closeModal) window.closeModal();
  renderDashboard();
}

function applyToursFilters(formData) {
  console.log('Applying filters with data:', formData);
  filterState.staff = formData.staff || 'all';
  filterState.region = formData.region || 'all';
  filterState.period = formData.period || 'all';
  filterState.month = formData.month || '';
  filterState.year = formData.year || '';
  filterState.dateType = formData.dateType || 'departure';
  
  console.log('Updated filterState:', filterState);
  if (window.closeModal) window.closeModal();
  renderDashboard();
}

async function populateFilterDropdowns() {
  try {
    const [users, regions] = await Promise.all([
      window.fetchJson('/api/users'),
      window.fetchJson('/api/regions')
    ]);
    
    usersData = users || [];
    regionsData = regions || [];
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
    const region = filterState.region !== 'all' ? filterState.region : '';
    const dateType = filterState.dateType || 'departure';
    
    // For basic users, always filter to their own data
    if (user.type === 'basic') {
      staff = user.name || user.username;
    }
    
    const params = {};
    if (month) params.month = month;
    if (year) params.year = year;
    if (staff) params.staff = staff;
    if (region) params.region = region;
    if (dateType) params.dateType = dateType;
    
    console.log('Rendering tours dashboard with params:', params);
    const q = new URLSearchParams(params).toString();
    console.log('Query string:', q);
    
    // Fetch tours data and metrics
    const [toursData, metrics] = await Promise.all([
      window.fetchJson('/api/tours' + (q ? '?' + q : '')),
      window.fetchJson('/api/metrics' + (q ? '?' + q : ''))
    ]);
    
    console.log('Received toursData count:', toursData?.length || 0);
    console.log('Received metrics:', metrics);
    
    if (!metrics) return;
    
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
    const canvasIds = ['chartParticipantsMonthly', 'chartParticipantsRegion', 'chartTopDestinations', 'chartToursPerStaff', 'chartDepartureTimeline', 'chartPackageTypes'];
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
    const totalParticipants = toursData.reduce((sum, t) => sum + (parseInt(t.jumlah_peserta) || 0), 0);
    const totalTours = toursData.length;
    const avgParticipants = totalTours > 0 ? Math.round(totalParticipants / totalTours) : 0;
    
    // Calculate upcoming departures (next 30 days)
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcomingCount = toursData.filter(t => {
      if (!t.departure_date) return false;
      const depDate = new Date(t.departure_date);
      return depDate >= now && depDate <= thirtyDaysLater;
    }).length;
    
    // Calculate invoice statistics
    const invoicedCount = toursData.filter(t => t.invoice_number && t.invoice_number.trim() !== '').length;
    const notInvoicedCount = totalTours - invoicedCount;
    
    // Update metrics
    el('totalParticipants').textContent = totalParticipants;
    el('totalTours').textContent = totalTours;
    el('avgParticipants').textContent = avgParticipants;
    el('upcomingDepartures').textContent = upcomingCount;
    el('invoicedTours').textContent = invoicedCount;
    el('notInvoicedTours').textContent = notInvoicedCount;
    
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
    
    // Participants per Month
    const monthlyData = {};
    toursData.forEach(tour => {
      if (tour.departure_date) {
        const month = tour.departure_date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + (parseInt(tour.jumlah_peserta) || 0);
      }
    });
    
    const sortedMonths = Object.keys(monthlyData).sort();
    const ctxMonthly = document.getElementById('chartParticipantsMonthly')?.getContext('2d');
    if (ctxMonthly) {
      charts.monthly = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
          labels: sortedMonths,
          datasets: [{
            label: 'Peserta',
            data: sortedMonths.map(m => monthlyData[m]),
            backgroundColor: '#3b82f6',
            borderRadius: 8
          }]
        },
        options: {
          ...commonOptions,
          scales: { y: { beginAtZero: true } }
        }
      });
    }
    
    // Participants per Region (derive name from regions list using region_id)
    const regionList = await window.fetchJson('/api/regions');
    const regionMap = Object.fromEntries((regionList || []).map(r => [String(r.id), r.region_name]));
    const regionData = {};
    toursData.forEach(tour => {
      const rname = regionMap[String(tour.region_id)] || null;
      if (rname) {
        regionData[rname] = (regionData[rname] || 0) + (parseInt(tour.jumlah_peserta) || 0);
      }
    });
    
    const ctxRegion = document.getElementById('chartParticipantsRegion')?.getContext('2d');
    if (ctxRegion && Object.keys(regionData).length) {
      charts.region = new Chart(ctxRegion, {
        type: 'pie',
        data: {
          labels: Object.keys(regionData),
          datasets: [{
            data: Object.values(regionData),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
          }]
        },
        options: commonOptions
      });
    }
    
    // Top 5 Regions (aggregate participants per region)
    const topRegions = Object.entries(regionData)
      .sort((a,b) => b[1] - a[1])
      .slice(0,5);
    const ctxDest = document.getElementById('chartTopDestinations')?.getContext('2d');
    if (ctxDest && topRegions.length) {
      charts.topRegions = new Chart(ctxDest, {
        type: 'bar',
        data: {
          labels: topRegions.map(r => r[0]),
          datasets: [{
            label: 'Peserta',
            data: topRegions.map(r => r[1]),
            backgroundColor: '#10b981',
            borderRadius: 8
          }]
        },
        options: {
          ...commonOptions,
          indexAxis: 'y',
          scales: { x: { beginAtZero: true } },
          plugins: {
            ...commonOptions.plugins,
            title: { display: true, text: 'Top 5 Regions', font: { size: 16, weight: '600' } }
          }
        }
      });
    }
    
    // Tours per Staff
    const staffData = {};
    toursData.forEach(tour => {
      if (tour.staff_name) {
        staffData[tour.staff_name] = (staffData[tour.staff_name] || 0) + 1;
      }
    });
    
    const ctxStaff = document.getElementById('chartToursPerStaff')?.getContext('2d');
    if (ctxStaff) {
      charts.staff = new Chart(ctxStaff, {
        type: 'bar',
        data: {
          labels: Object.keys(staffData),
          datasets: [{
            label: 'Tours',
            data: Object.values(staffData),
            backgroundColor: '#f59e0b',
            borderRadius: 8
          }]
        },
        options: {
          ...commonOptions,
          scales: { y: { beginAtZero: true } }
        }
      });
    }
    
    // Departure Timeline (next 60 days)
    const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const upcoming60 = toursData.filter(t => {
      if (!t.departure_date) return false;
      const depDate = new Date(t.departure_date);
      return depDate >= now && depDate <= sixtyDaysLater;
    });
    
    // Group by week
    const weeklyData = {};
    upcoming60.forEach(tour => {
      const depDate = new Date(tour.departure_date);
      const weekNum = Math.floor((depDate - now) / (7 * 24 * 60 * 60 * 1000));
      const weekLabel = `Week ${weekNum + 1}`;
      weeklyData[weekLabel] = (weeklyData[weekLabel] || 0) + (parseInt(tour.jumlah_peserta) || 0);
    });
    
    const ctxTimeline = document.getElementById('chartDepartureTimeline')?.getContext('2d');
    if (ctxTimeline) {
      charts.timeline = new Chart(ctxTimeline, {
        type: 'line',
        data: {
          labels: Object.keys(weeklyData),
          datasets: [{
            label: 'Peserta',
            data: Object.values(weeklyData),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: commonOptions
      });
    }
    
    // Tour Status Distribution
    const statusData = {};
    toursData.forEach(tour => {
      const status = tour.status || 'Pending';
      statusData[status] = (statusData[status] || 0) + 1;
    });
    
    const ctxPackage = document.getElementById('chartPackageTypes')?.getContext('2d');
    if (ctxPackage && Object.keys(statusData).length) {
      charts.status = new Chart(ctxPackage, {
        type: 'doughnut',
        data: {
          labels: Object.keys(statusData),
          datasets: [{
            data: Object.values(statusData),
            backgroundColor: ['#fbbf24', '#3b82f6', '#10b981', '#ef4444'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            title: { display: true, text: 'Tour Status Distribution', font: { size: 16, weight: '600' } },
            legend: { position: 'bottom' }
          }
        }
      });
    }
    
    // ⚠️ UPCOMING DEPARTURES TABLE (7 days warning)
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcoming7Days = toursData.filter(t => {
      if (!t.departure_date) return false;
      const depDate = new Date(t.departure_date);
      return depDate >= now && depDate <= sevenDaysLater;
    }).sort((a, b) => new Date(a.departure_date) - new Date(b.departure_date));
    
    const tableBody = el('upcomingToursTable');
    if (tableBody) {
      if (upcoming7Days.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #9ca3af;">Tidak ada keberangkatan dalam 7 hari ke depan</td></tr>';
      } else {
        tableBody.innerHTML = upcoming7Days.map(tour => {
          const depDate = new Date(tour.departure_date);
          const daysUntil = Math.ceil((depDate - now) / (24 * 60 * 60 * 1000));
          const urgency = daysUntil <= 3 ? 'background-color: #fef2f2; color: #dc2626;' : daysUntil <= 5 ? 'background-color: #fef9c3; color: #ca8a04;' : '';
          
          return `
            <tr style="${urgency}">
              <td style="padding: 8px;">${tour.departure_date} (${daysUntil}d)</td>
              <td style="padding: 8px;">${tour.tour_name || '—'}</td>
              <td style="padding: 8px;">${tour.region_name || '—'}</td>
              <td style="padding: 8px; text-align: right;">${tour.jumlah_peserta || 0}</td>
              <td style="padding: 8px;">${tour.staff_name || '—'}</td>
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
el('exportToursCSV')?.addEventListener('click', async () => {
  try {
    const data = await window.fetchJson('/api/tours');
    if (!data || !data.length) {
      toast.warning('Tidak ada data untuk di-export');
      return;
    }
    
    const headers = ['ID', 'Tour Name', 'Departure Date', 'Participants', 'Region', 'Staff', 'Created At'];
    const rows = data.map(d => [
      d.id,
      d.tour_name || '',
      d.departure_date || '',
      d.jumlah_peserta || 0,
      d.region_name || '',
      d.staff_name || '',
      d.created_at || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tours_export_${new Date().toISOString().slice(0,10)}.csv`;
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
  const filterBtn = el('toursFilterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', openToursFilterModal);
  }
  
  // Handle modal submissions for filters
  document.addEventListener('modalSubmit', (e) => {
    const { data, context } = e.detail;
    if (context.entity === 'tours' && context.action === 'filter') {
      e.preventDefault();
      applyToursFilters(data);
    }
  });
  
  // Handle filter reset
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-reset-tours-filters]')) {
      resetToursFilters();
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

let toursDataForCRUD = [];
let toursFilters = { search: '' };
let toursPagination = { currentPage: 1, itemsPerPage: 10 };

async function loadToursData() {
  try {
    toursDataForCRUD = await window.fetchJson('/api/tours') || [];
    toursPagination.currentPage = 1; // Reset to first page
    renderToursTable();
  } catch (err) {
    console.error('Failed to load tours:', err);
    window.toast.error('Failed to load tours data');
  }
}

function renderToursTable() {
  const tbody = el('toursTableBody');
  if (!tbody) return;
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      window.editTour(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      window.deleteTour(id);
    }
  };
  
  let filtered = [...toursDataForCRUD];
  if (toursFilters.search) {
    const search = toursFilters.search.toLowerCase();
    filtered = filtered.filter(t => 
      (t.tour_code || '').toLowerCase().includes(search) ||
      (t.lead_passenger || '').toLowerCase().includes(search) ||
      (t.staff_name || '').toLowerCase().includes(search) ||
      (t.booking_code || '').toLowerCase().includes(search)
    );
  }
  
  // Calculate pagination
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / toursPagination.itemsPerPage);
  const startIndex = (toursPagination.currentPage - 1) * toursPagination.itemsPerPage;
  const endIndex = startIndex + toursPagination.itemsPerPage;
  const paginatedData = filtered.slice(startIndex, endIndex);
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="17" class="text-center">No tours found</td></tr>';
    renderToursPagination(0, 0);
    return;
  }
  
  tbody.innerHTML = paginatedData.map(item => {
    const region = regionsData.find(r => r.id === item.region_id);
    const formatCurrency = (val) => val ? `Rp ${parseFloat(val).toLocaleString('id-ID')}` : '—';
    const formatDate = (val) => val ? new Date(val).toLocaleDateString('id-ID') : '—';
    
    return `
    <tr class="table-row">
      <td><strong>${item.tour_code || '—'}</strong></td>
      <td>${item.booking_code || '—'}</td>
      <td>${formatDate(item.registration_date)}</td>
      <td>${formatDate(item.departure_date)}</td>
      <td>${region ? region.region_name : '—'}</td>
      <td>${item.lead_passenger || '—'}</td>
      <td class="text-center">${item.jumlah_peserta || 0}</td>
      <td>${item.phone_number || '—'}</td>
      <td>${item.email || '—'}</td>
      <td><span class="badge badge-${item.status === 'sudah jalan' ? 'success' : item.status === 'tidak jalan' ? 'danger' : 'warning'}">${item.status || 'belum jalan'}</span></td>
      <td>${item.staff_name || '—'}</td>
      <td class="text-right">${formatCurrency(item.tour_price)}</td>
      <td class="text-right">${formatCurrency(item.sales_amount)}</td>
      <td class="text-right">${formatCurrency(item.discount_amount)}</td>
      <td class="text-right">${formatCurrency(item.profit_amount)}</td>
      <td>${item.invoice_number || '—'}</td>
      <td class="actions">
        <button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>
        ${window.getUser().type !== 'basic' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `;
  }).join('');
  
  renderToursPagination(totalItems, totalPages);
}

function renderToursPagination(totalItems, totalPages) {
  const paginationDiv = el('toursPagination');
  if (!paginationDiv) return;
  
  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  
  const { currentPage } = toursPagination;
  let paginationHtml = '<div class="pagination">';
  
  // Previous button
  paginationHtml += `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">« Previous</button>`;
  
  // Page numbers
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  
  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }
  
  if (startPage > 1) {
    paginationHtml += `<button class="pagination-btn" data-page="1">1</button>`;
    if (startPage > 2) paginationHtml += `<span class="pagination-ellipsis">...</span>`;
  }
  
  for (let i = startPage; i <= endPage; i++) {
    paginationHtml += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) paginationHtml += `<span class="pagination-ellipsis">...</span>`;
    paginationHtml += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
  }
  
  // Next button
  paginationHtml += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next »</button>`;
  
  paginationHtml += `</div>`;
  paginationHtml += `<div class="pagination-info">Showing ${((currentPage - 1) * toursPagination.itemsPerPage) + 1}-${Math.min(currentPage * toursPagination.itemsPerPage, totalItems)} of ${totalItems} tours</div>`;
  
  paginationDiv.innerHTML = paginationHtml;
  
  // Add event listeners
  paginationDiv.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      toursPagination.currentPage = parseInt(btn.dataset.page);
      renderToursTable();
    });
  });
}

window.editTour = async function(id) {
  const item = toursDataForCRUD.find(t => t.id === id);
  if (!item) return;
  
  window.CRUDModal.edit('Edit Tour', [
    { type: 'date', name: 'registration_date', label: 'Registration Date', required: true, quickDates: true },
    { type: 'text', name: 'tour_code', label: 'Tour Code', required: true, icon: '🎫', placeholder: 'TRV-001' },
    { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
    { type: 'date', name: 'departure_date', label: 'Departure Date', required: true, quickDates: true },
    { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
    { type: 'select', name: 'status', label: 'Status', required: true, options: [
      { value: 'belum jalan', label: 'Belum Jalan' },
      { value: 'sudah jalan', label: 'Sudah Jalan' },
      { value: 'tidak jalan', label: 'Tidak Jalan' }
    ]},
    { type: 'text', name: 'lead_passenger', label: 'Lead Passenger', required: true, icon: '👤' },
    { type: 'number', name: 'jumlah_peserta', label: 'Participants', required: true, min: 1, defaultValue: 1 },
    { type: 'tel', name: 'phone_number', label: 'Phone Number', icon: '📞', placeholder: '+62...' },
    { type: 'email', name: 'email', label: 'Email', icon: '📧', placeholder: 'email@example.com' },
    { type: 'textarea', name: 'all_passengers', label: 'All Passengers', fullWidth: true, rows: 2, placeholder: 'Comma separated list' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'currency', name: 'tour_price', label: 'Tour Price', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'sales_amount', label: 'Sales Amount', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'discount_amount', label: 'Discount Amount', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'profit_amount', label: 'Profit Amount', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'text', name: 'discount_remarks', label: 'Discount Remarks', placeholder: 'Keterangan diskon' },
    { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'Nomor invoice' },
    { type: 'url', name: 'link_pelunasan_tour', label: 'Payment Link', fullWidth: true, placeholder: 'Google Drive / Lark link' }
  ], item, async (formData) => {
    try {
      console.log('Submitting tour update:', formData);
      await window.fetchJson(`/api/tours/${item.id}`, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData) 
      });
      window.toast.success('Tour updated successfully');
      await Promise.all([loadToursData(), renderDashboard()]);
    } catch (error) {
      console.error('Tour update error:', error);
      window.toast.error('Failed to update tour: ' + (error.message || 'Unknown error'));
    }
  }, {
    entity: 'tours',
    size: 'large',
    validation: { registration_date: { required: true }, tour_code: { required: true }, departure_date: { required: true }, region_id: { required: true }, lead_passenger: { required: true }, jumlah_peserta: { required: true, min: 1 }, staff_name: { required: true } }
  });
};

window.deleteTour = async function(id) {
  const item = toursDataForCRUD.find(t => t.id === id);
  if (!item) return;
  
  window.CRUDModal.delete('Tour', `${item.tour_code || 'this tour'} - ${item.lead_passenger}`, async () => {
    await window.fetchJson(`/api/tours/${id}`, { method: 'DELETE' });
    window.toast.success('Tour deleted successfully');
    await Promise.all([loadToursData(), renderDashboard()]);
  });
};

if (el('addTourBtn')) {
  el('addTourBtn').addEventListener('click', () => {
    window.CRUDModal.create('Add Tour', [
      { type: 'date', name: 'registration_date', label: 'Registration Date', required: true, quickDates: true },
      { type: 'text', name: 'tour_code', label: 'Tour Code', required: true, icon: '🎫', placeholder: 'TRV-001' },
      { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
      { type: 'date', name: 'departure_date', label: 'Departure Date', required: true, quickDates: true },
      { type: 'select', name: 'region_id', label: 'Region', required: true, options: regionsData.map(r => ({ value: r.id, label: r.region_name })) },
      { type: 'select', name: 'status', label: 'Status', required: true, options: [
        { value: 'belum jalan', label: 'Belum Jalan' },
        { value: 'sudah jalan', label: 'Sudah Jalan' },
        { value: 'tidak jalan', label: 'Tidak Jalan' }
      ]},
      { type: 'text', name: 'lead_passenger', label: 'Lead Passenger', required: true, icon: '👤' },
      { type: 'number', name: 'jumlah_peserta', label: 'Participants', required: true, min: 1, defaultValue: 1 },
      { type: 'tel', name: 'phone_number', label: 'Phone Number', icon: '📞', placeholder: '+62...' },
      { type: 'email', name: 'email', label: 'Email', icon: '📧', placeholder: 'email@example.com' },
      { type: 'textarea', name: 'all_passengers', label: 'All Passengers', fullWidth: true, rows: 2, placeholder: 'Comma separated list' },
      { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
      { type: 'currency', name: 'tour_price', label: 'Tour Price', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'sales_amount', label: 'Sales Amount', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'discount_amount', label: 'Discount Amount', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'profit_amount', label: 'Profit Amount', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'text', name: 'discount_remarks', label: 'Discount Remarks', placeholder: 'Keterangan diskon' },
      { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'Nomor invoice' },
      { type: 'url', name: 'link_pelunasan_tour', label: 'Payment Link', fullWidth: true, placeholder: 'Google Drive / Lark link' }
    ], async (formData) => {
      try {
        console.log('Submitting new tour:', formData);
        await window.fetchJson('/api/tours', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(formData) 
        });
        window.toast.success('Tour added successfully');
        await Promise.all([loadToursData(), renderDashboard()]);
      } catch (error) {
        console.error('Tour create error:', error);
        window.toast.error('Failed to add tour: ' + (error.message || 'Unknown error'));
      }
    }, {
      entity: 'tours',
      size: 'large',
      validation: { registration_date: { required: true }, tour_code: { required: true }, departure_date: { required: true }, region_id: { required: true }, lead_passenger: { required: true }, jumlah_peserta: { required: true, min: 1 }, staff_name: { required: true } }
    });
  });
}

if (el('searchTours')) {
  el('searchTours').addEventListener('input', (e) => {
    toursFilters.search = e.target.value;
    toursPagination.currentPage = 1; // Reset to first page on search
    renderToursTable();
  });
}

// Items per page selector
if (el('toursItemsPerPage')) {
  el('toursItemsPerPage').addEventListener('change', (e) => {
    toursPagination.itemsPerPage = parseInt(e.target.value);
    toursPagination.currentPage = 1; // Reset to first page
    renderToursTable();
  });
}

// Load tours data on page load
loadToursData();

