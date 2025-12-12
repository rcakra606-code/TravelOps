/* =========================================================
   TRAVELOPS DASHBOARD SCRIPT — FINAL CLEAN VERSION (v4.3)
   Extracted to external module for CSP compliance
   ========================================================= */

(function() {
'use strict';

// Authentication now handled globally by auth-common.js
// api, getHeaders, fetchJson provided by auth-common.js

/* === PAGE DETECTION === */
const isReportsPage = window.location.pathname.includes('reports-dashboard');

/* === GLOBAL HELPERS (local to this module) === */
const el = id => document.getElementById(id);
// Define helpers locally to avoid timing issues with script loading
const getUser = () => JSON.parse(localStorage.getItem('user') || '{}');
const api = p => p.startsWith('/') ? p : '/' + p;
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
  // Accept any characters, keep digits and separators
  let raw = String(value).replace(/[^0-9,\.]/g,'');
  if (!raw) return '';

  // If a comma exists, we treat comma as decimal (Indonesian locale)
  // Decimal part only valid when 1-2 digits after last comma
  let decSep = null;
  if (raw.includes(',')) {
    const lastComma = raw.lastIndexOf(',');
    const tail = raw.slice(lastComma + 1);
    if (/^\d{1,2}$/.test(tail)) decSep = ','; // treat as decimal
  } else if (raw.includes('.')) {
    // Potential '.' decimal only if tail 1-2 digits AND preceding groups not all thousands groups
    const lastDot = raw.lastIndexOf('.');
    const tail = raw.slice(lastDot + 1);
    const head = raw.slice(0, lastDot);
    const headGroups = head.split('.');
    const thousandsPattern = headGroups.slice(1).every(g => /^\d{3}$/.test(g));
    const headFirstOk = /^\d{1,3}$/.test(headGroups[0] || '');
    const isPureThousands = thousandsPattern && headFirstOk;
    if (/^\d{1,2}$/.test(tail) && !isPureThousands) {
      decSep = '.'; // interpret as decimal
    }
  }

  let intPart = raw;
  let fracPart = '';
  if (decSep) {
    const parts = raw.split(decSep);
    intPart = parts[0];
    fracPart = parts.slice(1).join('');
  }
  intPart = intPart.replace(/[.,]/g,'');
  if (!intPart) intPart = '0';
  const intFormatted = Number(intPart).toLocaleString('id-ID');
  return decSep ? intFormatted + ',' + fracPart.replace(/[^0-9]/g,'') : intFormatted;
}

function parseFormattedNumber(value) {
  if (value == null || value === '') return 0;
  let raw = String(value).trim();
  raw = raw.replace(/rp\s*/i,'').replace(/[a-zA-Z ]/g,'');
  if (!raw) return 0;

  let decSep = null;
  if (raw.includes(',')) {
    const lastComma = raw.lastIndexOf(',');
    const tail = raw.slice(lastComma + 1);
    if (/^\d{1,2}$/.test(tail)) decSep = ',';
  } else if (raw.includes('.')) {
    const lastDot = raw.lastIndexOf('.');
    const tail = raw.slice(lastDot + 1);
    const head = raw.slice(0, lastDot);
    const headGroups = head.split('.');
    const thousandsPattern = headGroups.slice(1).every(g => /^\d{3}$/.test(g));
    const headFirstOk = /^\d{1,3}$/.test(headGroups[0] || '');
    const isPureThousands = thousandsPattern && headFirstOk;
    if (/^\d{1,2}$/.test(tail) && !isPureThousands) decSep = '.';
  }

  if (!decSep) {
    return parseInt(raw.replace(/[.,]/g,''),10) || 0;
  }
  const parts = raw.split(decSep);
  const intPart = parts[0].replace(/[.,]/g,'') || '0';
  const fracPart = parts.slice(1).join('').replace(/[^0-9]/g,'');
  return parseFloat(intPart + '.' + (fracPart || '0')) || 0;
}

// Export globally for other scripts
window.formatNumberWithCommas = formatNumberWithCommas;
window.parseFormattedNumber = parseFormattedNumber;
window.formatCurrency = formatCurrency;

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

// Logout is handled by logout-handler.js - no duplicate handler needed here

window.addEventListener('DOMContentLoaded', () => {
  const s = localStorage.getItem('activeSection') || 'summary';
  showSection(s);
  refreshUser();
  startAutoRefresh();
  startTokenRefresh(); // Start token auto-refresh on activity
});

/* === Enhanced Modal Handler === */
const modal = el('modal');
const modalTitle = el('modalTitle');
const modalBody = el('modalBody');
const modalForm = el('modalForm');
const modalClose = el('modalClose');

// Store the current submit handler to remove it later
let currentModalSubmitHandler = null;

function openModal({ title, bodyHtml, context, size = 'medium' }) {
  console.log('🚪 openModal called - title:', title, '| context:', JSON.stringify(context));
  
  // Remove previous submit handler if exists
  if (modalForm && currentModalSubmitHandler) {
    modalForm.removeEventListener('submit', currentModalSubmitHandler);
    currentModalSubmitHandler = null;
  }
  
  // Reset form state
  if (modalForm) modalForm.reset();
  
  // Set modal content
  if (modalTitle) modalTitle.textContent = title;
  if (modalBody) modalBody.innerHTML = bodyHtml;
  if (modal) modal.dataset.context = JSON.stringify(context || {});
  if (modal) modal.dataset.dirty = 'false';
  
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

  // Attach dirty tracking listeners (after content injection & special init)
  if (modalForm) {
    const markDirty = () => { if (modal) modal.dataset.dirty = 'true'; };
    modalForm.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', markDirty, { once: false });
      el.addEventListener('change', markDirty, { once: false });
    });
    
    // Create new submit handler
    currentModalSubmitHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const formData = new FormData(modalForm);
      const data = Object.fromEntries(formData.entries());
      const ctx = JSON.parse(modal.dataset.context || '{}');
      
      console.log('📤 Dispatching modalSubmit event:', { data, context: ctx });
      
      const event = new CustomEvent('modalSubmit', {
        detail: { data, context: ctx },
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);
      
      // If event was not prevented by listener, close modal
      if (!event.defaultPrevented) {
        console.log('⚠️ modalSubmit was not handled by any listener');
        closeModal(true);
      }
    };
    
    // Attach the submit handler
    modalForm.addEventListener('submit', currentModalSubmitHandler);
  }
}

