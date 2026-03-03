/* =========================================================
   TOURS DASHBOARD SCRIPT
   Focused analytics for tours, participants, and departures
   Includes 7-day departure warnings
   3-Tab Layout: Tour Data | My Tours | Archived Tours
   ========================================================= */

/* === GLOBAL HELPERS (auth-common.js provides shared auth) === */
const el = id => document.getElementById(id);

// Store interval reference for cleanup
let refreshInterval = null;

/* === TAB MANAGEMENT === */
let currentTab = 'analytics';

function initTabs() {
  const tabButtons = document.querySelectorAll('#toursDashboardTabs .tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Check URL parameter for initial tab
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab');
  if (tabParam && ['tour-data', 'analytics', 'my-tours', 'archived-tours'].includes(tabParam)) {
    switchTab(tabParam);
  }
}

function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('#toursDashboardTabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Show/hide tab content
  document.getElementById('tabTourData').style.display = tabName === 'tour-data' ? '' : 'none';
  document.getElementById('tabAnalytics').style.display = tabName === 'analytics' ? '' : 'none';
  document.getElementById('tabMyTours').style.display = tabName === 'my-tours' ? '' : 'none';
  document.getElementById('tabArchivedTours').style.display = tabName === 'archived-tours' ? '' : 'none';

  // Load tab-specific data
  if (tabName === 'analytics' && toursDataForCRUD.length > 0) {
    renderAnalyticsTab();
  } else if (tabName === 'my-tours' && toursDataForCRUD.length > 0) {
    renderMyToursTab();
  } else if (tabName === 'archived-tours' && toursDataForCRUD.length > 0) {
    renderArchivedTab();
  }

  // Update URL without reload
  const url = new URL(window.location);
  if (tabName === 'analytics') {
    url.searchParams.delete('tab');
  } else {
    url.searchParams.set('tab', tabName);
  }
  window.history.replaceState({}, '', url);
}

function updateTabCounts() {
  if (!toursDataForCRUD.length) return;
  const user = window.getUser();
  const activeTours = toursDataForCRUD.filter(t => !isTourArchived(t) && !isTour2025OrEarlier(t));
  const archivedTours = toursDataForCRUD.filter(t => isTourArchived(t) || isTour2025OrEarlier(t));
  
  let myTours;
  if (user.type === 'admin' || user.type === 'semi-admin' || user.type === 'semiadmin') {
    myTours = toursDataForCRUD;
  } else {
    const staffName = user.name || user.username;
    myTours = toursDataForCRUD.filter(t => t.staff_name && t.staff_name.toLowerCase() === staffName.toLowerCase());
  }

  const countEl1 = el('tabCountTourData');
  const countEl2 = el('tabCountMyTours');
  const countEl3 = el('tabCountArchived');
  if (countEl1) countEl1.textContent = activeTours.length;
  if (countEl2) countEl2.textContent = myTours.length;
  if (countEl3) countEl3.textContent = archivedTours.length;
}

/* =========================================================
   MY TOURS TAB
   ========================================================= */
let mtFilteredTours = [];
let mtAllTours = [];
let mtCurrentPage = 1;
const mtPageSize = 25;
let mtIsAdminView = false;

function initMyToursTab() {
  const user = window.getUser();
  mtIsAdminView = user.type === 'admin' || user.type === 'semi-admin' || user.type === 'semiadmin';

  // Show staff filter/column for admin
  if (mtIsAdminView) {
    const staffGroup = el('mtStaffFilterGroup');
    if (staffGroup) staffGroup.style.display = 'flex';
    document.querySelectorAll('.mt-staff-column').forEach(col => col.style.display = 'table-cell');
  }

  // Setup event listeners
  const mtSearch = el('mtSearchInput');
  if (mtSearch) mtSearch.addEventListener('input', mtDebounce(mtApplyFilters, 300));
  
  ['mtFilterStaff', 'mtFilterYear', 'mtFilterMonth', 'mtFilterStatus', 'mtFilterInvoice'].forEach(id => {
    const elem = el(id);
    if (elem) elem.addEventListener('change', mtApplyFilters);
  });
}

function mtDebounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function renderMyToursTab() {
  const user = window.getUser();

  // Filter to user's tours (basic users) or all tours (admin)
  // Exclude archived and 2025-or-earlier tours (only show active data)
  const activeTours = toursDataForCRUD.filter(t => !isTourArchived(t) && !isTour2025OrEarlier(t));
  
  if (mtIsAdminView) {
    mtAllTours = [...activeTours];
    // Populate staff filter dropdown
    const uniqueStaff = [...new Set(activeTours.map(t => t.staff_name).filter(Boolean))].sort();
    const staffSelect = el('mtFilterStaff');
    if (staffSelect) {
      const currentVal = staffSelect.value;
      staffSelect.innerHTML = '<option value="">All Users</option>' + 
        uniqueStaff.map(s => `<option value="${s}" ${s === currentVal ? 'selected' : ''}>${s}</option>`).join('');
    }
  } else {
    const staffName = user.name || user.username;
    mtAllTours = activeTours.filter(t => 
      t.staff_name && t.staff_name.toLowerCase() === staffName.toLowerCase()
    );
  }

  // Populate year filter
  const years = [...new Set(mtAllTours.map(t => t.departure_date ? t.departure_date.substring(0, 4) : null).filter(Boolean))].sort((a, b) => b - a);
  const yearSelect = el('mtFilterYear');
  if (yearSelect) {
    const currentVal = yearSelect.value;
    yearSelect.innerHTML = '<option value="">All Years</option>' + years.map(y => `<option value="${y}" ${y === currentVal ? 'selected' : ''}>${y}</option>`).join('');
  }

  mtApplyFilters();
}

function mtApplyFilters() {
  const search = (el('mtSearchInput')?.value || '').toLowerCase().trim();
  const staffFilter = el('mtFilterStaff')?.value || '';
  const yearFilter = el('mtFilterYear')?.value || '';
  const monthFilter = el('mtFilterMonth')?.value || '';
  const statusFilter = el('mtFilterStatus')?.value || '';
  const invoiceFilter = el('mtFilterInvoice')?.value || '';

  mtFilteredTours = mtAllTours.filter(tour => {
    if (staffFilter && tour.staff_name !== staffFilter) return false;
    if (search) {
      const searchFields = [tour.tour_code, tour.booking_code, tour.lead_passenger, tour.all_passengers, tour.invoice_number, tour.phone_number, tour.email, tour.staff_name].filter(Boolean).join(' ').toLowerCase();
      if (!searchFields.includes(search)) return false;
    }
    if (yearFilter && tour.departure_date) {
      if (tour.departure_date.substring(0, 4) !== yearFilter) return false;
    }
    if (monthFilter && tour.departure_date) {
      if (tour.departure_date.substring(5, 7) !== monthFilter) return false;
    }
    if (statusFilter && tour.status !== statusFilter) return false;
    if (invoiceFilter === 'invoiced' && (!tour.invoice_number || !tour.invoice_number.trim())) return false;
    if (invoiceFilter === 'not-invoiced' && tour.invoice_number && tour.invoice_number.trim()) return false;
    return true;
  });

  mtRenderTable();
  mtUpdateStats();
}

function mtHasActiveFilters() {
  return (el('mtSearchInput')?.value?.trim()) ||
         (el('mtFilterStaff')?.value) ||
         (el('mtFilterYear')?.value) ||
         (el('mtFilterMonth')?.value) ||
         (el('mtFilterStatus')?.value) ||
         (el('mtFilterInvoice')?.value);
}

function mtFormatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

function mtTruncate(str, len) {
  if (!str) return '-';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function mtUpdateStats() {
  const dataForStats = mtFilteredTours.length > 0 || mtHasActiveFilters() ? mtFilteredTours : mtAllTours;
  
  const totalTours = dataForStats.length;
  const totalPassengers = dataForStats.reduce((sum, t) => sum + (parseInt(t.jumlah_peserta) || 0), 0);
  const totalSales = dataForStats.reduce((sum, t) => sum + (parseFloat(t.total_nominal_sales) || parseFloat(t.sales_amount) || 0), 0);
  const avgPax = totalTours > 0 ? Math.round(totalPassengers / totalTours) : 0;

  if (el('mtTotalTours')) el('mtTotalTours').textContent = totalTours;
  if (el('mtTotalPassengers')) el('mtTotalPassengers').textContent = totalPassengers;
  if (el('mtTotalSales')) el('mtTotalSales').textContent = mtFormatCurrency(totalSales);
  if (el('mtAvgPassengers')) el('mtAvgPassengers').textContent = avgPax;

  // Passengers by status
  const paxByStatus = { 'belum jalan': 0, 'sudah jalan': 0, 'tidak jalan': 0 };
  const toursByStatus = { 'belum jalan': 0, 'sudah jalan': 0, 'tidak jalan': 0 };
  dataForStats.forEach(t => {
    const status = (t.status || 'belum jalan').toLowerCase();
    const pax = parseInt(t.jumlah_peserta) || 0;
    if (paxByStatus.hasOwnProperty(status)) { paxByStatus[status] += pax; toursByStatus[status]++; }
  });

  if (el('mtPaxPending')) el('mtPaxPending').textContent = paxByStatus['belum jalan'];
  if (el('mtPaxCompleted')) el('mtPaxCompleted').textContent = paxByStatus['sudah jalan'];
  if (el('mtPaxCancelled')) el('mtPaxCancelled').textContent = paxByStatus['tidak jalan'];

  const maxPax = Math.max(...Object.values(paxByStatus), 1);
  if (el('mtProgressPending')) el('mtProgressPending').style.width = (paxByStatus['belum jalan'] / maxPax * 100) + '%';
  if (el('mtProgressCompleted')) el('mtProgressCompleted').style.width = (paxByStatus['sudah jalan'] / maxPax * 100) + '%';
  if (el('mtProgressCancelled')) el('mtProgressCancelled').style.width = (paxByStatus['tidak jalan'] / maxPax * 100) + '%';

  if (el('mtToursPending')) el('mtToursPending').textContent = toursByStatus['belum jalan'];
  if (el('mtToursCompleted')) el('mtToursCompleted').textContent = toursByStatus['sudah jalan'];
  if (el('mtToursCancelled')) el('mtToursCancelled').textContent = toursByStatus['tidak jalan'];

  // Invoice stats
  const invoicedTours = dataForStats.filter(t => t.invoice_number && t.invoice_number.trim());
  const notInvoicedTours = dataForStats.filter(t => !t.invoice_number || !t.invoice_number.trim());
  const invoiceRate = totalTours > 0 ? Math.round((invoicedTours.length / totalTours) * 100) : 0;

  if (el('mtToursInvoiced')) el('mtToursInvoiced').textContent = invoicedTours.length;
  if (el('mtToursNotInvoiced')) el('mtToursNotInvoiced').textContent = notInvoicedTours.length;
  if (el('mtInvoiceRate')) el('mtInvoiceRate').textContent = invoiceRate + '%';

  const salesInvoiced = invoicedTours.reduce((sum, t) => sum + (parseFloat(t.total_nominal_sales) || parseFloat(t.sales_amount) || 0), 0);
  const salesNotInvoiced = notInvoicedTours.reduce((sum, t) => sum + (parseFloat(t.total_nominal_sales) || parseFloat(t.sales_amount) || 0), 0);
  const invoiceCoverage = totalSales > 0 ? Math.round((salesInvoiced / totalSales) * 100) : 0;

  if (el('mtSalesInvoiced')) el('mtSalesInvoiced').textContent = mtFormatCurrency(salesInvoiced);
  if (el('mtSalesNotInvoiced')) el('mtSalesNotInvoiced').textContent = mtFormatCurrency(salesNotInvoiced);
  if (el('mtToursInvoicedCount')) el('mtToursInvoicedCount').textContent = invoicedTours.length;
  if (el('mtToursNotInvoicedCount')) el('mtToursNotInvoicedCount').textContent = notInvoicedTours.length;
  if (el('mtInvoiceCoverage')) el('mtInvoiceCoverage').textContent = invoiceCoverage + '%';
}

function mtRenderTable() {
  const tbody = el('mtToursTableBody');
  if (!tbody) return;
  const colSpan = mtIsAdminView ? 12 : 11;

  // Event delegation
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.mt-btn-edit');
    const viewBtn = e.target.closest('.mt-btn-view');
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      const tour = toursDataForCRUD.find(t => t.id === id);
      if (tour && isTourArchived(tour)) { window.toast.warning('This tour is archived and cannot be edited'); return; }
      if (tour && !isTour2025OrEarlier(tour) && window.TourWizard) {
        window.TourWizard.edit(id);
      } else {
        window.editTour(id);
      }
    } else if (viewBtn) {
      const id = parseInt(viewBtn.dataset.id);
      if (window.TourWizard) { window.TourWizard.view(id); } else { window.editTour(id); }
    }
  };

  if (mtFilteredTours.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center"><div style="padding:40px;color:var(--text-secondary);">📭 ${mtAllTours.length === 0 ? 'You have no tour bookings yet' : 'No tours match your filters'}</div></td></tr>`;
    if (window.paginationUtils) window.paginationUtils.renderPaginationControls('mtToursPagination', { data: [], currentPage: 1, totalPages: 0, totalItems: 0 }, () => {});
    return;
  }

  // Sort by departure date (newest first)
  const sorted = [...mtFilteredTours].sort((a, b) => (b.departure_date || '').localeCompare(a.departure_date || ''));

  // Paginate
  const paginated = window.paginationUtils ? window.paginationUtils.paginate(sorted, mtCurrentPage, mtPageSize) : { data: sorted, currentPage: 1, totalPages: 1, totalItems: sorted.length };

  tbody.innerHTML = paginated.data.map(tour => {
    const status = (tour.status || 'belum jalan').toLowerCase();
    const statusClass = status === 'sudah jalan' ? 'completed' : status === 'tidak jalan' ? 'cancelled' : 'pending';
    const statusIcon = status === 'sudah jalan' ? '✅' : status === 'tidak jalan' ? '❌' : '⏳';
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    const hasInvoice = tour.invoice_number && tour.invoice_number.trim();
    const staffColumn = mtIsAdminView ? `<td class="mt-staff-column">${tour.staff_name || '-'}</td>` : '';
    const depYear = tour.departure_date ? parseInt(String(tour.departure_date).substring(0, 4), 10) : 2025;
    const is2025 = (isNaN(depYear) || depYear <= 2025) || tour.is_archived === 1;
    const isV2 = tour.data_version === 2;
    const versionBadge = isV2 ? '<span class="badge badge-info" style="margin-left:4px;font-size:10px;">v2</span>' : '';
    const archivedBadge = tour.is_archived === 1 ? '<span class="badge badge-neutral" style="margin-left:4px;font-size:10px;">📦 Archived</span>' : '';
    const editButton = is2025
      ? `<button class="btn btn-sm mt-btn-view" data-id="${tour.id}" title="View (Read-only)">🔍 View</button>`
      : `<button class="btn btn-sm btn-primary mt-btn-edit" data-id="${tour.id}">✏️ Edit</button>`;

    return `<tr class="${is2025 ? 'tour-row-readonly' : ''}">
      <td>${tour.registration_date || '-'}</td>
      <td><strong>${tour.tour_code || '-'}</strong>${versionBadge}${archivedBadge}</td>
      <td>${tour.booking_code || '-'}</td>
      <td title="${tour.lead_passenger || '-'}">${mtTruncate(tour.lead_passenger, 20)}</td>
      ${staffColumn}
      <td style="text-align:center;"><strong>${tour.jumlah_peserta || 0}</strong></td>
      <td>${tour.departure_date || '-'}</td>
      <td><span class="mt-status-chip ${statusClass}">${statusIcon} ${statusText}</span></td>
      <td>${hasInvoice ? `<span class="mt-invoice-status yes">✅ ${tour.invoice_number}</span>` : `<span class="mt-invoice-status no">⏳ Pending</span>`}</td>
      <td>${mtFormatCurrency(tour.total_nominal_sales || tour.sales_amount || 0)}</td>
      <td>${editButton}</td>
    </tr>`;
  }).join('');

  if (window.paginationUtils) {
    window.paginationUtils.renderPaginationControls('mtToursPagination', paginated, (page) => {
      mtCurrentPage = page;
      mtRenderTable();
    });
  }
}

