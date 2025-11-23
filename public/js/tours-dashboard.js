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

/* === FILTER MANAGEMENT === */
function initializeFilters() {
  el('filterPeriod')?.addEventListener('change', (e) => {
    const period = e.target.value;
    const monthInput = el('filterMonth');
    const yearInput = el('filterYear');
    
    if (period === 'month') {
      monthInput.style.display = 'inline-block';
      yearInput.style.display = 'none';
      yearInput.value = '';
    } else if (period === 'year') {
      monthInput.style.display = 'none';
      yearInput.style.display = 'inline-block';
      monthInput.value = '';
    } else {
      monthInput.style.display = 'none';
      yearInput.style.display = 'none';
      monthInput.value = '';
      yearInput.value = '';
    }
  });
  
  el('applyFilters')?.addEventListener('click', () => {
    renderDashboard();
  });
  
  el('filterMonth')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') renderDashboard();
  });
  el('filterYear')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') renderDashboard();
  });
  
  // Auto-render on filter dropdown change
  el('filterStaff')?.addEventListener('change', () => renderDashboard());
  el('filterRegion')?.addEventListener('change', () => renderDashboard());
}

async function populateFilterDropdowns() {
  try {
    const [users, regions] = await Promise.all([
      window.fetchJson('/api/users'),
      window.fetchJson('/api/regions')
    ]);
    
    const filterStaff = el('filterStaff');
    if (filterStaff && users) {
      filterStaff.innerHTML = '<option value="all">Semua</option>';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.name; // Use name instead of id
        opt.textContent = u.name;
        filterStaff.appendChild(opt);
      });
    }
    
    const filterRegion = el('filterRegion');
    if (filterRegion && regions) {
      filterRegion.innerHTML = '<option value="all">Semua</option>';
      regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.region_name; // fix: correct field
        filterRegion.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error populating filters:', err);
  }
}

/* === RENDER DASHBOARD === */
async function renderDashboard() {
  try {
    const filterPeriod = el('filterPeriod')?.value || 'all';
    const filterMonth = el('filterMonth')?.value || '';
    const filterYear = el('filterYear')?.value || '';
    const filterStaff = el('filterStaff')?.value || 'all';
    const filterRegion = el('filterRegion')?.value || 'all';
    
    let month = '';
    let year = '';
    
    if (filterPeriod === 'month' && filterMonth) {
      const [y, m] = filterMonth.split('-');
      month = m;
      year = y;
    } else if (filterPeriod === 'year' && filterYear) {
      year = filterYear;
    }
    
    const staff = filterStaff !== 'all' ? filterStaff : '';
    const region = filterRegion !== 'all' ? filterRegion : '';
    
    const params = {};
    if (month) params.month = month;
    if (year) params.year = year;
    if (staff) params.staff = staff;
    if (region) params.region = region;
    
    const q = new URLSearchParams(params).toString();
    
    // Fetch tours data and metrics
    const [toursData, metrics] = await Promise.all([
      window.fetchJson('/api/tours' + (q ? '?' + q : '')),
      window.fetchJson('/api/metrics' + (q ? '?' + q : ''))
    ]);
    
    if (!toursData) return;
    
    // Destroy existing charts
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    
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
    
    // Update metrics
    el('totalParticipants').textContent = totalParticipants;
    el('totalTours').textContent = totalTours;
    el('avgParticipants').textContent = avgParticipants;
    el('upcomingDepartures').textContent = upcomingCount;
    
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
    
    // Package Type Distribution (if you have tour type field)
    const ctxPackage = document.getElementById('chartPackageTypes')?.getContext('2d');
    if (ctxPackage) {
      // Placeholder - adjust based on your actual tour type field
      charts.package = new Chart(ctxPackage, {
        type: 'doughnut',
        data: {
          labels: ['Group Tour', 'Private Tour', 'Custom Package'],
          datasets: [{
            data: [
              toursData.filter(t => t.jumlah_peserta >= 10).length,
              toursData.filter(t => t.jumlah_peserta < 10 && t.jumlah_peserta > 0).length,
              toursData.filter(t => t.jumlah_peserta === 0).length
            ],
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b']
          }]
        },
        options: commonOptions
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
    alert('Error loading dashboard: ' + err.message);
  }
}

/* === EXPORT CSV === */
el('exportToursCSV')?.addEventListener('click', async () => {
  try {
    const data = await window.fetchJson('/api/tours');
    if (!data || !data.length) {
      alert('Tidak ada data untuk di-export');
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
    alert('Error exporting data: ' + err.message);
  }
});

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', async () => {
  initializeFilters();
  await populateFilterDropdowns();
  renderDashboard();
  setInterval(renderDashboard, 60000); // Refresh every minute
});
