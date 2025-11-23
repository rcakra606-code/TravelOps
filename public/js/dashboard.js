/* =========================================================
   TRAVELOPS DASHBOARD SCRIPT — FINAL CLEAN VERSION (v4.3)
   Extracted to external module for CSP compliance
   ========================================================= */

// Authentication now handled globally by auth-common.js

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

// Token refresh & fetchJson now provided by auth-common.js
// Keep local formatting helpers only

const csvParse = text => {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines.shift().split(',').map(h => h.trim());
  return lines.map(l => {
    const cols = l.split(',');
    const obj = {};
    header.forEach((h, i) => obj[h] = cols[i] ? cols[i].trim() : '');
    return obj;
  });
};

const downloadFile = (filename, text) => {
  const blob = new Blob([text], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};

function formatCurrency(v) {
  try { return 'Rp ' + Number(v || 0).toLocaleString('id-ID'); }
  catch { return v; }
}

function formatNumberWithCommas(value) {
  // Remove non-numeric characters except decimal point
  const numStr = String(value).replace(/[^\d.]/g, '');
  const parts = numStr.split('.');
  // Add commas to integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function parseFormattedNumber(value) {
  // Remove commas and parse to number
  return parseFloat(String(value).replace(/,/g, '')) || 0;
}

// Export globally for other scripts
window.formatNumberWithCommas = formatNumberWithCommas;
window.parseFormattedNumber = parseFormattedNumber;

/* === NAVIGATION === */
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const t = el(name);
  if (t) t.classList.add('active');
  document.querySelectorAll('#mainNav button[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  localStorage.setItem('activeSection', name);
  
  // Render profile when profile section is shown
  if (name === 'profile') {
    renderProfile();
  }
}
document.querySelectorAll('#mainNav button[data-section]').forEach(b =>
  b.addEventListener('click', () => showSection(b.dataset.section))
);
window.addEventListener('DOMContentLoaded', () => {
  const s = localStorage.getItem('activeSection') || 'summary';
  showSection(s);
  refreshUser();
  startAutoRefresh();
  startTokenRefresh(); // Start token auto-refresh on activity
  
  // Wire logout link to clear session and redirect
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Confirmation dialog
      if (!confirm('Apakah Anda yakin ingin keluar?')) {
        return;
      }
      
      // Clear token refresh interval
      if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
      
      // Show goodbye message
      const user = getUser();
      const userName = user.name || user.username || 'User';
      
      // Create temporary overlay with goodbye message
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
      `;
      
      const message = document.createElement('div');
      message.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 16px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        animation: slideIn 0.4s ease;
      `;
      message.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">👋</div>
        <h2 style="margin: 0 0 8px 0; color: #111827;">Sampai Jumpa, ${userName}!</h2>
        <p style="margin: 0; color: #6b7280;">Terima kasih telah menggunakan TravelOps</p>
      `;
      
      overlay.appendChild(message);
      document.body.appendChild(overlay);
      
      // Clear session and redirect after brief delay
      setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login.html';
      }, 1500);
    });
  }
});

/* === Enhanced Modal Handler === */
const modal = el('modal');
const modalTitle = el('modalTitle');
const modalBody = el('modalBody');
const modalForm = el('modalForm');
const modalClose = el('modalClose');

function openModal({ title, bodyHtml, context, size = 'medium' }) {
  // Reset form state
  if (modalForm) modalForm.reset();
  
  // Set modal content
  if (modalTitle) modalTitle.textContent = title;
  if (modalBody) modalBody.innerHTML = bodyHtml;
  if (modal) modal.dataset.context = JSON.stringify(context || {});
  
  // Set modal size
  const modalCard = modal?.querySelector('.modal-card');
  if (modalCard) modalCard.className = `modal-card modal-${size}`;
  
  // Show modal with animation
  if (modal) modal.classList.add('active');
  
  // Focus first input
  setTimeout(() => {
    const firstInput = modal?.querySelector('input:not([type="hidden"]), select, textarea');
    if (firstInput) firstInput.focus();
  }, 100);
  
  // Initialize any special inputs
  initializeModalInputs();
}

function closeModal(confirmed = false) {
  if (!modal) return;
  
  // Add closing animation
  modal.classList.add('closing');
  
  setTimeout(() => {
    modal.classList.remove('active', 'closing');
    if (modalBody) modalBody.innerHTML = '';
    delete modal.dataset.context;
    
    // Trigger onClose callback if exists
    if (modal.dataset.onClose) {
      try {
        const callback = new Function(modal.dataset.onClose);
        callback(confirmed);
      } catch (err) {
        console.error('Modal close callback error:', err);
      }
    }
  }, 200);
}

function initializeModalInputs() {
  if (!modalBody) return;
  
  // Add currency formatting to number inputs for amounts
  const numberInputs = modalBody.querySelectorAll('input[type="number"]');
  numberInputs.forEach(input => {
    const inputName = input.getAttribute('name');
    // Check if this is an amount/price/financial field
    const isAmountField = inputName && (
      inputName.includes('amount') || 
      inputName.includes('price') || 
      inputName.includes('deposit') || 
      inputName.includes('target')
    );
    
    if (isAmountField) {
      // Change type to text for formatting
      input.setAttribute('type', 'text');
      input.setAttribute('inputmode', 'decimal');
      input.setAttribute('pattern', '[0-9,.]');
      
      // Format existing value
      if (input.value) {
        input.value = formatNumberWithCommas(input.value);
      }
      
      // Format on input
      input.addEventListener('input', function(e) {
        const cursorPos = this.selectionStart;
        const oldLength = this.value.length;
        const oldValue = this.value;
        
        // Format the value
        const formatted = formatNumberWithCommas(this.value);
        this.value = formatted;
        
        // Restore cursor position
        const newLength = this.value.length;
        const lengthDiff = newLength - oldLength;
        this.setSelectionRange(cursorPos + lengthDiff, cursorPos + lengthDiff);
      });
      
      // Store original name for form submission
      input.setAttribute('data-original-name', inputName);
    }
  });
  
  // Add validation listeners
  const inputs = modalBody.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.addEventListener('invalid', (e) => {
      e.preventDefault();
      const formGroup = input.closest('.form-group');
      if (formGroup) {
        formGroup.classList.add('error');
        const errorElement = formGroup.querySelector('.error-message');
        if (!errorElement) {
          const error = document.createElement('div');
          error.className = 'error-message';
          error.textContent = input.validationMessage;
          formGroup.appendChild(error);
        }
      }
    });
    
    input.addEventListener('input', () => {
      const formGroup = input.closest('.form-group');
      if (formGroup) {
        formGroup.classList.remove('error');
        const errorElement = formGroup.querySelector('.error-message');
        if (errorElement) errorElement.remove();
      }
    });
  });

  // Allow manual typing for date fields: convert to text with pattern YYYY-MM-DD
  const dateInputs = modalBody.querySelectorAll('input[type="date"]');
  dateInputs.forEach(d => {
    const originalValue = d.value;
    d.setAttribute('type','text');
    d.setAttribute('placeholder','YYYY-MM-DD');
    d.setAttribute('pattern','\\d{4}-\\d{2}-\\d{2}');
    d.setAttribute('inputmode','numeric');
    if (originalValue) d.value = originalValue;
    d.addEventListener('blur', () => {
      if (d.value && !/^\d{4}-\d{2}-\d{2}$/.test(d.value)) {
        d.classList.add('error');
      } else {
        d.classList.remove('error');
      }
    });
  });
}

// Export modal functions globally
window.openModal = openModal;
window.closeModal = closeModal;

// Event Listeners
if (modalClose) modalClose.addEventListener('click', () => closeModal());
if (el('modalCancel')) el('modalCancel').addEventListener('click', () => closeModal());
if (modal) modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});

// Handle form submission
if (modalForm) {
  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
      if (modal) modal.classList.add('loading');
      
      // Get form data
      const formData = new FormData(modalForm);
      const data = Object.fromEntries(formData.entries());
      
      // Get context data
      const context = JSON.parse(modal?.dataset.context || '{}');
      
      // Call API based on context
      if (window.crudHandlers && window.crudHandlers.handleModalSubmit) {
        await window.crudHandlers.handleModalSubmit(data, context);
      }
      
      // Close modal on success
      closeModal(true);
      
      // Refresh data if needed
      if (context.entity && window.crudHandlers) {
        await window.crudHandlers.loadData(context.entity);
        window.crudHandlers.renderTable(context.entity);
      }
    } catch (err) {
      console.error('Form submission error:', err);
      // Show error message
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.style.padding = '12px';
      errorDiv.style.marginBottom = '16px';
      errorDiv.style.background = '#fee2e2';
      errorDiv.style.borderRadius = '8px';
      errorDiv.textContent = err.message || 'An error occurred';
      if (modalBody) modalBody.insertBefore(errorDiv, modalBody.firstChild);
    } finally {
      if (modal) modal.classList.remove('loading');
    }
  });
}

/* === ROLE HANDLER === */
function refreshUser() {
  const u = getUser();
  el('userName').textContent = u.name || u.username || '-';
  el('userRole').textContent = 'Role: ' + (u.type || '-');
  const isAdmin = u.type === 'admin';
  const isBasic = u.type === 'basic';
  if (!isAdmin) el('addTargetBtn').style.display = 'none';
  if (isBasic) document.querySelectorAll('.btn.delete').forEach(b => b.style.display = 'none');
  // Hide Users section and nav only for basic users (semiadmin can access)
  if (isBasic) {
    const usersSection = el('users');
    if (usersSection) usersSection.style.display = 'none';
    const usersNavBtn = document.querySelector('#mainNav button[data-section="users"]');
    if (usersNavBtn) usersNavBtn.style.display = 'none';
    // If currently on Users section, redirect to Dashboard
    const active = document.querySelector('.section.active');
    if (active && active.id === 'users') {
      showSection('summary');
    }
  }
}

/* === REFRESH ALL === */
async function refreshAll() {
  try {
    // Refresh charts
    await renderCharts();
    
    // Refresh CRUD data if handlers are loaded
    if (window.crudHandlers) {
      await Promise.all([
        window.crudHandlers.loadData('sales'),
        window.crudHandlers.loadData('tours'),
        window.crudHandlers.loadData('documents'),
        window.crudHandlers.loadData('targets')
      ]);
      
      // Re-render tables
      const activeSection = document.querySelector('.section.active');
      if (activeSection) {
        const sectionId = activeSection.id;
        if (['sales', 'tours', 'documents', 'targets', 'regions', 'users'].includes(sectionId)) {
          window.crudHandlers.renderTable(sectionId);
        }
      }
    }
    
    // Refresh profile if on profile page
    const activeSection = document.querySelector('.section.active');
    if (activeSection && activeSection.id === 'profile') {
      renderProfile();
    }
  } catch (err) {
    console.error('refreshAll', err);
  }
}

/* === AUTO REFRESH === */
let autoInterval = null;
function startAutoRefresh() {
  if (autoInterval) clearInterval(autoInterval);
  autoInterval = setInterval(() => refreshAll(), 30000);
}
function stopAutoRefresh() { if (autoInterval) clearInterval(autoInterval); autoInterval = null; }

/* === DASHBOARD CHARTS (Chart.js) === */
let charts = {};
async function renderCharts() {
  try {
    // Read from filter controls
    const filterPeriod = el('filterPeriod')?.value || 'all';
    const filterMonth = el('filterMonth')?.value || '';
    const filterYear = el('filterYear')?.value || '';
    const filterStaff = el('filterStaff')?.value || 'all';
    const filterRegion = el('filterRegion')?.value || 'all';
    
    // Build query parameters
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
    const metrics = await fetchJson('/api/metrics' + (q ? '?' + q : ''));
    if (!metrics) return;

    const ctx = id => document.getElementById(id)?.getContext('2d');
    Object.values(charts).forEach(c => c.destroy());
    charts = {};

    const totalSales = metrics.sales?.total_sales || 0;
    const totalProfit = metrics.sales?.total_profit || 0;
    const targetSales = metrics.targets?.target_sales || 0;
    const targetProfit = metrics.targets?.target_profit || 0;

    el('totalSales').textContent = formatCurrency(totalSales);
    el('totalProfit').textContent = formatCurrency(totalProfit);
    el('salesAchievement').textContent = `Achv: ${(totalSales / (targetSales || 1) * 100).toFixed(1)}%`;
    el('profitAchievement').textContent = `Achv: ${(totalProfit / (targetProfit || 1) * 100).toFixed(1)}%`;
    el('totalParticipants').textContent = metrics.participants?.total_participants || 0;
    el('totalDocs').textContent = metrics.documents?.total_docs || 0;

    // Common chart options
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            padding: 20,
            font: {
              family: 'Inter',
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleFont: {
            family: 'Inter',
            size: 13
          },
          bodyFont: {
            family: 'Inter',
            size: 12
          },
          padding: 12,
          cornerRadius: 8,
          boxPadding: 6
        }
      }
    };

    // Sales Chart
    charts.sales = new Chart(ctx('chartSalesTarget'), {
      type: 'bar',
      data: {
        labels: ['Sales', 'Target Sales'],
        datasets: [{
          data: [totalSales, targetSales],
          backgroundColor: ['#2563eb', '#93c5fd'],
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              borderDash: [2, 4],
              color: 'rgba(0, 0, 0, 0.06)'
            },
            ticks: {
              callback: value => 'Rp ' + value.toLocaleString('id-ID')
            }
          }
        },
        plugins: {
          ...commonOptions.plugins,
          title: {
            display: true,
            text: 'Sales Performance',
            font: {
              size: 16,
              weight: '600'
            },
            padding: 20
          }
        }
      }
    });

    // Profit Chart
    charts.profit = new Chart(ctx('chartProfitTarget'), {
      type: 'bar',
      data: {
        labels: ['Profit', 'Target Profit'],
        datasets: [{
          data: [totalProfit, targetProfit],
          backgroundColor: ['#16a34a', '#86efac'],
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              borderDash: [2, 4],
              color: 'rgba(0, 0, 0, 0.06)'
            },
            ticks: {
              callback: value => 'Rp ' + value.toLocaleString('id-ID')
            }
          }
        }
      }
    });

    // Document Type Chart
    const docs = metrics.documents || {};
    charts.docType = new Chart(ctx('chartDocType'), {
      type: 'doughnut',
      data: {
        labels: ['Normal', 'Kilat'],
        datasets: [{
          data: [docs.normal || 0, docs.kilat || 0],
          backgroundColor: ['#38bdf8', '#fbbf24'],
          borderWidth: 0,
          cutout: '60%'
        }]
      },
      options: {
        ...commonOptions,
        plugins: {
          ...commonOptions.plugins,
          legend: {
            position: 'bottom'
          }
        }
      }
    });

    // Documents by Region Chart
    const docsRegion = metrics.participants_by_region || [];
    charts.docsRegion = new Chart(ctx('chartDocsRegion'), {
      type: 'bar',
      data: {
        labels: docsRegion.map(r => r.region_name),
        datasets: [{
          label: 'Participants',
          data: docsRegion.map(r => r.participants),
          backgroundColor: '#f87171',
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              borderDash: [2, 4],
              color: 'rgba(0, 0, 0, 0.06)'
            }
          }
        }
      }
    });

    // Documents by Month Chart
    const docsMonth = metrics.participants_by_month || [];
    charts.docsMonth = new Chart(ctx('chartDocsMonth'), {
      type: 'line',
      data: {
        labels: docsMonth.map(m => 'Bulan ' + m.month),
        datasets: [{
          label: 'Participants',
          data: docsMonth.map(m => m.participants),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              borderDash: [2, 4],
              color: 'rgba(0, 0, 0, 0.06)'
            }
          }
        }
      }
    });

    charts.participantRegion = new Chart(ctx('chartParticipantRegion'), {
      type: 'bar',
      data: { labels: docsRegion.map(r => r.region_name), datasets: [{ data: docsRegion.map(r => r.participants), backgroundColor: '#10b981' }] },
      options: { plugins: { legend: { display: false } } }
    });

    charts.participantMonth = new Chart(ctx('chartParticipantMonth'), {
      type: 'bar',
      data: { labels: docsMonth.map(m => 'Bulan ' + m.month), datasets: [{ data: docsMonth.map(m => m.participants), backgroundColor: '#f97316' }] },
      options: { plugins: { legend: { display: false } } }
    });
  } catch (err) {
    console.error('renderCharts error', err);
  }
}

/* === ACTIVITY LOG === */
async function loadActivity() {
  if (getUser().type !== 'admin') return;
  try {
    const data = await fetchJson('/api/activity_logs');
    if (!data?.length) {
      el('tblActivity').innerHTML = '<tr><td colspan="6">Belum ada aktivitas</td></tr>';
      return;
    }
    const rows = data.map(r => `
      <tr>
        <td>${r.created_at}</td>
        <td>${r.username}</td>
        <td>${r.action}</td>
        <td>${r.entity}</td>
        <td>${r.record_id ?? '-'}</td>
        <td>${r.description ? r.description.slice(0,80) : '-'}</td>
      </tr>`).join('');
    el('tblActivity').innerHTML = rows;
  } catch (err) {
    console.error('Gagal memuat aktivitas:', err);
    el('tblActivity').innerHTML = '<tr><td colspan="6">Gagal memuat data</td></tr>';
  }
}

/* === PROFILE PAGE === */
function renderProfile() {
  const user = getUser();
  
  // Get initials
  const initials = user.name 
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.username ? user.username[0].toUpperCase() : '?';
  
  // Update profile header
  if (el('profileInitials')) el('profileInitials').textContent = initials;
  if (el('profileName')) el('profileName').textContent = user.name || user.username || 'User';
  if (el('profileRole')) {
    const roleText = user.type === 'admin' ? 'Administrator' : 
                     user.type === 'semiadmin' ? 'Semi Admin' : 'Basic User';
    el('profileRole').textContent = roleText;
    el('profileRole').style.background = 
      user.type === 'admin' ? '#dbeafe' : 
      user.type === 'semiadmin' ? '#fef3c7' : '#e0e7ff';
    el('profileRole').style.color = 
      user.type === 'admin' ? '#1e40af' : 
      user.type === 'semiadmin' ? '#92400e' : '#4338ca';
  }
  if (el('profileUsername')) el('profileUsername').textContent = '@' + (user.username || 'unknown');
  
  // Update profile details
  if (el('detailUsername')) el('detailUsername').textContent = user.username || '-';
  if (el('detailName')) el('detailName').textContent = user.name || '-';
  if (el('detailEmail')) el('detailEmail').textContent = user.email || '-';
  if (el('detailType')) {
    const typeText = user.type === 'admin' ? 'Administrator' : 
                     user.type === 'semiadmin' ? 'Semi Admin' : 'Basic User';
    el('detailType').textContent = typeText;
  }
  
  // Load statistics if data is available
  loadProfileStats();
}

async function loadProfileStats() {
  const user = getUser();
  const statsCard = el('profileStats');
  
  if (!statsCard) return;
  
  try {
    // Show stats for all users
    statsCard.style.display = 'block';
    
    // Get user's data
    const sales = await fetchJson('/api/sales');
    const tours = await fetchJson('/api/tours');
    const documents = await fetchJson('/api/documents');
    const targets = await fetchJson('/api/targets');
    
    // Filter by user if not admin
    const userSales = user.type === 'admin' ? sales : sales.filter(s => s.staff_name === user.name);
    const userTours = user.type === 'admin' ? tours : tours.filter(t => t.staff_name === user.name);
    const userDocs = user.type === 'admin' ? documents : documents.filter(d => d.staff_name === user.name);
    const userTargets = user.type === 'admin' ? targets : targets.filter(t => t.staff_name === user.name);
    
    // Update stats
    if (el('statSales')) el('statSales').textContent = userSales.length;
    if (el('statTours')) el('statTours').textContent = userTours.length;
    if (el('statDocs')) el('statDocs').textContent = userDocs.length;
    if (el('statTargets')) el('statTargets').textContent = userTargets.length;
  } catch (err) {
    console.error('Error loading profile stats:', err);
  }
}

// Password change handler
if (el('pwForm')) {
  el('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const password = formData.get('password');
    const passwordConfirm = formData.get('password_confirm');
    
    // Validate password
    if (password.length < 6) {
      alert('Password minimal 6 karakter');
      return;
    }
    
    if (password !== passwordConfirm) {
      alert('Password dan konfirmasi password tidak sama');
      return;
    }
    
    try {
      const user = getUser();
      await fetchJson('/api/users/reset-password', {
        method: 'POST',
        body: { username: user.username, password }
      });
      
      alert('Password berhasil diubah');
      e.target.reset();
    } catch (err) {
      alert('Gagal mengubah password: ' + err.message);
    }
  });
}

/* === FILTER MANAGEMENT === */
function initializeFilters() {
  // Handle period selection to show/hide month/year inputs
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
  
  // Apply filters button
  el('applyFilters')?.addEventListener('click', () => {
    renderCharts();
  });
  
  // Also apply on Enter key in month/year inputs
  el('filterMonth')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') renderCharts();
  });
  el('filterYear')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') renderCharts();
  });
}

function populateFilterDropdowns() {
  // Wait for CRUD handlers to load state
  const checkState = setInterval(() => {
    if (window.crudHandlers?.state?.users && window.crudHandlers?.state?.regions) {
      clearInterval(checkState);
      
      // Populate staff dropdown
      const filterStaff = el('filterStaff');
      if (filterStaff && window.crudHandlers.state.users) {
        const currentValue = filterStaff.value;
        filterStaff.innerHTML = '<option value="all">Semua</option>';
        window.crudHandlers.state.users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.name; // Use name instead of id
          opt.textContent = u.name;
          filterStaff.appendChild(opt);
        });
        filterStaff.value = currentValue;
      }
      
      // Populate region dropdown (use region_name from schema; previously used r.name causing undefined labels)
      const filterRegion = el('filterRegion');
      if (filterRegion && window.crudHandlers.state.regions) {
        const currentValue = filterRegion.value;
        filterRegion.innerHTML = '<option value="all">Semua</option>';
        window.crudHandlers.state.regions.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.region_name; // fix: schema field is region_name
          filterRegion.appendChild(opt);
        });
        filterRegion.value = currentValue;
      }
    }
  }, 100);
  
  // Timeout after 5 seconds if state doesn't load
  setTimeout(() => clearInterval(checkState), 5000);
}

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', () => {
  // Initialize filters
  initializeFilters();
  populateFilterDropdowns();
  
  renderCharts();
  setInterval(renderCharts, 30000);
  if (getUser().type === 'admin') loadActivity();
  
  // Wait for CRUD handlers to be ready
  setTimeout(() => {
    if (window.crudHandlers) {
      console.log('✅ CRUD Handlers loaded successfully');
      
      // Wire up CRUD button handlers
      el('addSalesBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddSalesModal();
      });
      el('addTourBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddTourModal();
      });
      el('addDocBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddDocModal();
      });
      el('addTargetBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddTargetModal();
      });
      el('addRegionBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddRegionModal();
      });
      el('addUserBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddUserModal();
      });
      el('addTelecomBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddTelecomModal();
      });
      
      el('addHotelBookingBtn')?.addEventListener('click', () => {
        window.crudHandlers.openAddHotelBookingModal();
      });
      
      // Initialize CRUD handlers
      window.crudHandlers.init();
    } else {
      console.error('❌ CRUD Handlers not loaded');
    }
  }, 100);
});

// Make CRUD functions globally accessible
window.editSales = (id) => window.crudHandlers?.openEditSalesModal(id);
window.editTour = (id) => window.crudHandlers?.openEditTourModal(id);
window.editDoc = (id) => window.crudHandlers?.openEditDocModal(id);
window.editTarget = (id) => window.crudHandlers?.openEditTargetModal(id);
window.editRegion = (id) => window.crudHandlers?.openEditRegionModal(id);
window.editUser = (id) => window.crudHandlers?.openEditUserModal(id);
window.editTelecom = (id) => window.crudHandlers?.openEditTelecomModal(id);
window.editHotelBooking = (id) => window.crudHandlers?.openEditHotelBookingModal(id);
window.deleteItem = (entity, id) => window.crudHandlers?.deleteItem(entity, id);