/* =========================================================
   ARCHIVED TOURS TAB
   ========================================================= */
let atFilteredTours = [];
let atAllTours = [];
let atCurrentPage = 1;
const atPageSize = 25;

function renderArchivedTab() {
  // Show both explicitly archived and 2025-departure tours
  atAllTours = toursDataForCRUD.filter(t => isTourArchived(t) || isTour2025OrEarlier(t));

  // Populate region filter
  const uniqueRegions = [...new Set(atAllTours.map(t => t.region_id).filter(Boolean))];
  const regionSelect = el('atFilterRegion');
  if (regionSelect) {
    const currentVal = regionSelect.value;
    regionSelect.innerHTML = '<option value="">All Regions</option>' +
      uniqueRegions.map(rid => {
        const region = regionsData.find(r => r.id === rid);
        const name = region ? region.region_name : `Region ${rid}`;
        return `<option value="${rid}" ${String(rid) === currentVal ? 'selected' : ''}>${name}</option>`;
      }).join('');
  }

  // Populate staff filter
  const uniqueStaff = [...new Set(atAllTours.map(t => t.staff_name).filter(Boolean))].sort();
  const staffSelect = el('atFilterStaff');
  if (staffSelect) {
    const currentVal = staffSelect.value;
    staffSelect.innerHTML = '<option value="">All Staff</option>' +
      uniqueStaff.map(s => `<option value="${s}" ${s === currentVal ? 'selected' : ''}>${s}</option>`).join('');
  }

  // Show archive button for admin if there are unarchived 2025 tours
  const user = window.getUser();
  const archiveBtnTab = el('archiveTours2025BtnTab');
  if (archiveBtnTab && user.type === 'admin') {
    const unarchived2025 = toursDataForCRUD.filter(t => !isTourArchived(t) && isTour2025OrEarlier(t)).length;
    if (unarchived2025 > 0) {
      archiveBtnTab.style.display = '';
      archiveBtnTab.textContent = `📦 Archive 2025 (${unarchived2025})`;
    } else {
      archiveBtnTab.style.display = 'none';
    }
  }

  atApplyFilters();
}

