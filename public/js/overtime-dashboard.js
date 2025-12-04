import { getUser, fetchJson } from '/js/auth-common.js';

const el = id => document.getElementById(id);
let overtimeData = [];
let staffList = [];
const user = getUser();

// Wait for dashboard.js to load
await new Promise(resolve => {
  if (window.openModal) resolve();
  else window.addEventListener('load', resolve);
});

// Display user info
el('userName').textContent = user.name || user.username || '—';
el('userRole').textContent = { admin: 'Administrator', 'semi-admin': 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';

async function loadStaff() {
  try {
    const users = await fetchJson('/api/users');
    staffList = users || [];
  } catch (err) {
    console.error('Failed to load staff:', err);
  }
}

async function loadOvertime() {
  try {
    const data = await fetchJson('/api/overtime');
    overtimeData = data || [];
    renderTable();
    updateMetrics();
  } catch (err) {
    console.error('Failed to load overtime:', err);
    alert('Failed to load overtime data');
  }
}

function updateMetrics() {
  const total = overtimeData.length;
  const pending = overtimeData.filter(o => o.status === 'pending').length;
  const paid = overtimeData.filter(o => o.status === 'paid').length;
  
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const totalHours = overtimeData.filter(o => {
    if (!o.event_date) return false;
    const d = new Date(o.event_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((sum, o) => sum + (parseFloat(o.hours) || 0), 0);
  
  el('totalOvertime').textContent = total;
  el('pendingOvertime').textContent = pending;
  el('paidOvertime').textContent = paid;
  el('totalHours').textContent = totalHours.toFixed(1);
}

function renderTable() {
  const tbody = el('overtimeTable');
  if (!tbody) return;
  
  tbody.innerHTML = overtimeData.map(item => {
    const statusColors = {
      pending: 'background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;',
      paid: 'background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;',
      cancel: 'background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600;'
    };
    const statusBadge = `<span style="${statusColors[item.status] || statusColors.pending}">${item.status || 'pending'}</span>`;
    
    const actions = user.type === 'admin' 
      ? `<button class="btn-edit" onclick="editOvertime(${item.id})">✏️</button>
         <button class="btn-delete" onclick="deleteOvertime(${item.id})">🗑️</button>`
      : '';
    
    return `
      <tr>
        <td>${item.event_date || '—'}</td>
        <td>${item.staff_name || '—'}</td>
        <td>${item.event_name || '—'}</td>
        <td>${item.hours || 0} hrs</td>
        <td>${statusBadge}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.remarks || '—'}</td>
        <td style="${user.type === 'basic' ? 'display:none' : ''}">${actions}</td>
      </tr>
    `;
  }).join('');
}

window.editOvertime = async function(id) {
  const item = overtimeData.find(o => o.id === id);
  if (!item) return;
  
  window.openModal({
    title: 'Edit Overtime',
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required>
            ${staffList.map(s => `<option value="${s.name}" ${s.name === item.staff_name ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Event Name *</label>
          <input type="text" name="event_name" value="${item.event_name || ''}" required>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" name="event_date" value="${item.event_date || ''}" required>
        </div>
        <div class="form-group">
          <label>Hours *</label>
          <input type="number" name="hours" value="${item.hours || ''}" step="0.5" min="0" required>
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="status" required>
            <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="paid" ${item.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="cancel" ${item.status === 'cancel' ? 'selected' : ''}>Cancel</option>
          </select>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Remarks</label>
          <textarea name="remarks" rows="3">${item.remarks || ''}</textarea>
        </div>
      </div>
    `,
    context: { entity: 'overtime', action: 'edit', id: item.id }
  });
};

window.deleteOvertime = async function(id) {
  if (!confirm('Are you sure you want to delete this overtime record?')) return;
  
  try {
    await fetchJson(`/api/overtime/${id}`, { method: 'DELETE' });
    alert('Overtime deleted successfully');
    await loadOvertime();
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Failed to delete overtime: ' + err.message);
  }
};

el('addOvertimeBtn').addEventListener('click', () => {
  window.openModal({
    title: 'Add Overtime',
    size: 'medium',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Staff *</label>
          <select name="staff_name" required id="staffSelect">
            <option value="">Select staff</option>
            ${staffList.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Event Name *</label>
          <input type="text" name="event_name" placeholder="e.g., Weekend tour support" required>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" name="event_date" required>
        </div>
        <div class="form-group">
          <label>Hours *</label>
          <input type="number" name="hours" step="0.5" min="0" placeholder="e.g., 4.5" required>
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select name="status" required>
            <option value="pending" selected>Pending</option>
            <option value="paid">Paid</option>
            <option value="cancel">Cancel</option>
          </select>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Remarks</label>
          <textarea name="remarks" rows="3" placeholder="Additional notes"></textarea>
        </div>
      </div>
    `,
    context: { entity: 'overtime', action: 'create' }
  });
  
  setTimeout(() => {
    if (user.type === 'basic') {
      const select = document.getElementById('staffSelect');
      if (select) {
        select.value = user.name;
        select.disabled = true;
      }
    }
  }, 100);
});

// Handle modal form submissions
document.addEventListener('modalSubmit', async (e) => {
  const { data, context } = e.detail;
  if (context.entity !== 'overtime') return;
  
  e.preventDefault();
  
  try {
    if (context.action === 'create') {
      await fetchJson('/api/overtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      alert('Overtime added successfully');
    } else if (context.action === 'edit' && context.id) {
      await fetchJson(`/api/overtime/${context.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      alert('Overtime updated successfully');
    }
    
    await loadOvertime();
  } catch (err) {
    console.error('Overtime submission failed:', err);
    alert('Operation failed: ' + err.message);
    throw err;
  }
});

// Initialize
await loadStaff();
await loadOvertime();
