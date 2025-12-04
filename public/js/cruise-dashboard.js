// Wait for auth-common.js to load
await new Promise(resolve => {
  if (window.getUser && window.fetchJson) resolve();
  else window.addEventListener('load', resolve);
});

const getUser = window.getUser;
const fetchJson = window.fetchJson;

const el = id => document.getElementById(id);
let cruiseData = [];
let staffList = [];
const user = getUser();

// Wait for dashboard.js to load
await new Promise(resolve => {
  if (window.openModal) resolve();
  else window.addEventListener('load', resolve);
});

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

async function loadCruises() {
  try {
    const data = await fetchJson('/api/cruise');
    cruiseData = data || [];
    renderTable();
    updateMetrics();
  } catch (err) {
    console.error('Failed to load cruises:', err);
    alert('Failed to load cruise data');
  }
}

function updateMetrics() {
  const total = cruiseData.length;
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const upcoming = cruiseData.filter(c => {
    if (!c.sailing_start) return false;
    const sailDate = new Date(c.sailing_start);
    return sailDate >= now && sailDate <= thirtyDaysLater;
  }).length;
  
  const active = cruiseData.filter(c => {
    if (!c.sailing_start || !c.sailing_end) return false;
    const start = new Date(c.sailing_start);
    const end = new Date(c.sailing_end);
    return start <= now && end >= now;
  }).length;
  
  const thisMonth = cruiseData.filter(c => {
    if (!c.sailing_start) return false;
    const sailDate = new Date(c.sailing_start);
    return sailDate.getMonth() === now.getMonth() && sailDate.getFullYear() === now.getFullYear();
  }).length;
  
  el('totalCruises').textContent = total;
  el('upcomingCruises').textContent = upcoming;
  el('activeCruises').textContent = active;
  el('thisMonthCruises').textContent = thisMonth;
}

function renderTable() {
  const tbody = el('cruiseTable');
  if (!tbody) return;
  
  tbody.innerHTML = cruiseData.map(item => `
    <tr>
      <td>${item.cruise_brand || '—'}</td>
      <td>${item.ship_name || '—'}</td>
      <td>${item.sailing_start || '—'}</td>
      <td>${item.sailing_end || '—'}</td>
      <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${item.route || '—'}</td>
      <td>${item.pic_name || '—'}</td>
      <td>${item.reservation_code || '—'}</td>
      <td>${item.staff_name || '—'}</td>
      <td>
        <button class="btn-edit" onclick="editCruise(${item.id})">✏️</button>
        ${user.type !== 'basic' ? `<button class="btn-delete" onclick="deleteCruise(${item.id})">🗑️</button>` : ''}
      </td>
    </tr>
  `).join('');
}

window.editCruise = async function(id) {
  const item = cruiseData.find(c => c.id === id);
  if (!item) return;
  
  window.openModal({
    title: 'Edit Cruise',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Cruise Brand *</label>
          <input type="text" name="cruise_brand" value="${item.cruise_brand || ''}" required>
        </div>
        <div class="form-group">
          <label>Ship Name *</label>
          <input type="text" name="ship_name" value="${item.ship_name || ''}" required>
        </div>
        <div class="form-group">
          <label>Sailing Start *</label>
          <input type="date" name="sailing_start" value="${item.sailing_start || ''}" required>
        </div>
        <div class="form-group">
          <label>Sailing End *</label>
          <input type="date" name="sailing_end" value="${item.sailing_end || ''}" required>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Route *</label>
          <input type="text" name="route" value="${item.route || ''}" placeholder="e.g., Singapore - Penang - Langkawi" required>
        </div>
        <div class="form-group">
          <label>PIC Name *</label>
          <input type="text" name="pic_name" value="${item.pic_name || ''}" required>
        </div>
        <div class="form-group">
          <label>Participant Names</label>
          <input type="text" name="participant_names" value="${item.participant_names || ''}" placeholder="Comma separated">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" value="${item.phone_number || ''}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" value="${item.email || ''}">
        </div>
        <div class="form-group">
          <label>Reservation Code</label>
          <input type="text" name="reservation_code" value="${item.reservation_code || ''}">
        </div>
        <div class="form-group">
          <label>Staff Name *</label>
          <select name="staff_name" required>
            ${staffList.map(s => `<option value="${s.name}" ${s.name === item.staff_name ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
    `,
    context: { entity: 'cruise', action: 'edit', id: item.id }
  });
};

window.deleteCruise = async function(id) {
  if (!confirm('Are you sure you want to delete this cruise?')) return;
  
  try {
    await fetchJson(`/api/cruise/${id}`, { method: 'DELETE' });
    alert('Cruise deleted successfully');
    await loadCruises();
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Failed to delete cruise: ' + err.message);
  }
};

el('addCruiseBtn').addEventListener('click', () => {
  window.openModal({
    title: 'Add New Cruise',
    size: 'large',
    bodyHtml: `
      <div class="form-grid">
        <div class="form-group">
          <label>Cruise Brand *</label>
          <input type="text" name="cruise_brand" placeholder="e.g., Royal Caribbean" required>
        </div>
        <div class="form-group">
          <label>Ship Name *</label>
          <input type="text" name="ship_name" placeholder="e.g., Symphony of the Seas" required>
        </div>
        <div class="form-group">
          <label>Sailing Start *</label>
          <input type="date" name="sailing_start" required>
        </div>
        <div class="form-group">
          <label>Sailing End *</label>
          <input type="date" name="sailing_end" required>
        </div>
        <div class="form-group" style="grid-column: 1 / -1;">
          <label>Route *</label>
          <input type="text" name="route" placeholder="e.g., Singapore - Penang - Langkawi" required>
        </div>
        <div class="form-group">
          <label>PIC Name *</label>
          <input type="text" name="pic_name" placeholder="Person in charge" required>
        </div>
        <div class="form-group">
          <label>Participant Names</label>
          <input type="text" name="participant_names" placeholder="Comma separated names">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone_number" placeholder="+62...">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" placeholder="contact@example.com">
        </div>
        <div class="form-group">
          <label>Reservation Code</label>
          <input type="text" name="reservation_code" placeholder="Booking reference">
        </div>
        <div class="form-group">
          <label>Staff Name *</label>
          <select name="staff_name" required id="staffSelect">
            <option value="">Select staff</option>
            ${staffList.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
    `,
    context: { entity: 'cruise', action: 'create' }
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
  if (context.entity !== 'cruise') return;
  
  e.preventDefault();
  
  try {
    if (context.action === 'create') {
      await fetchJson('/api/cruise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      alert('Cruise added successfully');
    } else if (context.action === 'edit' && context.id) {
      await fetchJson(`/api/cruise/${context.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      alert('Cruise updated successfully');
    }
    
    await loadCruises();
  } catch (err) {
    console.error('Cruise submission failed:', err);
    alert('Operation failed: ' + err.message);
    throw err;
  }
});

await loadStaff();
await loadCruises();