function initArchivedTab() {
  const atSearch = el('atSearchInput');
  if (atSearch) atSearch.addEventListener('input', mtDebounce(atApplyFilters, 300));

  ['atFilterRegion', 'atFilterStaff'].forEach(id => {
    const elem = el(id);
    if (elem) elem.addEventListener('change', atApplyFilters);
  });

  // Archive 2025 button in archived tab
  const archiveBtnTab = el('archiveTours2025BtnTab');
  if (archiveBtnTab) {
    archiveBtnTab.addEventListener('click', async () => {
      const doArchive = async () => {
        try {
          archiveBtnTab.disabled = true;
          archiveBtnTab.textContent = '⏳ Archiving...';
          const result = await window.fetchJson('/api/tours/archive-2025', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }
          });
          window.toast.success(result.message || `Archived ${result.archived} tours`);
          archiveBtnTab.style.display = 'none';
          await loadToursData();
          renderArchivedTab();
          updateTabCounts();
        } catch (err) {
          window.toast.error(err.message || 'Failed to archive tours');
          archiveBtnTab.disabled = false;
          archiveBtnTab.textContent = '📦 Archive 2025';
        }
      };

      if (window.CRUDModal && window.CRUDModal.delete) {
        window.CRUDModal.delete('Archive 2025 Tours', 'all tours with 2025 or earlier departure dates. They will become read-only', doArchive);
      } else if (confirm('Archive all tours with 2025 departure dates? They will become read-only.')) {
        await doArchive();
      }
    });
  }
}

function atApplyFilters() {
  const search = (el('atSearchInput')?.value || '').toLowerCase().trim();
  const regionFilter = el('atFilterRegion')?.value || '';
  const staffFilter = el('atFilterStaff')?.value || '';

  atFilteredTours = atAllTours.filter(tour => {
    if (regionFilter && String(tour.region_id) !== regionFilter) return false;
    if (staffFilter && tour.staff_name !== staffFilter) return false;
    if (search) {
      const searchFields = [tour.tour_code, tour.booking_code, tour.lead_passenger, tour.staff_name, tour.all_passengers].filter(Boolean).join(' ').toLowerCase();
      if (!searchFields.includes(search)) return false;
    }
    return true;
  });

  atRenderTable();
  atUpdateStats();
}

function atUpdateStats() {
  const data = atFilteredTours;
  const totalTours = data.length;
  const totalPassengers = data.reduce((sum, t) => sum + (parseInt(t.jumlah_peserta) || 0), 0);
  const totalSales = data.reduce((sum, t) => sum + (parseFloat(t.total_nominal_sales) || parseFloat(t.sales_amount) || 0), 0);

  if (el('atTotalTours')) el('atTotalTours').textContent = totalTours;
  if (el('atTotalPassengers')) el('atTotalPassengers').textContent = totalPassengers;
  if (el('atTotalSales')) el('atTotalSales').textContent = mtFormatCurrency(totalSales);
}

function atRenderTable() {
  const tbody = el('atToursTableBody');
  if (!tbody) return;

  // Event delegation
  tbody.onclick = (e) => {
    const viewBtn = e.target.closest('.at-btn-view');
    if (viewBtn) {
      const id = parseInt(viewBtn.dataset.id);
      if (window.TourWizard) { window.TourWizard.view(id); } else { window.editTour(id); }
    }
  };

  if (atFilteredTours.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center"><div style="padding:40px;color:var(--text-secondary);">📦 No archived tours found</div></td></tr>';
    if (window.paginationUtils) window.paginationUtils.renderPaginationControls('atToursPagination', { data: [], currentPage: 1, totalPages: 0, totalItems: 0 }, () => {});
    return;
  }

  const sorted = [...atFilteredTours].sort((a, b) => (b.departure_date || '').localeCompare(a.departure_date || ''));
  const paginated = window.paginationUtils ? window.paginationUtils.paginate(sorted, atCurrentPage, atPageSize) : { data: sorted, currentPage: 1, totalPages: 1, totalItems: sorted.length };

  tbody.innerHTML = paginated.data.map(item => {
    const region = regionsData.find(r => r.id === item.region_id);
    const formatCurrency = (val) => val ? `Rp ${parseFloat(val).toLocaleString('id-ID')}` : '—';
    const formatDate = (val) => val ? new Date(val).toLocaleDateString('id-ID') : '—';

    return `<tr class="table-row tour-row-archived">
      <td><strong>${item.tour_code || '—'}</strong><span class="badge badge-neutral" style="margin-left:4px;font-size:10px;">📦</span></td>
      <td>${formatDate(item.registration_date)}</td>
      <td>${formatDate(item.departure_date)}</td>
      <td>${region ? region.region_name : '—'}</td>
      <td>${item.lead_passenger || '—'}</td>
      <td class="text-center">${item.jumlah_peserta || 0}</td>
      <td><span class="badge badge-${item.status === 'sudah jalan' ? 'success' : item.status === 'tidak jalan' ? 'danger' : 'warning'}">${item.status || 'belum jalan'}</span></td>
      <td>${item.staff_name || '—'}</td>
      <td class="text-right">${formatCurrency(item.sales_amount)}</td>
      <td class="actions"><button class="btn btn-sm at-btn-view" data-id="${item.id}" title="View (Read-only)">🔍 View</button></td>
    </tr>`;
  }).join('');

  if (window.paginationUtils) {
    window.paginationUtils.renderPaginationControls('atToursPagination', paginated, (page) => {
      atCurrentPage = page;
      atRenderTable();
    });
  }
}

