/* =========================================================
   DOCUMENTS DASHBOARD SCRIPT
   Focused analytics for document processing
   ========================================================= */

/* === AUTHENTICATION CHECK === */
(() => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login.html';
    return;
  }
})();

/* === GLOBAL HELPERS === */
const api = p => p.startsWith('/') ? p : '/' + p;
const el = id => document.getElementById(id);
const getUser = () => JSON.parse(localStorage.getItem('user') || '{}');

const getHeaders = (json = true) => {
  const h = {};
  const token = localStorage.getItem('token');
  if (token) h['Authorization'] = 'Bearer ' + token;
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

async function fetchJson(url, opts = {}) {
  opts.headers = { 
    ...(opts.headers || {}), 
    ...getHeaders(!!opts.body),
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };
  if (opts.body && typeof opts.body === 'object')
    opts.body = JSON.stringify(opts.body);
  const res = await fetch(api(url), opts);
  
  if (res.status === 401) {
    alert('Sesi login telah berakhir. Silakan login kembali.');
    localStorage.clear();
    window.location.href = '/login.html';
    return;
  }
  
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return await res.json();
}

/* === DISPLAY USER INFO === */
(() => {
  const user = getUser();
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
}

async function populateFilterDropdowns() {
  try {
    const users = await fetchJson('/api/users');
    
    const filterStaff = el('filterStaff');
    if (filterStaff && users) {
      filterStaff.innerHTML = '<option value="all">Semua</option>';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        filterStaff.appendChild(opt);
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
    const filterProcessType = el('filterProcessType')?.value || 'all';
    
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
    
    const params = {};
    if (month) params.month = month;
    if (year) params.year = year;
    if (staff) params.staff = staff;
    
    const q = new URLSearchParams(params).toString();
    
    // Fetch documents data
    let docsData = await fetchJson('/api/documents' + (q ? '?' + q : ''));
    
    if (!docsData) return;
    
    // Apply process type filter on client side
    if (filterProcessType !== 'all') {
      docsData = docsData.filter(d => d.process_type === filterProcessType);
    }
    
    // Destroy existing charts
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    
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
    
    // Document Type Breakdown (passport, visa, etc.)
    const typeData = {};
    docsData.forEach(doc => {
      const type = doc.document_type || 'Lainnya';
      typeData[type] = (typeData[type] || 0) + 1;
    });
    
    const ctxDocType = document.getElementById('chartDocumentTypes')?.getContext('2d');
    if (ctxDocType) {
      charts.docTypes = new Chart(ctxDocType, {
        type: 'pie',
        data: {
          labels: Object.keys(typeData),
          datasets: [{
            data: Object.values(typeData),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
          }]
        },
        options: commonOptions
      });
    }
    
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
    alert('Error loading dashboard: ' + err.message);
  }
}

/* === EXPORT CSV === */
el('exportDocumentsCSV')?.addEventListener('click', async () => {
  try {
    const data = await fetchJson('/api/documents');
    if (!data || !data.length) {
      alert('Tidak ada data untuk di-export');
      return;
    }
    
    const headers = ['ID', 'Client Name', 'Document Type', 'Process Type', 'Receive Date', 'Send Date', 'Staff', 'Created At'];
    const rows = data.map(d => [
      d.id,
      d.client_name || '',
      d.document_type || '',
      d.process_type || '',
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
    alert('Error exporting data: ' + err.message);
  }
});

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', () => {
  initializeFilters();
  populateFilterDropdowns();
  renderDashboard();
  setInterval(renderDashboard, 60000); // Refresh every minute
});