function closeModal(confirmed = false) {
  if (!modal) return;

  // If not confirmed and form is dirty, prompt user before closing
  const ctx = JSON.parse(modal.dataset.context || '{}');
  const skippable = ['view','filter'].includes(ctx.action);
  const isDirty = modal.dataset.dirty === 'true';
  
  if (!confirmed && isDirty && !skippable) {
    confirmDialog.unsavedChanges().then(proceed => {
      if (proceed) {
        // User confirmed, close the modal
        performModalClose();
      }
      // If not proceed, do nothing (user canceled)
    });
    return;
  }
  
  // Direct close for confirmed or non-dirty modals
  performModalClose();
}

function performModalClose() {
  if (!modal) return;
  
  // Clean up submit handler
  if (modalForm && currentModalSubmitHandler) {
    modalForm.removeEventListener('submit', currentModalSubmitHandler);
    currentModalSubmitHandler = null;
  }
  
  // Immediately clean up form state for faster reopening
  if (modalForm) {
    modalForm.reset();
    // Remove any validation error states
    modalForm.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    modalForm.querySelectorAll('.error-message').forEach(el => el.remove());
  }
  
  // Add closing animation
  modal.classList.add('closing');
  
  setTimeout(() => {
    modal.classList.remove('active', 'closing');
    if (modalBody) modalBody.innerHTML = '';
    delete modal.dataset.context;
    delete modal.dataset.dirty;
    
    // Trigger onClose callback if exists
    if (modal.dataset.onClose) {
      try {
        const callback = new Function(modal.dataset.onClose);
        callback();
      } catch (err) {
        console.error('Modal close callback error:', err);
      }
      delete modal.dataset.onClose;
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
      input.removeAttribute('step'); // Remove step to avoid HTML5 validation
      input.removeAttribute('pattern'); // Allow free-form formatted input
      input.removeAttribute('required'); // Re-add if field was originally required
      const wasRequired = input.hasAttribute('required');
      
      // Format existing value
      if (input.value) {
        input.value = formatNumberWithCommas(input.value);
      }
      
      // Re-apply required if it was set
      if (wasRequired) {
        input.setAttribute('required', 'required');
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

  // DISABLED: Date input conversion causes issues with CRUDModal validation
  // HTML5 date inputs work fine natively
  /*
  // Allow manual typing for date fields: convert to text with pattern YYYY-MM-DD
  const dateInputs = modalBody.querySelectorAll('input[type="date"]');
  dateInputs.forEach(d => {
    const originalValue = d.value;
    d.setAttribute('type','text');
    d.setAttribute('placeholder','YYYY-MM-DD');
    d.setAttribute('pattern','\\d{4}-\\d{2}-\\d{2}');
    d.setAttribute('inputmode','numeric');
    if (originalValue) d.value = originalValue;
    // Live auto-format while typing: enforce YYYY-MM-DD
    d.addEventListener('input', () => {
      const digits = d.value.replace(/[^0-9]/g,'').slice(0,8); // max 8 digits
      let out = '';
      if (digits.length >= 4) {
        out = digits.slice(0,4);
        if (digits.length >= 5) {
          out += '-' + digits.slice(4,6);
          if (digits.length >= 7) {
            out += '-' + digits.slice(6,8);
          }
        } else if (digits.length > 4) {
          out += '-' + digits.slice(4);
        }
      } else {
        out = digits;
      }
      d.value = out;
    });
    d.addEventListener('blur', () => {
      if (d.value && !/^\d{4}-\d{2}-\d{2}$/.test(d.value)) {
        d.classList.add('error');
      } else {
        d.classList.remove('error');
      }
    });
  });
  */
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

// ESC key closes modal with dirty check
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal?.classList.contains('active')) {
    closeModal(false);
  }
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
      
      // Validate required fields
      const requiredFields = Array.from(modalForm.querySelectorAll('[required]'));
      const missingFields = requiredFields.filter(field => !field.value || !field.value.trim());
      
      if (missingFields.length > 0) {
        const fieldNames = missingFields.map(f => f.name || f.placeholder || 'field').join(', ');
        toast.error(`Please fill in required fields: ${fieldNames}`);
        if (modal) modal.classList.remove('loading');
        return;
      }
      
      // Validate email fields
      const emailFields = Array.from(modalForm.querySelectorAll('input[type="email"]'));
      for (const field of emailFields) {
        if (field.value && !validationUtils.isValidEmail(field.value)) {
          toast.error(`Invalid email format: ${field.value}`);
          if (modal) modal.classList.remove('loading');
          return;
        }
      }
      
      // Validate phone fields
      const phoneFields = Array.from(modalForm.querySelectorAll('input[type="tel"]'));
      for (const field of phoneFields) {
        if (field.value && !validationUtils.isValidPhone(field.value)) {
          toast.error(`Invalid phone format: ${field.value}`);
          if (modal) modal.classList.remove('loading');
          return;
        }
      }
      
      // Get context data
      const context = JSON.parse(modal?.dataset.context || '{}');
      
      // Dispatch event for specialized dashboard filters
      const submitEvent = new CustomEvent('modalSubmit', { 
        detail: { data, context },
        cancelable: true 
      });
      document.dispatchEvent(submitEvent);
      
      // If event was prevented (handled by specialized dashboard), return
      if (submitEvent.defaultPrevented) {
        if (modal) modal.classList.remove('loading');
        return;
      }
      
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
  const userNameEl = el('userName');
  const userRoleEl = el('userRole');
  if (userNameEl) userNameEl.textContent = u.name || u.username || '-';
  if (userRoleEl) userRoleEl.textContent = 'Role: ' + (u.type || '-');
  const isAdmin = u.type === 'admin';
  const isSemiAdmin = u.type === 'semi-admin';
  const isBasic = u.type === 'basic';
  const addTargetBtn = el('addTargetBtn');
  if (!isAdmin && addTargetBtn) addTargetBtn.style.display = 'none';
  if (isBasic) document.querySelectorAll('.btn.delete').forEach(b => b.style.display = 'none');
  
  // Hide sales add/edit/delete/import buttons for non-admin users (admin-only CRUD)
  if (!isAdmin) {
    el('addSalesBtn')?.style.setProperty('display', 'none', 'important');
    el('importSalesBtn')?.style.setProperty('display', 'none', 'important');
    el('downloadSalesTemplate')?.style.setProperty('display', 'none', 'important');
  }
  
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
  // Show Reports link only for admin and semi-admin
  const reportsLink = el('reportsLink');
  if (reportsLink && (isAdmin || isSemiAdmin)) {
    reportsLink.style.display = 'flex';
  }
  
  // Show email testing panel only for admin
  const emailTestingPanel = el('emailTestingPanel');
  if (emailTestingPanel && isAdmin) {
    emailTestingPanel.style.display = 'block';
    checkEmailConfiguration();
  }
}

/* === REFRESH ALL === */
async function refreshAll() {
  try {
    // Refresh charts
    await renderCharts();
    
    // Refresh dashboard summary
    await loadDashboardSummary();
    
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
    
    // Default to current month if no filters
    let currentMonth = month;
    let currentYear = year;
    if (!month && !year && !staff && !region) {
      const now = new Date();
      currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      currentYear = String(now.getFullYear());
    }
    
    const params = {};
    if (currentMonth) params.month = currentMonth;
    if (currentYear) params.year = currentYear;
    if (staff) params.staff = staff;
    if (region) params.region = region;
    
    const q = new URLSearchParams(params).toString();
    const [metrics, toursData] = await Promise.all([
      fetchJson('/api/metrics' + (q ? '?' + q : '')),
      fetchJson('/api/tours' + (q ? '?' + q : ''))
    ]);
    if (!metrics) return;

    const ctx = id => document.getElementById(id)?.getContext('2d');
    const safeCreateChart = (canvasId, config) => {
      const context = ctx(canvasId);
      if (context) {
        return new Chart(context, config);
      }
      return null;
    };
    
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
    const canvasIds = ['chartSalesTarget', 'chartProfitTarget', 'chartSalesMonthly', 'chartSalesRegion', 'chartToursRegion', 'chartParticipants', 'chartUpcomingTours', 'chartTargetAchievement'];
    canvasIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
          existingChart.destroy();
        }
      }
    });

    const totalSales = metrics.sales?.total_sales || 0;
    const totalProfit = metrics.sales?.total_profit || 0;
    const targetSales = metrics.targets?.target_sales || 0;
    const targetProfit = metrics.targets?.target_profit || 0;

    // Update welcome message with user name
    const user = getUser();
    const welcomeMsg = el('welcomeMessage');
    if (welcomeMsg) {
      const userName = user.name || user.username || 'User';
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Selamat Pagi' : hour < 18 ? 'Selamat Siang' : 'Selamat Malam';
      welcomeMsg.textContent = `${greeting}, ${userName}! Kelola bisnis travel Anda dengan mudah`;
    }

    // Update metrics (only if elements exist)
    const totalSalesEl = el('totalSales');
    const totalProfitEl = el('totalProfit');
    const salesAchievementEl = el('salesAchievement');
    const profitAchievementEl = el('profitAchievement');
    
    if (totalSalesEl) totalSalesEl.textContent = formatCurrency(totalSales);
    if (totalProfitEl) totalProfitEl.textContent = formatCurrency(totalProfit);
    if (salesAchievementEl) salesAchievementEl.textContent = `Achv: ${(totalSales / (targetSales || 1) * 100).toFixed(1)}%`;
    if (profitAchievementEl) profitAchievementEl.textContent = `Achv: ${(totalProfit / (targetProfit || 1) * 100).toFixed(1)}%`;

    // Calculate upcoming tours (next 30 days)
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcomingTours = (toursData || []).filter(t => {
      if (!t.departure_date) return false;
      const depDate = new Date(t.departure_date);
      return depDate >= now && depDate <= thirtyDaysLater;
    }).sort((a, b) => new Date(a.departure_date) - new Date(b.departure_date));

    const upcomingToursCountEl = el('upcomingToursCount');
    if (upcomingToursCountEl) upcomingToursCountEl.textContent = upcomingTours.length;

    // Render upcoming tours table
    const upcomingTable = el('upcomingToursTable');
    if (upcomingTable) {
      if (upcomingTours.length === 0) {
        upcomingTable.innerHTML = '<tr><td colspan=\"7\" style=\"text-align: center; padding: 20px; color: #9ca3af;\">Tidak ada keberangkatan dalam 30 hari ke depan</td></tr>';
      } else {
        // Get regions for name mapping
        const regionList = window.crudHandlers?.state?.regions || [];
        const regionMap = Object.fromEntries(regionList.map(r => [String(r.id), r.region_name]));
        
        upcomingTable.innerHTML = upcomingTours.map(tour => {
          const depDate = new Date(tour.departure_date);
          const daysUntil = Math.ceil((depDate - now) / (24 * 60 * 60 * 1000));
          const urgency = daysUntil <= 7 ? 'background-color: #fef2f2;' : daysUntil <= 14 ? 'background-color: #fef9c3;' : '';
          const regionName = regionMap[String(tour.region_id)] || '-';
          const statusColor = {
            'Pending': '#fbbf24',
            'Confirmed': '#3b82f6',
            'Completed': '#10b981',
            'Cancelled': '#ef4444'
          }[tour.status] || '#6b7280';
          
          return `
            <tr style=\"${urgency}\">
              <td style=\"padding: 8px;\">${tour.departure_date} <span style=\"color: #6b7280;\">(${daysUntil} hari)</span></td>
              <td style=\"padding: 8px;\">${tour.booking_code || '-'}</td>
              <td style=\"padding: 8px;\">${tour.lead_passenger || '-'}</td>
              <td style=\"padding: 8px;\">${regionName}</td>
              <td style=\"padding: 8px; text-align: center;\">${tour.jumlah_peserta || 0}</td>
              <td style=\"padding: 8px;\">${tour.staff_name || '-'}</td>
              <td style=\"padding: 8px;\"><span style=\"background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;\">${tour.status || 'Pending'}</span></td>
            </tr>
          `;
        }).join('');
      }
    }

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
    charts.sales = safeCreateChart('chartSalesTarget', {
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
    charts.profit = safeCreateChart('chartProfitTarget', {
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

    // Monthly Sales Trend Chart
    // Fetch sales data for trend chart
    const salesResponse = await fetchJson('/api/sales' + (q ? '?' + q : ''));
    if (salesResponse && salesResponse.length > 0) {
      const monthlyData = {};
      salesResponse.forEach(sale => {
        if (sale.transaction_date) {
          const month = sale.transaction_date.substring(0, 7); // YYYY-MM
          monthlyData[month] = (monthlyData[month] || 0) + (parseFloat(sale.sales_amount) || 0);
        }
      });
      
      const sortedMonths = Object.keys(monthlyData).sort();
      charts.salesMonthly = safeCreateChart('chartSalesMonthly', {
        type: 'line',
        data: {
          labels: sortedMonths,
          datasets: [{
            label: 'Sales (Rp)',
            data: sortedMonths.map(m => monthlyData[m]),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2
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
    }

  } catch (err) {
    console.error('renderCharts error', err);
  }
}

/* === DASHBOARD SUMMARY (Enhanced Metrics) === */
let currentComparison = '';

window.setComparison = async function(type) {
  currentComparison = type;
  
  // Update button states
  document.querySelectorAll('.comparison-btn').forEach(btn => {
    btn.classList.toggle('active', 
      (type === '' && btn.id === 'compareNone') ||
      (type === 'month' && btn.id === 'compareMonth') ||
      (type === 'year' && btn.id === 'compareYear')
    );
  });
  
  await loadDashboardSummary();
};

async function loadDashboardSummary() {
  try {
    const query = currentComparison ? `?compare=${currentComparison}` : '';
    const summary = await fetchJson('/api/dashboard-summary' + query);
    if (!summary) return;
    
    // Update current period metrics
    if (el('totalSales')) el('totalSales').textContent = formatCurrency(summary.sales.current);
    if (el('totalProfit')) el('totalProfit').textContent = formatCurrency(summary.profit.current);
    if (el('salesAchievement')) el('salesAchievement').textContent = `Achv: ${summary.sales.achievement}%`;
    if (el('profitAchievement')) el('profitAchievement').textContent = `Achv: ${summary.profit.achievement}%`;
    if (el('upcomingToursCount')) el('upcomingToursCount').textContent = summary.modules.upcomingTours;
    
    // Update module counts
    if (el('outstandingCount')) el('outstandingCount').textContent = summary.modules.outstandingInvoices;
    if (el('outstandingAmount')) el('outstandingAmount').textContent = formatCurrency(summary.modules.outstandingAmount);
    if (el('pendingDocsCount')) el('pendingDocsCount').textContent = summary.modules.pendingDocuments;
    if (el('upcomingCruiseCount')) el('upcomingCruiseCount').textContent = summary.modules.upcomingCruise;
    if (el('hotelBookingsCount')) el('hotelBookingsCount').textContent = summary.modules.hotelBookings;
    if (el('telecomRentalsCount')) el('telecomRentalsCount').textContent = summary.modules.telecomRentals;
    
    // Update YTD Summary
    if (el('ytdYear')) el('ytdYear').textContent = `(${summary.currentPeriod.year})`;
    if (el('ytdSales')) el('ytdSales').textContent = formatCurrency(summary.ytd.sales);
    if (el('ytdProfit')) el('ytdProfit').textContent = formatCurrency(summary.ytd.profit);
    if (el('ytdTargetSales')) el('ytdTargetSales').textContent = formatCurrency(summary.ytd.targetSales);
    if (el('ytdTargetProfit')) el('ytdTargetProfit').textContent = formatCurrency(summary.ytd.targetProfit);
    if (el('ytdSalesAchievement')) el('ytdSalesAchievement').textContent = `${summary.ytd.salesAchievement}%`;
    if (el('ytdProfitAchievement')) el('ytdProfitAchievement').textContent = `${summary.ytd.profitAchievement}%`;
    if (el('ytdSalesBar')) el('ytdSalesBar').style.width = `${Math.min(parseFloat(summary.ytd.salesAchievement), 100)}%`;
    if (el('ytdProfitBar')) el('ytdProfitBar').style.width = `${Math.min(parseFloat(summary.ytd.profitAchievement), 100)}%`;
    
    // Update comparison data
    const salesChangeEl = el('salesChange');
    const profitChangeEl = el('profitChange');
    const comparisonLabel = el('comparisonLabel');
    
    if (summary.comparison) {
      if (comparisonLabel) comparisonLabel.textContent = `vs ${summary.comparison.period}`;
      
      if (salesChangeEl && summary.comparison.salesChange !== null) {
        const salesChange = parseFloat(summary.comparison.salesChange);
        salesChangeEl.style.display = 'inline-block';
        salesChangeEl.className = `metric-change ${salesChange >= 0 ? 'positive' : 'negative'}`;
        salesChangeEl.textContent = `${salesChange >= 0 ? '↑' : '↓'} ${Math.abs(salesChange)}%`;
      }
      
      if (profitChangeEl && summary.comparison.profitChange !== null) {
        const profitChange = parseFloat(summary.comparison.profitChange);
        profitChangeEl.style.display = 'inline-block';
        profitChangeEl.className = `metric-change ${profitChange >= 0 ? 'positive' : 'negative'}`;
        profitChangeEl.textContent = `${profitChange >= 0 ? '↑' : '↓'} ${Math.abs(profitChange)}%`;
      }
    } else {
      if (salesChangeEl) salesChangeEl.style.display = 'none';
      if (profitChangeEl) profitChangeEl.style.display = 'none';
      if (comparisonLabel) comparisonLabel.textContent = summary.currentPeriod.label;
    }
    
    // Update Staff Leaderboard
    const leaderboardTable = el('staffLeaderboardTable');
    if (leaderboardTable && summary.staffLeaderboard) {
      if (summary.staffLeaderboard.length === 0) {
        leaderboardTable.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #9ca3af;">No sales data this month</td></tr>';
      } else {
        leaderboardTable.innerHTML = summary.staffLeaderboard.map((staff, index) => {
          const rank = index + 1;
          const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'normal';
          const avgSale = staff.transaction_count > 0 ? staff.total_sales / staff.transaction_count : 0;
          
          return `
            <tr>
              <td><div class="leaderboard-rank ${rankClass}">${rank}</div></td>
              <td><strong>${staff.staff_name}</strong></td>
              <td style="text-align: right;">${formatCurrency(staff.total_sales)}</td>
              <td style="text-align: right;">${formatCurrency(staff.total_profit)}</td>
              <td style="text-align: center;">${staff.transaction_count}</td>
              <td style="text-align: right;">${formatCurrency(avgSale)}</td>
            </tr>
          `;
        }).join('');
      }
    }
    
  } catch (err) {
    console.error('loadDashboardSummary error', err);
  }
}

/* === ACTIVITY LOG === */
async function loadActivity() {
  if (getUser().type !== 'admin') return;
  const tblActivity = el('tblActivity');
  if (!tblActivity) return; // Element doesn't exist on this page
  try {
    const data = await fetchJson('/api/activity_logs');
    if (!data?.length) {
      tblActivity.innerHTML = '<tr><td colspan="6">Belum ada aktivitas</td></tr>';
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
    tblActivity.innerHTML = rows;
  } catch (err) {
    console.error('Gagal memuat aktivitas:', err);
    if (tblActivity) tblActivity.innerHTML = '<tr><td colspan="6">Gagal memuat data</td></tr>';
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
      toast.error('Password minimal 6 karakter');
      return;
    }
    
    if (password !== passwordConfirm) {
      toast.error('Password dan konfirmasi password tidak sama');
      return;
    }
    
    try {
      const user = getUser();
      await fetchJson('/api/users/reset-password', {
        method: 'POST',
        body: { username: user.username, password }
      });
      
      toast.success('Password berhasil diubah');
      e.target.reset();
    } catch (err) {
      toast.error('Gagal mengubah password: ' + err.message);
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
  
  // Auto-render on filter dropdown change
  el('filterStaff')?.addEventListener('change', () => renderCharts());
  el('filterRegion')?.addEventListener('change', () => renderCharts());
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

/* === REPORTS PAGE NAVIGATION === */
function populateReportsNav() {
  const mainNav = el('mainNav');
  if (!mainNav) return;
  
  const user = getUser();
  const isAdmin = user.type === 'admin';
  const isSemiAdmin = user.type === 'semi-admin';
  
  // Build navigation items for reports page
  mainNav.innerHTML = `
    <a href="/single-dashboard.html" style="display: flex; align-items: center; padding: 12px 16px; color: var(--text-secondary); text-decoration: none; border-radius: 8px; transition: all 0.2s; font-weight: 500;">
      <span style="margin-right: 8px;">←</span> Back to Dashboard
    </a>
    <div style="margin: 16px 0; border-top: 1px solid var(--border-light);"></div>
    <div style="padding: 8px 16px; font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px;">
      Reports
    </div>
  `;
  
  // Add hover effect to back link
  const backLink = mainNav.querySelector('a');
  if (backLink) {
    backLink.addEventListener('mouseenter', function() {
      this.style.background = 'var(--bg-hover)';
      this.style.color = 'var(--primary)';
    });
    backLink.addEventListener('mouseleave', function() {
      this.style.background = 'transparent';
      this.style.color = 'var(--text-secondary)';
    });
  }
  
  // Populate user box
  const userBox = el('userBox');
  if (userBox) {
    userBox.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">${user.name || user.username || '—'}</div>
      <div style="font-size: 12px; color: var(--text-tertiary);">Role: ${user.type || '—'}</div>
    `;
  }
}

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', () => {
  // Skip dashboard-specific initialization if on reports page
  if (isReportsPage) {
    console.log('📊 Reports page detected - skipping dashboard initialization');
    populateReportsNav();
    return;
  }
  
  // Initialize filters
  initializeFilters();
  populateFilterDropdowns();
  
  renderCharts();
  loadDashboardSummary(); // Load enhanced dashboard summary
  
  // Wire up comparison buttons (CSP-compliant)
  document.querySelectorAll('.comparison-btn[data-compare]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.setComparison(btn.dataset.compare);
    });
  });
  
  setInterval(renderCharts, 30000);
  if (getUser().type === 'admin') loadActivity();
  
  // Wait for CRUD handlers to be ready (only for single-dashboard.html)
  setTimeout(() => {
    // Check if any CRUD buttons exist (only on single-dashboard.html)
    const hasCrudButtons = el('addSalesBtn') || el('addTourBtn') || el('addDocBtn');
    
    if (hasCrudButtons) {
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
        console.warn('⚠️ CRUD Handlers not loaded - this is expected for specialized dashboards');
      }
    } else {
      console.log('ℹ️ Specialized dashboard detected - using CRUDModal system');
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

/* === DARK MODE TOGGLE === */
(function initDarkMode() {
  // Dark mode is handled by theme-toggle.js - no duplicate handler needed here
})();

/* === EMAIL NOTIFICATION TESTING === */
async function checkEmailConfiguration() {
  const statusIcon = el('emailStatusIcon');
  const statusTitle = el('emailStatusTitle');
  const statusMessage = el('emailStatusMessage');
  const configStatus = el('emailConfigStatus');
  
  if (!statusIcon || !statusTitle || !statusMessage || !configStatus) return;
  
  try {
    const response = await fetch('/healthz', { headers: getHeaders() });
    const data = await response.json();
    
    // Check if email is likely configured (we'll test with actual send)
    statusIcon.textContent = '⚙️';
    statusTitle.textContent = 'Email System Ready';
    statusMessage.textContent = 'Use the test button to verify SMTP configuration';
    configStatus.style.background = '#eff6ff';
    configStatus.style.border = '1px solid #2563eb';
  } catch (error) {
    statusIcon.textContent = '⚠️';
    statusTitle.textContent = 'System Status Unknown';
    statusMessage.textContent = 'Could not connect to server';
    configStatus.style.background = '#fef3c7';
    configStatus.style.border = '1px solid #f59e0b';
  }
}

function showEmailResult(success, message, details = null) {
  const resultsDiv = el('emailTestResults');
  if (!resultsDiv) return;
  
  const bgColor = success ? '#ecfdf5' : '#fef2f2';
  const borderColor = success ? '#10b981' : '#ef4444';
  const icon = success ? '✅' : '❌';
  
  let detailsHtml = '';
  if (details) {
    if (details.steps && Array.isArray(details.steps)) {
      // Special formatting for setup instructions
      detailsHtml = `
        <div style="margin-top: 12px; padding: 12px; background: white; border-radius: 6px; border-left: 3px solid #f59e0b;">
          <strong style="color: #92400e;">💡 ${details.issue || 'Setup Required'}</strong>
          <p style="margin: 8px 0; color: #78350f; font-size: 0.9rem;">${details.solution || ''}</p>
          <div style="margin-top: 8px; font-size: 0.85rem; color: #6b7280;">
            ${details.steps.map(step => `<div style="margin: 4px 0;">${step}</div>`).join('')}
          </div>
        </div>
      `;
    } else {
      // JSON formatting for other details
      detailsHtml = `<pre style="margin-top: 8px; font-size: 0.85rem; color: #6b7280; background: white; padding: 12px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(details, null, 2)}</pre>`;
    }
  }
  
  let html = `
    <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 16px;">
      <div style="display: flex; align-items: start; gap: 12px;">
        <span style="font-size: 24px;">${icon}</span>
        <div style="flex: 1;">
          <strong style="color: ${success ? '#065f46' : '#991b1b'};">${message}</strong>
          ${detailsHtml}
        </div>
      </div>
    </div>
  `;
  
  resultsDiv.innerHTML = html;
  resultsDiv.style.display = 'block';
  
  // Auto-hide after 10 seconds for success messages only
  if (success) {
    setTimeout(() => {
      resultsDiv.style.display = 'none';
    }, 10000);
  }
}

async function sendTestEmail() {
  const user = getUser();
  if (user.type !== 'admin') {
    showEmailResult(false, 'Access Denied: Admin privileges required');
    return;
  }
  
  const emailInput = el('testEmailInput');
  const sendBtn = el('sendTestEmailBtn');
  
  if (!emailInput || !sendBtn) return;
  
  const email = emailInput.value.trim();
  if (!email) {
    showEmailResult(false, 'Please enter an email address');
    return;
  }
  
  if (!email.includes('@')) {
    showEmailResult(false, 'Please enter a valid email address');
    return;
  }
  
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  
  try {
    const response = await fetch('/api/email/test', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showEmailResult(true, `Test email sent successfully to ${email}!`, {
        status: 'Email sent',
        recipient: email,
        tip: 'Check your inbox (and spam folder)'
      });
      emailInput.value = '';
      
      // Update status to show it's working
      const statusIcon = el('emailStatusIcon');
      const statusTitle = el('emailStatusTitle');
      const statusMessage = el('emailStatusMessage');
      const configStatus = el('emailConfigStatus');
      if (statusIcon) statusIcon.textContent = '✅';
      if (statusTitle) statusTitle.textContent = 'Email Configured & Working';
      if (statusMessage) statusMessage.textContent = 'SMTP connection verified successfully';
      if (configStatus) {
        configStatus.style.background = '#ecfdf5';
        configStatus.style.border = '1px solid #10b981';
      }
    } else {
      const errorMsg = data.error || 'Failed to send test email';
      let helpText = null;
      
      // Provide helpful guidance based on error
      if (errorMsg.includes('not configured') || errorMsg.includes('BadCredentials')) {
        helpText = {
          issue: 'SMTP Not Configured',
          solution: 'Add SMTP credentials to environment variables',
          steps: [
            '1. For Gmail: Create App Password at https://myaccount.google.com/apppasswords',
            '2. Set SMTP_USER=your-email@gmail.com',
            '3. Set SMTP_PASSWORD=your-16-char-app-password',
            '4. Restart the server'
          ]
        };
        
        // Update status to show configuration needed
        const statusIcon = el('emailStatusIcon');
        const statusTitle = el('emailStatusTitle');
        const statusMessage = el('emailStatusMessage');
        const configStatus = el('emailConfigStatus');
        if (statusIcon) statusIcon.textContent = '⚙️';
        if (statusTitle) statusTitle.textContent = 'SMTP Configuration Required';
        if (statusMessage) statusMessage.textContent = 'Set SMTP_USER and SMTP_PASSWORD environment variables';
        if (configStatus) {
          configStatus.style.background = '#fef3c7';
          configStatus.style.border = '1px solid #f59e0b';
        }
      }
      
      showEmailResult(false, errorMsg, helpText || data);
    }
  } catch (error) {
    console.error('Test email error:', error);
    showEmailResult(false, 'Network error: ' + error.message);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Test Email';
  }
}

async function triggerReminders() {
  const user = getUser();
  if (user.type !== 'admin') {
    showEmailResult(false, 'Access Denied: Admin privileges required');
    return;
  }
  
  const triggerBtn = el('triggerRemindersBtn');
  
  if (!triggerBtn) return;
  
  triggerBtn.disabled = true;
  triggerBtn.textContent = 'Checking...';
  
  try {
    const response = await fetch('/api/email/trigger-reminders', {
      method: 'POST',
      headers: getHeaders()
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showEmailResult(true, `Reminder check complete!`, {
        remindersSent: data.remindersSent,
        errors: data.errors,
        details: data.details
      });
    } else {
      showEmailResult(false, data.error || 'Failed to trigger reminders', data);
    }
  } catch (error) {
    console.error('Trigger reminders error:', error);
    showEmailResult(false, 'Network error: ' + error.message);
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = 'Trigger Now';
  }
}

async function viewReminderStats() {
  const user = getUser();
  if (user.type !== 'admin') {
    showEmailResult(false, 'Access Denied: Admin privileges required');
    return;
  }
  
  const viewBtn = el('viewStatsBtn');
  const statsTable = el('emailStatsTable');
  const statsBody = el('statsTableBody');
  
  if (!viewBtn || !statsTable || !statsBody) return;
  
  viewBtn.disabled = true;
  viewBtn.textContent = 'Loading...';
  
  try {
    const response = await fetch('/api/email/reminder-stats', {
      headers: getHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (response.ok && data.stats) {
      if (data.stats.length === 0) {
        showEmailResult(true, 'No reminders sent yet', {
          message: 'Reminders will appear here after being sent'
        });
        statsTable.style.display = 'none';
      } else {
        statsBody.innerHTML = data.stats.map(stat => `
          <tr>
            <td>${stat.days_until_departure} ${stat.days_until_departure === 1 ? 'day' : 'days'}</td>
            <td><strong>${stat.count}</strong></td>
            <td>${stat.sent_date}</td>
          </tr>
        `).join('');
        statsTable.style.display = 'block';
        
        // Hide results div when showing stats
        const resultsDiv = el('emailTestResults');
        if (resultsDiv) resultsDiv.style.display = 'none';
      }
    } else {
      showEmailResult(false, data.error || 'Failed to load statistics');
      statsTable.style.display = 'none';
    }
  } catch (error) {
    console.error('Stats error:', error);
    showEmailResult(false, 'Error loading statistics: ' + error.message);
    statsTable.style.display = 'none';
  } finally {
    viewBtn.disabled = false;
    viewBtn.textContent = 'View Stats';
  }
}

// Setup email testing event listeners
document.addEventListener('DOMContentLoaded', () => {
  const sendTestBtn = el('sendTestEmailBtn');
  const triggerBtn = el('triggerRemindersBtn');
  const viewStatsBtn = el('viewStatsBtn');
  const testEmailInput = el('testEmailInput');
  
  if (sendTestBtn) {
    sendTestBtn.addEventListener('click', sendTestEmail);
  }
  
  if (triggerBtn) {
    triggerBtn.addEventListener('click', triggerReminders);
  }
  
  if (viewStatsBtn) {
    viewStatsBtn.addEventListener('click', viewReminderStats);
  }
  
  if (testEmailInput) {
    testEmailInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendTestEmail();
      }
    });
  }
  
  // Show admin nav button for admins
  const user = getUser();
  if (user.type === 'admin') {
    const adminNavBtn = el('adminNavBtn');
    if (adminNavBtn) adminNavBtn.style.display = 'block';
  }
  
  // Admin section handlers
  const refreshStatsBtn = el('refreshSystemStats');
  const refreshLogsBtn = el('refreshActivityLogs');
  const activitySearch = el('activitySearch');
  const activityFilter = el('activityFilter');
  
  if (refreshStatsBtn) refreshStatsBtn.addEventListener('click', loadSystemStats);
  if (refreshLogsBtn) refreshLogsBtn.addEventListener('click', loadActivityLogs);
  if (activitySearch) activitySearch.addEventListener('input', filterActivityLogs);
  if (activityFilter) activityFilter.addEventListener('change', filterActivityLogs);
});

// === ADMIN SECTION FUNCTIONS ===
let activityLogsData = [];

async function loadSystemStats() {
  const loading = el('systemStatsLoading');
  const content = el('systemStatsContent');
  
  if (loading) loading.style.display = 'block';
  if (content) content.style.display = 'none';
  
  try {
    const data = await fetchJson('/api/system/stats');
    
    // Update UI
    if (el('statTotalUsers')) el('statTotalUsers').textContent = data.counts?.users || 0;
    if (el('statActiveUsers')) el('statActiveUsers').textContent = data.activeUsers24h || 0;
    if (el('statLockedUsers')) el('statLockedUsers').textContent = data.lockedUsers || 0;
    if (el('statTotalSales')) el('statTotalSales').textContent = data.counts?.sales || 0;
    if (el('statTotalTours')) el('statTotalTours').textContent = data.counts?.tours || 0;
    if (el('statTotalDocs')) el('statTotalDocs').textContent = data.counts?.documents || 0;
    
    // Database info
    if (el('dbInfo')) {
      const dbText = data.database?.dialect === 'postgres' 
        ? 'PostgreSQL' 
        : `SQLite (${data.database?.sizeMB || '?'} MB)`;
      el('dbInfo').textContent = dbText;
    }
    
    // Uptime
    if (el('serverUptime')) {
      const uptime = data.uptime || 0;
      const hours = Math.floor(uptime / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      el('serverUptime').textContent = `${hours}h ${mins}m`;
    }
    
    // Recent activity
    if (el('recentActivity')) {
      el('recentActivity').textContent = `${data.recentActivity7d || 0} actions`;
    }
    
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
  } catch (err) {
    console.error('Failed to load system stats:', err);
    if (loading) loading.innerHTML = '<p style="color: #dc2626;">Failed to load stats</p>';
  }
}

async function loadActivityLogs() {
  const tbody = el('activityLogsBody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;"><div class="loading-spinner"></div></td></tr>';
  
  try {
    activityLogsData = await fetchJson('/api/activity_logs');
    renderActivityLogs(activityLogsData);
  } catch (err) {
    console.error('Failed to load activity logs:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #dc2626;">Failed to load logs</td></tr>';
  }
}

function renderActivityLogs(logs) {
  const tbody = el('activityLogsBody');
  if (!tbody) return;
  
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No activity logs found</td></tr>';
    return;
  }
  
  tbody.innerHTML = logs.slice(0, 200).map(log => {
    const time = log.created_at ? new Date(log.created_at).toLocaleString('id-ID') : '-';
    const actionBadge = getActionBadge(log.action);
    return `
      <tr>
        <td style="white-space: nowrap; font-size: 13px;">${time}</td>
        <td><strong>${log.username || '-'}</strong></td>
        <td>${actionBadge}</td>
        <td>${log.entity || '-'}</td>
        <td>${log.record_id || '-'}</td>
        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.description || ''}">${log.description || '-'}</td>
      </tr>
    `;
  }).join('');
}

function getActionBadge(action) {
  const badges = {
    'LOGIN': '<span class="badge badge-success">LOGIN</span>',
    'LOGOUT': '<span class="badge badge-info">LOGOUT</span>',
    'CREATE': '<span class="badge badge-primary">CREATE</span>',
    'UPDATE': '<span class="badge badge-warning">UPDATE</span>',
    'DELETE': '<span class="badge badge-danger">DELETE</span>',
    'LOCK': '<span class="badge badge-danger">LOCK</span>',
    'UNLOCK': '<span class="badge badge-success">UNLOCK</span>',
    'LOGIN_FAIL': '<span class="badge badge-danger">LOGIN_FAIL</span>',
    'LOCKED': '<span class="badge badge-danger">LOCKED</span>'
  };
  return badges[action] || `<span class="badge">${action || '-'}</span>`;
}

function filterActivityLogs() {
  const search = (el('activitySearch')?.value || '').toLowerCase();
  const filter = el('activityFilter')?.value || '';
  
  let filtered = activityLogsData;
  
  if (filter) {
    filtered = filtered.filter(log => log.action === filter);
  }
  
  if (search) {
    filtered = filtered.filter(log => 
      (log.username || '').toLowerCase().includes(search) ||
      (log.entity || '').toLowerCase().includes(search) ||
      (log.description || '').toLowerCase().includes(search)
    );
  }
  
  renderActivityLogs(filtered);
}

// Load admin data when section is shown
const originalShowSection = window.showSection;
window.showSection = function(section) {
  if (typeof originalShowSection === 'function') {
    originalShowSection(section);
  }
  
  if (section === 'admin') {
    loadSystemStats();
    loadActivityLogs();
  }
};

})(); // End IIFE