/* === DISPLAY USER INFO === */
(() => {
  const user = window.getUser();
  el('userName').textContent = user.name || user.username || '—';
  el('userRole').textContent = { admin: 'Administrator', semiadmin: 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';
  
  // Verify toast is available
  if (window.toast) {
    console.log('✅ Toast system initialized on tours dashboard');
  } else {
    console.error('❌ Toast system NOT available on tours dashboard');
  }
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
    title: '🔍 Filter Tours Analytics',
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
              <label><span class="icon">🌍</span> Region</label>
              <select name="region">
                <option value="all">All Regions</option>
                ${regionsData.map(r => `<option value="${r.id}" ${filterState.region == r.id ? 'selected' : ''}>${r.region_name}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <label><span class="icon">📆</span> Date Type</label>
              <select name="dateType">
                <option value="departure" ${filterState.dateType === 'departure' ? 'selected' : ''}>Departure Date</option>
                <option value="registration" ${filterState.dateType === 'registration' ? 'selected' : ''}>Registration Date</option>
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
            <button type="button" class="btn-reset-filter" data-reset-tours-filters>
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
    context: { entity: 'tours', action: 'filter' }
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
  const user = window.getUser();
  
  // Basic users can't access /api/users - skip the call entirely
  if (user.type === 'basic') {
    usersData = [{ name: user.name || user.username }];
  } else {
    // Load users for admin/semi-admin
    try {
      const users = await window.fetchJson('/api/users');
      usersData = users || [];
    } catch (err) {
      console.warn('Could not load users:', err.message);
      usersData = [{ name: user.name || user.username }];
    }
  }
  
  // Load regions independently
  try {
    const regions = await window.fetchJson('/api/regions');
    regionsData = regions || [];
  } catch (err) {
    console.error('Error loading regions:', err);
    regionsData = [];
  }
}

/* === RENDER DASHBOARD === */
async function renderDashboard(preloadedTours) {
  // Don't refresh if modal is open (user might be filling a form)
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('active')) {
    return;
  }
  
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
    
    const q = new URLSearchParams(params).toString();
    
    // Use preloaded tours data if available (from loadToursData), otherwise fetch
    const hasFilters = month || year || staff || region;
    const allToursData = (!hasFilters && preloadedTours) 
      ? preloadedTours 
      : await window.fetchJson('/api/tours' + (q ? '?' + q : ''));
    
    // Only fetch metrics if we actually use them (guard kept for future use)
    // const metrics = await window.fetchJson('/api/metrics' + (q ? '?' + q : ''));
    
    // Filter to active tours only (non-archived, 2026+ departure, must have departure_date)
    const toursData = (allToursData || []).filter(t => {
      if (isTourArchived(t)) return false;
      if (isTour2025OrEarlier(t)) return false;
      return true;
    });
    

    
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
    const canvasIds = ['taChartMonthly', 'taChartStaff', 'taChartStatus', 'taChartInvoice', 'taChartRegion'];
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
    
    // Calculate invoice statistics
    const invoicedCount = toursData.filter(t => t.invoice_number && t.invoice_number.trim() !== '').length;
    const notInvoicedCount = totalTours - invoicedCount;
    
    // Update metrics (stored for analytics tab)
    window._tourMetrics = { totalParticipants, totalTours, avgParticipants, invoicedCount, notInvoicedCount, toursData };
    
    // Participants per Month (data only — chart moved to Analytics tab)
    const monthlyData = {};
    toursData.forEach(tour => {
      if (tour.departure_date) {
        const month = tour.departure_date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + (parseInt(tour.jumlah_peserta) || 0);
      }
    });
    
    const sortedMonths = Object.keys(monthlyData).sort();
    window._tourMonthlyData = { sortedMonths, monthlyData };
    
    // Participants per Region (derive name from regions list using region_id)
    const regionMap = Object.fromEntries((regionsData || []).map(r => [String(r.id), r.region_name]));
    const regionData = {};
    toursData.forEach(tour => {
      const rname = regionMap[String(tour.region_id)] || null;
      if (rname) {
        regionData[rname] = (regionData[rname] || 0) + (parseInt(tour.jumlah_peserta) || 0);
      }
    });
    window._tourRegionData = regionData;
    
    // Tours per Staff
    const staffData = {};
    toursData.forEach(tour => {
      if (tour.staff_name) {
        staffData[tour.staff_name] = (staffData[tour.staff_name] || 0) + 1;
      }
    });
    window._tourStaffData = staffData;
    
    // Tour Status Distribution
    const statusData = {};
    toursData.forEach(tour => {
      const status = tour.status || 'Pending';
      statusData[status] = (statusData[status] || 0) + 1;
    });
    window._tourStatusData = statusData;

    // Render analytics if that tab is currently visible
    if (currentTab === 'analytics') {
      renderAnalyticsTab();
    }
    
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    toast.error('Error loading dashboard: ' + err.message);
  }
}

/* === ANALYTICS TAB RENDERING === */
const analyticsCharts = {};

// Realistic SVG world map continent paths (equirectangular projection, viewBox 0 0 1000 500)
const SVG_WORLD_PATHS = {
  'North America': 'M65,70 C50,62 35,68 28,78 L22,95 C20,102 25,108 32,108 L45,105 C55,98 65,88 78,82 C88,78 95,82 105,88 C115,82 128,76 142,68 L158,60 C172,52 188,46 205,42 C225,38 248,36 270,36 C292,38 312,42 330,50 C342,55 350,62 355,72 L358,85 C358,92 356,100 350,108 C344,116 336,124 326,132 C316,140 306,148 296,155 C288,160 282,166 278,172 C275,178 274,182 275,186 C270,190 262,190 254,192 C244,195 236,194 228,198 C220,204 216,210 218,216 C222,222 230,226 242,230 C254,234 264,238 270,244 L272,250 C268,254 258,248 245,238 C232,228 220,216 210,206 C198,194 188,182 180,170 C172,158 168,144 164,132 C158,120 150,112 138,106 C126,100 112,96 98,92 C84,88 72,84 62,80 Z',
  'Greenland': 'M350,28 C358,22 370,18 382,16 C394,15 404,18 410,24 C414,30 414,40 410,50 L404,60 C398,66 390,70 380,72 C370,72 362,68 356,62 C350,56 348,48 348,40 Z',
  'South America': 'M272,250 C282,244 296,238 312,234 C328,230 344,232 358,240 C372,248 384,260 392,274 C398,288 400,302 398,316 C394,332 386,346 376,358 C366,368 356,376 346,382 C338,386 330,392 324,400 C318,408 314,414 310,418 C306,418 302,412 298,404 C294,392 290,378 288,364 C286,350 284,336 282,322 C280,308 278,294 276,280 C275,268 274,258 272,250 Z',
  'Europe': 'M480,150 C484,156 490,152 496,144 C502,134 500,124 496,114 C492,104 490,96 494,88 C500,80 510,76 524,74 C538,74 550,70 562,72 C572,76 580,82 582,90 C582,98 576,104 570,108 C564,112 562,118 566,126 C570,134 564,140 556,146 C550,150 555,152 566,148 C578,144 590,136 598,126 L604,120 C610,126 608,136 600,146 C592,154 580,160 566,162 C550,164 534,162 518,158 C506,156 496,154 488,152 Z',
  'Africa': 'M466,206 C474,198 488,194 504,196 C520,198 536,200 552,200 C568,198 582,196 596,200 C610,206 622,216 632,230 C640,244 644,260 644,276 C642,294 636,310 626,324 C616,336 604,346 592,352 C580,358 570,360 562,358 C552,354 544,346 536,336 C528,324 524,310 520,296 C516,280 512,264 506,250 C500,236 492,224 482,216 C474,210 468,206 466,206 Z',
  'Asia': 'M604,120 C614,112 630,102 650,94 C672,86 698,80 726,76 C756,74 786,74 814,76 C840,80 862,86 880,96 C894,106 900,118 896,130 C892,140 882,148 870,154 C856,160 842,166 828,172 C814,178 800,184 788,192 C776,200 766,210 758,222 C750,234 744,246 740,256 C734,248 728,236 722,224 C716,212 710,202 700,194 C688,186 674,180 660,176 C646,172 632,166 622,158 C614,150 608,140 605,130 Z',
  'India': 'M700,194 C708,196 718,200 726,208 C734,216 740,226 744,238 C746,248 744,256 740,256 C734,252 728,244 722,234 C716,224 712,214 708,204 C706,200 704,196 700,194 Z',
  'Southeast Asia': 'M788,192 C796,196 806,206 812,220 C818,234 820,248 816,258 C810,266 802,268 792,264 C784,258 778,248 774,238 C770,228 770,218 772,210 C775,202 780,196 788,192 Z',
  'Japan': 'M876,118 C882,112 890,110 896,114 C900,120 898,128 894,136 C890,142 884,144 878,140 C874,136 873,128 876,118 Z',
  'Oceania': 'M822,326 C834,318 852,312 872,314 C892,318 908,326 920,338 C928,348 930,360 924,370 C916,378 904,382 890,380 C874,378 860,372 848,364 C838,356 830,346 826,338 Z',
  'New Zealand': 'M942,380 C946,374 952,372 956,376 C958,382 956,390 952,396 C948,400 944,398 942,394 C940,390 940,384 942,380 Z'
};

// Map region names to continent keys for highlighting
const REGION_CONTINENT_MAP = {
  'domestik': ['Southeast Asia', 'India'],
  'china': ['Asia'],
  'apj': ['Asia', 'Southeast Asia', 'Oceania', 'Japan', 'India', 'New Zealand'],
  'eamea': ['Europe', 'Africa'],
  'japan': ['Japan', 'Asia'],
  'korea': ['Asia'],
  'australia': ['Oceania'],
  'europe': ['Europe'],
  'americas': ['North America', 'South America', 'Greenland'],
  'middle east': ['Asia'],
  'africa': ['Africa'],
  'india': ['India', 'Asia']
};

// Center coordinates for region markers on the map
const REGION_CENTERS = {
  'domestik': { x: 792, y: 230 },
  'china': { x: 810, y: 155 },
  'apj': { x: 860, y: 300 },
  'eamea': { x: 540, y: 140 },
  'japan': { x: 886, y: 128 },
  'korea': { x: 862, y: 145 },
  'australia': { x: 876, y: 348 },
  'europe': { x: 535, y: 128 },
  'americas': { x: 200, y: 140 },
  'middle east': { x: 655, y: 200 },
  'africa': { x: 554, y: 280 },
  'india': { x: 720, y: 224 }
};

function renderSvgMap(regionData) {
  const mapEl = document.getElementById('taSvgMap');
  if (!mapEl) return;

  const activeContinents = new Set();
  const hotContinents = new Set();
  const vals = Object.values(regionData);
  const maxVal = Math.max(...vals, 1);
  const activeMarkers = [];

  Object.entries(regionData).forEach(([name, val]) => {
    const key = name.toLowerCase().trim();
    for (const [regionKey, continents] of Object.entries(REGION_CONTINENT_MAP)) {
      if (key === regionKey || key.includes(regionKey) || regionKey.includes(key)) {
        continents.forEach(c => {
          activeContinents.add(c);
          if (val / maxVal > 0.5) hotContinents.add(c);
        });
      }
    }
    for (const [rk, center] of Object.entries(REGION_CENTERS)) {
      if (key === rk || key.includes(rk) || rk.includes(key)) {
        activeMarkers.push({ ...center, val, name, intensity: val / maxVal });
      }
    }
  });

  // Build full SVG with ocean, graticule, continents, and markers
  let svg = `<svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" class="world-map">`;

  // Defs: gradients and glow filters
  svg += `<defs>
    <linearGradient id="oceanGrad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#091b30"/>
      <stop offset="50%" stop-color="#0e2844"/>
      <stop offset="100%" stop-color="#122a4a"/>
    </linearGradient>
    <filter id="landGlow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="markerGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  // Ocean background
  svg += `<rect width="1000" height="500" fill="url(#oceanGrad)" rx="10"/>`;

  // Graticule grid lines
  svg += `<g class="graticule" opacity="0.06" stroke="#8da0be" fill="none" stroke-width="0.5">`;
  for (let lat = -60; lat <= 80; lat += 30) {
    const y = Math.round((90 - lat) / 180 * 500);
    svg += `<line x1="0" y1="${y}" x2="1000" y2="${y}"/>`;
  }
  for (let lon = -150; lon <= 180; lon += 30) {
    const x = Math.round((lon + 180) / 360 * 1000);
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="500"/>`;
  }
  // Equator slightly brighter
  svg += `<line x1="0" y1="250" x2="1000" y2="250" opacity="0.12"/>`;
  svg += `</g>`;

  // Continent land masses
  svg += `<g class="continents">`;
  Object.entries(SVG_WORLD_PATHS).forEach(([continent, d]) => {
    let cls = 'land';
    if (hotContinents.has(continent)) cls += ' hot';
    else if (activeContinents.has(continent)) cls += ' active';
    svg += `<path d="${d}" class="${cls}"><title>${continent}</title></path>`;
  });
  svg += `</g>`;

  // Animated region markers
  if (activeMarkers.length > 0) {
    svg += `<g class="markers" filter="url(#markerGlow)">`;
    activeMarkers.forEach(m => {
      const r = 5 + m.intensity * 7;
      const opacity = 0.65 + m.intensity * 0.35;
      svg += `<circle cx="${m.x}" cy="${m.y}" r="${r * 1.8}" fill="#d4a843" opacity="${opacity * 0.2}"/>`;
      svg += `<circle cx="${m.x}" cy="${m.y}" r="${r}" fill="#d4a843" opacity="${opacity}">
        <title>${m.name}: ${m.val.toLocaleString()}</title>
        <animate attributeName="r" values="${r};${r + 3};${r}" dur="2.5s" repeatCount="indefinite"/>
      </circle>`;
      svg += `<circle cx="${m.x}" cy="${m.y}" r="2.5" fill="#fff" opacity="0.9"/>`;
    });
    svg += `</g>`;
  }

  svg += `</svg>`;
  mapEl.innerHTML = svg;
}

function renderAnalyticsTab() {
  try {
    const m = window._tourMetrics;
    if (!m) return;

    const regionData = window._tourRegionData || {};
    const { totalParticipants, totalTours, avgParticipants, invoicedCount, notInvoicedCount, toursData } = m;
    const invoiceRate = totalTours > 0 ? Math.round((invoicedCount / totalTours) * 100) : 0;

    // KPI cards
    const setTxt = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    setTxt('taTotalTours', totalTours);
    setTxt('taTotalPax', totalParticipants.toLocaleString());
    setTxt('taAvgPax', avgParticipants);
    setTxt('taInvoiceRate', invoiceRate + '%');
    setTxt('taInvoiceBadge', invoiceRate + '%');

    // Badges (compare with simple heuristic – green if >50% invoiced)
    const tourBadge = el('taToursBadge');
    if (tourBadge) { tourBadge.textContent = totalTours + ' total'; tourBadge.className = 'ta-card-badge blue'; }
    const paxBadge = el('taPaxBadge');
    if (paxBadge) { paxBadge.textContent = totalParticipants + ' pax'; paxBadge.className = 'ta-card-badge green'; }

    // --- SVG Map: highlight active regions ---
    renderSvgMap(regionData);

    // --- Region list (countries-style with totals) ---
    const regionList = el('taRegionList');
    const totalEl = el('taCountriesTotal');
    if (regionList) {
      const totalPax = Object.values(regionData).reduce((s, v) => s + v, 0);
      if (totalEl) totalEl.innerHTML = `<strong>${totalPax.toLocaleString()}</strong> &ndash; All participants`;
      regionList.innerHTML = Object.entries(regionData)
        .sort((a, b) => b[1] - a[1])
        .map(([name, val]) => `<li><span class="cname">${name}</span><span class="cval">${val.toLocaleString()}</span></li>`)
        .join('');
    }

    // --- Also set the big pax number in the separate KPI panel ---
    const paxBigEl = el('taPaxBig');
    if (paxBigEl) paxBigEl.textContent = totalParticipants.toLocaleString();

    Object.keys(analyticsCharts).forEach(k => {
      if (analyticsCharts[k] && typeof analyticsCharts[k].destroy === 'function') {
        try { analyticsCharts[k].destroy(); } catch (e) {}
      }
      delete analyticsCharts[k];
    });
    ['taChartMonthly','taChartStaff','taChartStatus','taChartInvoice','taChartRegion'].forEach(id => {
      const c = document.getElementById(id);
      if (c) { const ch = Chart.getChart(c); if (ch) ch.destroy(); }
    });

    const chartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 }, color: '#8da0be' } },
        tooltip: { backgroundColor: 'rgba(14,27,48,.95)', titleColor: '#d4a843', bodyColor: '#e8ecf2', borderColor: 'rgba(212,168,67,.20)', borderWidth: 1, padding: 10 } }
    };

    // --- Top departure months list ---
    const monthly = window._tourMonthlyData || {};
    const topMonthsList = el('taTopMonths');
    if (topMonthsList && monthly.sortedMonths) {
      const entries = monthly.sortedMonths.map(m => [m, monthly.monthlyData[m]]).sort((a,b) => b[1]-a[1]).slice(0, 8);
      const maxM = Math.max(...entries.map(e => e[1]), 1);
      topMonthsList.innerHTML = entries.map(([mn, val]) => {
        const label = new Date(mn + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        return `<li>
          <span class="ta-list-name">${label}</span>
          <div class="ta-list-bar">
            <div class="ta-list-track"><div class="ta-list-fill" style="width:${Math.round(val/maxM*100)}%; background:#d4a843;"></div></div>
          </div>
          <span class="ta-list-value">${val}</span>
        </li>`;
      }).join('');
    }

    // --- Participants per Month bar chart ---
    if (monthly.sortedMonths) {
      const ctx = document.getElementById('taChartMonthly')?.getContext('2d');
      if (ctx) {
        analyticsCharts.monthly = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: monthly.sortedMonths.map(m => {
              const d = new Date(m + '-01');
              return d.toLocaleDateString('en-US', { month: 'short' });
            }),
            datasets: [{ label: 'Participants', data: monthly.sortedMonths.map(m => monthly.monthlyData[m]),
              backgroundColor: '#d4a843', borderRadius: 6 }]
          },
          options: { ...chartOpts, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#8da0be' } }, x: { grid: { display: false }, ticks: { color: '#8da0be' } } } }
        });
      }
    }

    // --- Tours per Staff bar chart ---
    const staffData = window._tourStaffData || {};
    const ctxStaff = document.getElementById('taChartStaff')?.getContext('2d');
    if (ctxStaff && Object.keys(staffData).length) {
      analyticsCharts.staff = new Chart(ctxStaff, {
        type: 'bar',
        data: {
          labels: Object.keys(staffData),
          datasets: [{ label: 'Tours', data: Object.values(staffData), backgroundColor: '#2d6a8a', borderRadius: 6 }]
        },
        options: { ...chartOpts, indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#8da0be' } }, y: { grid: { display: false }, ticks: { color: '#8da0be' } } } }
      });
    }

    // --- Tour Status doughnut ---
    const statusData = window._tourStatusData || {};
    const ctxStatus = document.getElementById('taChartStatus')?.getContext('2d');
    if (ctxStatus && Object.keys(statusData).length) {
      analyticsCharts.status = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: Object.keys(statusData),
          datasets: [{ data: Object.values(statusData),
            backgroundColor: ['#d4a843','#2d6a8a','#10b981','#ef4444','#8b5cf6'], borderWidth: 2, borderColor: 'rgba(14,27,48,.8)' }]
        },
        options: { ...chartOpts, cutout: '60%' }
      });
    }

    // --- Invoice breakdown doughnut ---
    const ctxInvoice = document.getElementById('taChartInvoice')?.getContext('2d');
    if (ctxInvoice) {
      analyticsCharts.invoice = new Chart(ctxInvoice, {
        type: 'doughnut',
        data: {
          labels: ['Invoiced', 'Not Invoiced'],
          datasets: [{ data: [invoicedCount, notInvoicedCount],
            backgroundColor: ['#10b981','#ef4444'], borderWidth: 2, borderColor: 'rgba(14,27,48,.8)' }]
        },
        options: { ...chartOpts, cutout: '60%' }
      });
    }

    // --- Participants by Region pie ---
    const ctxRegion = document.getElementById('taChartRegion')?.getContext('2d');
    if (ctxRegion && Object.keys(regionData).length) {
      analyticsCharts.region = new Chart(ctxRegion, {
        type: 'pie',
        data: {
          labels: Object.keys(regionData),
          datasets: [{ data: Object.values(regionData),
            backgroundColor: ['#d4a843','#2d6a8a','#b8922e','#ef4444','#8b5cf6','#d4944c','#14b8a6','#1a3a5c'] }]
        },
        options: chartOpts
      });
    }

  } catch (err) {
    console.error('Error rendering analytics tab:', err);
  }
}

/* === EXPORT CSV === */
el('exportToursCSV')?.addEventListener('click', async () => {
  try {
    // Apply current filters to export
    const { staff, region, period, month, year, dateType } = filterState;
    const params = {};
    if (staff !== 'all') params.staff = staff;
    if (region !== 'all') params.region = region;
    if (period === 'month' && month) params.month = month;
    if (period === 'year' && year) params.year = year;
    if (dateType) params.dateType = dateType;
    
    const q = new URLSearchParams(params).toString();
    const data = await window.fetchJson('/api/tours' + (q ? '?' + q : ''));
    
    if (!data || !data.length) {
      toast.warning('Tidak ada data untuk di-export');
      return;
    }
    
    // Get region names for mapping
    const regionList = await window.fetchJson('/api/regions');
    const regionMap = Object.fromEntries((regionList || []).map(r => [String(r.id), r.region_name]));
    
    // Comprehensive headers with all tour fields
    const headers = [
      'ID', 'Registration Date', 'Lead Passenger', 'All Passengers', 'Tour Code', 
      'Region', 'Departure Date', 'Return Date', 'Booking Code', 'Tour Price', 'Sales Amount', 
      'Total Nominal Sales', 'Profit Amount', 'Discount Amount', 'Discount Remarks',
      'Staff', 'Participants', 'Phone', 'Email', 'Status', 'Payment Link', 
      'Invoice Number', 'Created At'
    ];
    
    const rows = data.map(d => [
      d.id || '',
      d.registration_date || '',
      d.lead_passenger || '',
      (d.all_passengers || '').replace(/,/g, ';'), // Replace commas with semicolons to avoid CSV issues
      d.tour_code || '',
      regionMap[String(d.region_id)] || '',
      d.departure_date || '',
      d.return_date || '',
      d.booking_code || '',
      d.tour_price || 0,
      d.sales_amount || 0,
      d.total_nominal_sales || 0,
      d.profit_amount || 0,
      d.discount_amount || 0,
      (d.discount_remarks || '').replace(/,/g, ';'),
      d.staff_name || '',
      d.jumlah_peserta || 0,
      d.phone_number || '',
      d.email || '',
      d.status || '',
      d.link_pelunasan_tour || '',
      d.invoice_number || '',
      d.created_at || ''
    ]);
    
    // Properly escape CSV fields (wrap in quotes if contains comma, quote, or newline)
    const escapeCsvField = (field) => {
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const csv = [
      headers.map(escapeCsvField).join(','),
      ...rows.map(row => row.map(escapeCsvField).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tours_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(`${data.length} tours exported successfully`);
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
  loadToursData(); // This calls renderDashboard() internally after data loads
  
  // Initialize tabs
  initTabs();
  initMyToursTab();
  initArchivedTab();
  
  // Initialize Tour Wizard with loaded data
  initTourWizard();
  
  // Listen for wizard save events (legacy / fallback)
  window.addEventListener('tourWizardSaved', () => {
    loadToursData();
  });
  
  // Auto-refresh every 60 seconds\n  refreshInterval = setInterval(() => {\n    // Don't refresh if modal or wizard is open\n    const modal = document.getElementById('modal');\n    if (modal && modal.classList.contains('active')) return;\n    renderDashboard();\n  }, 60000);
  
  // Cleanup interval on page unload to prevent memory leaks
  window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Alt+N to add new tour
    if (e.altKey && e.key === 'n' && !e.target.matches('input, textarea, select')) {
      e.preventDefault();
      const addBtn = el('addTourBtn');
      if (addBtn) addBtn.click();
    }
    // Escape to close modal
    if (e.key === 'Escape' && document.querySelector('.modal.active')) {
      window.closeModal?.();
    }
  });
});

/* =========================================================
   CRUD FUNCTIONALITY WITH CRUDMODAL
   ========================================================= */

let toursDataForCRUD = [];
let toursFilters = { search: '' };
let toursCurrentPage = 1;
let toursPageSize = 25;

// Initialize Tour Wizard when data is loaded
function initTourWizard() {
  if (window.TourWizard) {
    window.TourWizard.init(regionsData, usersData);
  }
}

// Exposed globally — wizard and other scripts call this to reload table from server
window.loadToursData = function() {
  loadToursData();
};

// Helper: Check if a tour is archived or from 2025 or earlier (view-only)
function isTourArchived(tour) {
  if (!tour) return true;
  return tour.is_archived === 1 || tour.is_archived === true;
}

function isTour2025OrEarlier(tour) {
  if (!tour || !tour.departure_date) return true;
  // Use substring to avoid timezone issues with new Date()
  const dateStr = String(tour.departure_date);
  const depYear = dateStr.includes('T') ? parseInt(dateStr.substring(0, 4), 10) : parseInt(dateStr.substring(0, 4), 10);
  return isNaN(depYear) || depYear <= 2025;
}

// Returns true if tour should be read-only (archived OR 2025-)
function isTourReadOnly(tour) {
  return isTourArchived(tour) || isTour2025OrEarlier(tour);
}

async function loadToursData() {
  console.log('📊 loadToursData() called — fetching from server...');
  const tbody = el('toursTableBody');
  if (tbody && tbody.rows.length === 1) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center">⏳ Loading tours data...</td></tr>';
  }
  try {
    toursDataForCRUD = await window.fetchJson('/api/tours?_t=' + Date.now()) || [];
    console.log('📊 Loaded', toursDataForCRUD.length, 'tours');
    toursCurrentPage = 1; // Reset to first page
    renderToursTable();
    updateTabCounts();
    // Refresh active tab
    if (currentTab === 'my-tours') renderMyToursTab();
    else if (currentTab === 'archived-tours') renderArchivedTab();
    // Refresh dashboard charts/metrics, passing already-loaded data to avoid re-fetching
    renderDashboard(toursDataForCRUD);
  } catch (err) {
    console.error('Failed to load tours:', err);
    if (window.toast) window.toast.error('Failed to load tours data');
  }
}

function renderToursTable() {
  const tbody = el('toursTableBody');
  if (!tbody) return;
  
  // Event delegation for edit/delete/view buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    const viewBtn = e.target.closest('.btn-view-only');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      const tour = toursDataForCRUD.find(t => t.id === id);
      if (tour && isTourArchived(tour)) {
        window.toast.warning('This tour is archived and cannot be edited');
        return;
      }
      // Use wizard for 2026+ tours
      if (tour && !isTour2025OrEarlier(tour) && window.TourWizard) {
        window.TourWizard.edit(id);
      } else {
        window.editTour(id);
      }
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      const tour = toursDataForCRUD.find(t => t.id === id);
      if (tour && isTourArchived(tour)) {
        window.toast.warning('This tour is archived and cannot be deleted');
        return;
      }
      window.deleteTour(id);
    } else if (viewBtn) {
      const id = parseInt(viewBtn.dataset.id);
      // Open wizard in view-only mode for 2025 tours
      if (window.TourWizard) {
        window.TourWizard.view(id);
      } else {
        window.editTour(id); // Fallback to old modal
      }
    }
  };
  
  let filtered = [...toursDataForCRUD];
  
  // Tour Data tab: exclude archived AND 2025-departure tours (they go to Archived Tours tab)
  filtered = filtered.filter(t => !isTourArchived(t) && !isTour2025OrEarlier(t));
  
  if (toursFilters.search) {
    const search = toursFilters.search.toLowerCase();
    filtered = filtered.filter(t => 
      (t.tour_code || '').toLowerCase().includes(search) ||
      (t.lead_passenger || '').toLowerCase().includes(search) ||
      (t.staff_name || '').toLowerCase().includes(search) ||
      (t.booking_code || '').toLowerCase().includes(search)
    );
  }
  
  // Apply pagination using shared utility
  const paginated = window.paginationUtils.paginate(filtered, toursCurrentPage, toursPageSize);
  
  if (paginated.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center">No tours found</td></tr>';
    window.paginationUtils.renderPaginationControls('toursPagination', paginated, (page) => {
      toursCurrentPage = page;
      renderToursTable();
    });
    return;
  }

  tbody.innerHTML = paginated.data.map(item => {
    const region = regionsData.find(r => r.id === item.region_id);
    const formatCurrency = (val) => val ? `Rp ${parseFloat(val).toLocaleString('id-ID')}` : '—';
    const formatDate = (val) => val ? new Date(val).toLocaleDateString('id-ID') : '—';
    const readOnly = isTourReadOnly(item);
    const archived = isTourArchived(item);
    const isV2 = item.data_version === 2;
    
    // Determine action buttons based on archive/year state
    let actionButtons = '';
    if (readOnly) {
      // Archived or 2025 and earlier: View only
      actionButtons = `
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        <button class="btn btn-sm btn-view-only" data-id="${item.id}" title="View (Read-only)">🔍 View</button>
      `;
    } else {
      // 2026+: Full edit
      actionButtons = `
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        <button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>
        ${window.getUser().type !== 'basic' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      `;
    }
    
    // Add version badge for data_version 2 tours
    const versionBadge = isV2 ? '<span class="badge badge-info" style="margin-left:4px;font-size:10px;">v2</span>' : '';
    const archivedBadge = archived ? '<span class="badge badge-neutral" style="margin-left:4px;font-size:10px;">📦 Archived</span>' : '';
    
    return `
    <tr class="table-row ${readOnly ? 'tour-row-readonly' : ''} ${archived ? 'tour-row-archived' : ''}">
      <td><strong>${item.tour_code || '—'}</strong>${versionBadge}${archivedBadge}</td>
      <td>${formatDate(item.registration_date)}</td>
      <td>${formatDate(item.departure_date)}</td>
      <td>${region ? region.region_name : '—'}</td>
      <td>${item.lead_passenger || '—'}</td>
      <td class="text-center">${item.jumlah_peserta || 0}</td>
      <td><span class="badge badge-${item.status === 'sudah jalan' ? 'success' : item.status === 'tidak jalan' ? 'danger' : 'warning'}">${item.status || 'belum jalan'}</span></td>
      <td>${item.staff_name || '—'}</td>
      <td class="text-right">${formatCurrency(item.sales_amount)}</td>
      <td class="text-right">${formatCurrency(item.profit_amount)}</td>
      <td class="actions">
        ${actionButtons}
      </td>
    </tr>
  `;
  }).join('');
  
  // Render pagination controls using shared utility
  window.paginationUtils.renderPaginationControls('toursPagination', paginated, (page) => {
    toursCurrentPage = page;
    renderToursTable();
  });
}

window.editTour = async function(id) {
  const item = toursDataForCRUD.find(t => t.id === id);
  if (!item) return;
  
  window.CRUDModal.edit('Edit Tour', [
    { type: 'date', name: 'registration_date', label: 'Registration Date', required: true },
    { type: 'text', name: 'tour_code', label: 'Tour Code', required: true, icon: '🎫', placeholder: 'TRV-001' },
    { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
    { type: 'date', name: 'departure_date', label: 'Departure Date', required: true },
    { type: 'date', name: 'return_date', label: 'Return Date (Arrival in Jakarta)', icon: '🛬' },
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
    { type: 'textarea', name: 'remarks', label: 'Remarks', fullWidth: true, rows: 3, placeholder: 'Additional notes or remarks' },
    { type: 'currency', name: 'tour_price', label: 'Harga Tour Perorang Sebelum Discount', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'sales_amount', label: 'Harga Tour Perorang Setelah Discount', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'total_nominal_sales', label: 'Total Nominal Invoice', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'discount_amount', label: 'Total Discount Perorang', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'profit_amount', label: 'Profit Amount', currency: 'Rp', min: 0, step: 0.01 },
    { type: 'textarea', name: 'discount_remarks', label: 'Discount Remarks', fullWidth: true, rows: 3, placeholder: 'Keterangan diskon (detail lengkap)' },
    { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'Nomor invoice' },
    { type: 'url', name: 'link_pelunasan_tour', label: 'Payment Link', fullWidth: true, placeholder: 'Google Drive / Lark link' }
  ], item, async (formData) => {
    console.log('Submitting tour update:', formData);
    
    // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
    const currencyFields = ['tour_price', 'sales_amount', 'total_nominal_sales', 'discount_amount', 'profit_amount'];
    currencyFields.forEach(field => {
      if (formData[field]) {
        formData[field] = window.parseFormattedNumber(formData[field]);
      }
    });
    
    // Convert jumlah_peserta to integer
    if (formData.jumlah_peserta) {
      formData.jumlah_peserta = parseInt(formData.jumlah_peserta) || 1;
    }
    
    const idx = toursDataForCRUD.findIndex(i => i.id === item.id);
    if (idx !== -1) Object.assign(toursDataForCRUD[idx], formData);
    renderToursTable();
    updateTabCounts();
    window.fetchJson(`/api/tours/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      .then(() => { window.toast.success('Tour updated!'); setTimeout(() => { window.location.href = window.location.pathname + '?_t=' + Date.now(); }, 500); })
      .catch(err => { window.toast.error(err.message || 'Update failed'); setTimeout(() => { window.location.href = window.location.pathname + '?_t=' + Date.now(); }, 500); });
  }, {
    entity: 'tours',
    size: 'large',
    validation: { registration_date: { required: true }, tour_code: { required: true }, departure_date: { required: true }, region_id: { required: true }, lead_passenger: { required: true }, jumlah_peserta: { required: true, min: 1 }, staff_name: { required: true } }
  });
};

window.deleteTour = async function(id) {
  const item = toursDataForCRUD.find(t => t.id === id);
  if (!item) return;
  
  const itemLabel = `${item.tour_code || 'this tour'} - ${item.lead_passenger || 'Unknown'}`;
  
  // Use confirmDialog directly (with native confirm fallback)
  let confirmed = false;
  if (window.confirmDialog) {
    confirmed = await window.confirmDialog.show({
      title: 'Delete Tour?',
      message: `Are you sure you want to delete "${itemLabel}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: '#dc2626',
      icon: '🗑️'
    });
  } else {
    confirmed = confirm(`Delete tour "${itemLabel}"? This action cannot be undone.`);
  }
  
  if (!confirmed) return;
  
  // Optimistic removal — update table instantly
  toursDataForCRUD = toursDataForCRUD.filter(i => i.id !== id);
  renderToursTable();
  updateTabCounts();
  
  // Fire API in background
  window.fetchJson(`/api/tours/${id}`, { method: 'DELETE' })
    .then(() => { window.toast.success('Tour deleted!'); setTimeout(() => { window.location.href = window.location.pathname + '?_t=' + Date.now(); }, 500); })
    .catch(err => { window.toast.error(err.message || 'Failed to delete tour'); setTimeout(() => { window.location.href = window.location.pathname + '?_t=' + Date.now(); }, 500); });
};

if (el('addTourBtn')) {
  console.log('✅ Add Tour button found in DOM');
  el('addTourBtn').addEventListener('click', () => {
    // Initialize wizard with regions and users data
    initTourWizard();
    
    // Use wizard for new tours (2026+ format)
    if (window.TourWizard) {
      window.TourWizard.create();
      return;
    }
    
    // Fallback to old modal if wizard not available
    try {
      window.CRUDModal.create('Add Tour', [
      { type: 'date', name: 'registration_date', label: 'Registration Date', required: true },
      { type: 'text', name: 'tour_code', label: 'Tour Code', required: true, icon: '🎫', placeholder: 'TRV-001' },
      { type: 'text', name: 'booking_code', label: 'Booking Code', icon: '📋', placeholder: 'BKG-001' },
      { type: 'date', name: 'departure_date', label: 'Departure Date', required: true },
      { type: 'date', name: 'return_date', label: 'Return Date (Arrival in Jakarta)', icon: '🛬' },
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
      { type: 'textarea', name: 'remarks', label: 'Remarks', fullWidth: true, rows: 3, placeholder: 'Additional notes or remarks' },
      { type: 'currency', name: 'tour_price', label: 'Harga Tour Perorang Sebelum Discount', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'sales_amount', label: 'Harga Tour Perorang Setelah Discount', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'total_nominal_sales', label: 'Total Nominal Invoice', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'discount_amount', label: 'Total Discount Perorang', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'profit_amount', label: 'Profit Amount', currency: 'Rp', min: 0, step: 0.01 },
      { type: 'textarea', name: 'discount_remarks', label: 'Discount Remarks', fullWidth: true, rows: 3, placeholder: 'Keterangan diskon (detail lengkap)' },
      { type: 'text', name: 'invoice_number', label: 'Invoice Number', icon: '🧾', placeholder: 'Nomor invoice' },
      { type: 'url', name: 'link_pelunasan_tour', label: 'Payment Link', fullWidth: true, placeholder: 'Google Drive / Lark link' }
    ], async (formData) => {
      console.log('🔥 TOUR CALLBACK STARTED');
      console.log('🔥 FormData received:', formData);
      
      // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
      const currencyFields = ['tour_price', 'sales_amount', 'total_nominal_sales', 'discount_amount', 'profit_amount'];
      currencyFields.forEach(field => {
        if (formData[field]) {
          formData[field] = window.parseFormattedNumber(formData[field]);
        }
      });
      
      // Convert jumlah_peserta to integer
      if (formData.jumlah_peserta) {
        formData.jumlah_peserta = parseInt(formData.jumlah_peserta) || 1;
      }
      
      console.log('🔥 Cleaned FormData:', formData);
      
      toursDataForCRUD.push({ ...formData, id: Date.now() });
      console.log('🔥 API call started');
      renderToursTable();
      updateTabCounts();
      window.fetchJson('/api/tours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
        .then(() => { window.toast.success('Tour added!'); setTimeout(() => { window.location.href = window.location.pathname + '?_t=' + Date.now(); }, 500); })
        .catch(err => { window.toast.error(err.message || 'Create failed'); setTimeout(() => { window.location.href = window.location.pathname + '?_t=' + Date.now(); }, 500); });
    }, {
      entity: 'tours',
      size: 'large',
      validation: { registration_date: { required: true }, tour_code: { required: true }, departure_date: { required: true }, region_id: { required: true }, lead_passenger: { required: true }, jumlah_peserta: { required: true, min: 1 }, staff_name: { required: true } }
    });
    } catch (error) {
      console.error('❌ ERROR calling CRUDModal.create:', error);
      console.error('❌ Error stack:', error.stack);
    }
  });
}

// Archive 2025 tours button (admin only)
const archiveBtn = el('archiveTours2025Btn');
if (archiveBtn) {
  // Show button only for admin
  const user = window.getUser();
  if (user && user.type === 'admin') {
    archiveBtn.style.display = '';
    // Check if there are unarchived 2025 tours
    window.fetchJson('/api/tours/archive-status').then(status => {
      if (status && status.unarchived2025 > 0) {
        archiveBtn.textContent = `📦 Archive 2025 (${status.unarchived2025})`;
        archiveBtn.style.display = '';
      } else {
        archiveBtn.style.display = 'none';
      }
    }).catch(() => {});
  }
  
  archiveBtn.addEventListener('click', async () => {
    // Confirm before archiving
    let confirmed = false;
    if (window.confirmDialog) {
      confirmed = await window.confirmDialog.show({
        title: 'Archive 2025 Tours?',
        message: 'Archive all tours with 2025 or earlier departure dates? They will become read-only and non-editable.',
        confirmText: 'Archive',
        cancelText: 'Cancel',
        confirmColor: '#f59e0b',
        icon: '📦'
      });
    } else {
      confirmed = confirm('Archive all tours with 2025 departure dates? They will become read-only and non-editable.');
    }
    if (!confirmed) return;
    
    try {
      archiveBtn.disabled = true;
      archiveBtn.textContent = '⏳ Archiving...';
      const result = await window.fetchJson('/api/tours/archive-2025', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      window.toast.success(result.message || `Archived ${result.archived} tours`);
      archiveBtn.style.display = 'none';
      await loadToursData();
    } catch (err) {
      window.toast.error(err.message || 'Failed to archive tours');
      archiveBtn.disabled = false;
      archiveBtn.textContent = '📦 Archive 2025';
    }
  });
}

// Search functionality - use searchInput from HTML (fallback to searchTours for backwards compatibility)
const toursSearchInput = el('searchInput') || el('searchTours');
if (toursSearchInput) {
  toursSearchInput.addEventListener('input', (e) => {
    toursFilters.search = e.target.value;
    toursCurrentPage = 1; // Reset to first page on search
    renderToursTable();
  });
}

// Items per page selector
if (el('toursItemsPerPage')) {
  el('toursItemsPerPage').addEventListener('change', (e) => {
    toursPageSize = parseInt(e.target.value) || 25;
    toursCurrentPage = 1; // Reset to first page
    renderToursTable();
  });
}

// Quick View functionality
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = toursDataForCRUD.find(t => t.id == id);
    if (item) {
      window.quickView.open([
        {
          title: 'Tour Information',
          fields: {
            'Tour Code': item.tour_code || '—',
            'Tour Name': item.tour_name || '—',
            'Guest Name': item.guest_name || '—',
            'Registration Date': item.registration_date || '—',
            'Departure Date': item.departure_date || '—',
            'Destination': item.destination || '—'
          }
        },
        {
          title: 'Participant Details',
          fields: {
            'Adult': item.adult_count || 0,
            'Child': item.child_count || 0,
            'Infant': item.infant_count || 0,
            'Total Participants': (item.adult_count || 0) + (item.child_count || 0) + (item.infant_count || 0),
            'Staff Name': item.staff_name || '—',
            'Region': item.region_name || '—'
          }
        },
        {
          title: 'Financial Details',
          fields: {
            'Harga Tour/Org Sebelum Diskon': formatCurrency(item.tour_price),
            'Harga Tour/Org Setelah Diskon': formatCurrency(item.sales_amount),
            'Total Nominal Invoice': formatCurrency(item.total_nominal_sales),
            'Total Discount/Org': formatCurrency(item.discount_amount),
            'Profit Amount': formatCurrency(item.profit_amount),
            'Discount Remarks': item.discount_remarks || '—'
          }
        },
        {
          title: 'Additional Info',
          fields: {
            'Notes': item.notes || '—',
            'Created At': item.created_at ? new Date(item.created_at).toLocaleString() : '—',
            'Tour ID': item.id
          }
        }
      ], `Tour: ${item.tour_code || item.tour_name}`);
    }
  }
});

