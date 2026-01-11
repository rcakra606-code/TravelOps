/**
 * Ticket Recap Dashboard
 * Manages flight bookings with multi-leg itineraries
 */

// Global state
let allTickets = [];
let filteredTickets = [];
let editingId = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 15;

// Common airlines for autocomplete
const COMMON_AIRLINES = [
  { code: 'GA', name: 'Garuda Indonesia' },
  { code: 'JT', name: 'Lion Air' },
  { code: 'ID', name: 'Batik Air' },
  { code: 'QG', name: 'Citilink' },
  { code: 'SJ', name: 'Sriwijaya Air' },
  { code: 'QZ', name: 'AirAsia Indonesia' },
  { code: 'SQ', name: 'Singapore Airlines' },
  { code: 'MH', name: 'Malaysia Airlines' },
  { code: 'TG', name: 'Thai Airways' },
  { code: 'CX', name: 'Cathay Pacific' },
  { code: 'EK', name: 'Emirates' },
  { code: 'QR', name: 'Qatar Airways' },
  { code: 'EY', name: 'Etihad Airways' },
  { code: 'TR', name: 'Scoot' },
  { code: 'AK', name: 'AirAsia' },
  { code: 'KL', name: 'KLM' },
  { code: 'LH', name: 'Lufthansa' },
  { code: 'BA', name: 'British Airways' },
  { code: 'AF', name: 'Air France' },
  { code: 'QF', name: 'Qantas' },
  { code: 'NH', name: 'All Nippon Airways' },
  { code: 'JL', name: 'Japan Airlines' },
  { code: 'KE', name: 'Korean Air' },
  { code: 'OZ', name: 'Asiana Airlines' },
  { code: 'CI', name: 'China Airlines' },
  { code: 'BR', name: 'EVA Air' },
  { code: 'CA', name: 'Air China' },
  { code: 'MU', name: 'China Eastern' },
  { code: 'CZ', name: 'China Southern' }
];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  loadTickets();
  setupEventListeners();
});

// Auth check
function initAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    document.getElementById('userName').textContent = payload.name || payload.username;
    document.getElementById('userRole').textContent = payload.type || 'User';
    
    if (payload.type === 'admin') {
      const adminLink = document.getElementById('adminSettingsLink');
      if (adminLink) adminLink.style.display = 'block';
    }
  } catch (e) {
    console.error('Auth error:', e);
    window.location.href = '/login.html';
  }
}

// API helper
async function fetchJson(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  
  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}

// Load all tickets
async function loadTickets() {
  try {
    allTickets = await fetchJson('/api/ticket_recaps/full');
    updateAirlineFilter();
    applyFilters();
    updateMetrics();
  } catch (error) {
    console.error('Failed to load tickets:', error);
    window.toast?.error('Failed to load tickets');
    document.getElementById('ticketTableBody').innerHTML = 
      '<tr><td colspan="10" style="text-align:center; padding: 40px; color: #ef4444;">Failed to load data</td></tr>';
  }
}

// Update airline filter options
function updateAirlineFilter() {
  const select = document.getElementById('airlineFilter');
  const airlines = [...new Set(allTickets.map(t => t.airline_name).filter(Boolean))];
  
  select.innerHTML = '<option value="all">All Airlines</option>' + 
    airlines.map(a => `<option value="${a}">${a}</option>`).join('');
}

// Apply filters
function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const airline = document.getElementById('airlineFilter').value;
  const gds = document.getElementById('gdsFilter').value;
  const status = document.getElementById('statusFilter').value;
  const ticketType = document.getElementById('ticketTypeFilter').value;
  const departureDate = document.getElementById('departureDateFilter').value;
  
  filteredTickets = allTickets.filter(ticket => {
    // Search filter
    if (search) {
      const searchFields = [
        ticket.booking_code,
        ticket.airline_code,
        ticket.airline_name,
        ticket.passenger_names,
        ticket.staff_name,
        ticket.notes
      ].map(f => (f || '').toLowerCase());
      
      // Also search in segments
      const segmentFields = (ticket.segments || []).flatMap(s => [
        s.origin,
        s.destination,
        s.flight_number
      ]).map(f => (f || '').toLowerCase());
      
      const allFields = [...searchFields, ...segmentFields];
      if (!allFields.some(f => f.includes(search))) return false;
    }
    
    // Airline filter
    if (airline !== 'all' && ticket.airline_name !== airline) return false;
    
    // GDS filter
    if (gds !== 'all' && ticket.gds_system !== gds) return false;
    
    // Status filter
    if (status !== 'all' && ticket.status !== status) return false;
    
    // Ticket type filter (open vs fixed)
    if (ticketType !== 'all') {
      const isOpen = ticket.is_open_ticket === 1 || ticket.is_open_ticket === true;
      if (ticketType === 'open' && !isOpen) return false;
      if (ticketType === 'fixed' && isOpen) return false;
    }
    
    // Departure date filter
    if (departureDate && ticket.segments && ticket.segments.length > 0) {
      const firstDeparture = ticket.segments[0].departure_date;
      if (firstDeparture !== departureDate) return false;
    }
    
    return true;
  });
  
  currentPage = 1;
  renderTable();
}

// Update metrics
function updateMetrics() {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  let departingToday = 0;
  let upcoming7Days = 0;
  let arrivingToday = 0;
  let openTickets = 0;
  
  allTickets.forEach(ticket => {
    // Count open tickets (active ones only)
    if ((ticket.is_open_ticket === 1 || ticket.is_open_ticket === true) && ticket.status === 'Active') {
      openTickets++;
    }
    
    if (!ticket.segments || ticket.segments.length === 0) return;
    
    const firstSegment = ticket.segments[0];
    const lastSegment = ticket.segments[ticket.segments.length - 1];
    
    // Departing today
    if (firstSegment.departure_date === today) {
      departingToday++;
    }
    
    // Upcoming 7 days
    if (firstSegment.departure_date >= today && firstSegment.departure_date <= sevenDaysFromNow) {
      upcoming7Days++;
    }
    
    // Arriving today
    if (lastSegment.arrival_date === today) {
      arrivingToday++;
    }
  });
  
  document.getElementById('totalTickets').textContent = allTickets.length;
  document.getElementById('openTickets').textContent = openTickets;
  document.getElementById('departingToday').textContent = departingToday;
  document.getElementById('upcoming7Days').textContent = upcoming7Days;
  document.getElementById('arrivingToday').textContent = arrivingToday;
}

// Render table
function renderTable() {
  const tbody = document.getElementById('ticketTableBody');
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageData = filteredTickets.slice(start, end);
  
  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding: 40px; color: var(--text-secondary);">
          No tickets found. Click "+ Add Ticket" to create one.
        </td>
      </tr>
    `;
    renderPagination();
    return;
  }
  
  tbody.innerHTML = pageData.map((ticket, index) => {
    const segments = ticket.segments || [];
    const firstSegment = segments[0] || {};
    const lastSegment = segments[segments.length - 1] || firstSegment;
    
    // Build route display
    let routeDisplay = '—';
    if (segments.length > 0) {
      if (segments.length === 1) {
        routeDisplay = `${firstSegment.origin || '?'} → ${firstSegment.destination || '?'}`;
      } else {
        routeDisplay = `${firstSegment.origin || '?'} → ... → ${lastSegment.destination || '?'}`;
      }
    }
    
    // Departure badge
    const departureBadge = getDepartureBadge(firstSegment.departure_date);
    
    // Open ticket badge
    const isOpenTicket = ticket.is_open_ticket === 1 || ticket.is_open_ticket === true;
    const openTicketBadge = isOpenTicket 
      ? '<span class="open-ticket-badge" title="Open Ticket - Daily reminders enabled">🎫 OPEN</span>'
      : '';
    
    // GDS badge
    const gdsBadge = ticket.gds_system 
      ? `<span class="gds-badge ${ticket.gds_system}">${ticket.gds_system.toUpperCase()}</span>`
      : '—';
    
    // Status badge
    const statusClass = (ticket.status || 'Active').toLowerCase().replace(' ', '-');
    
    // Passengers preview
    const passengers = (ticket.passenger_names || '').split('\n').filter(Boolean);
    const passengerDisplay = passengers.length > 0 
      ? `${passengers[0]}${passengers.length > 1 ? ` +${passengers.length - 1}` : ''}`
      : '—';
    
    return `
      <tr data-id="${ticket.id}" class="${isOpenTicket ? 'open-ticket-row' : ''}">
        <td style="text-align: center;">
          <button class="expand-segments" onclick="toggleSegments(${ticket.id})" title="View segments">
            ▼
          </button>
        </td>
        <td>
          <strong>${ticket.booking_code || '—'}</strong>
          ${openTicketBadge}
        </td>
        <td>
          ${ticket.airline_code ? `<span style="font-weight: 600;">${ticket.airline_code}</span> ` : ''}
          ${ticket.airline_name || '—'}
        </td>
        <td>${gdsBadge}</td>
        <td>
          <div class="flight-route-display">${routeDisplay}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
            ${segments.length} segment${segments.length !== 1 ? 's' : ''}
          </div>
        </td>
        <td>
          ${firstSegment.departure_date ? formatDate(firstSegment.departure_date) : '—'}
          ${departureBadge}
        </td>
        <td title="${passengers.join('\n')}">${passengerDisplay}</td>
        <td>${ticket.staff_name || '—'}</td>
        <td><span class="status-badge status-${statusClass}">${ticket.status || 'Active'}</span></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="editTicket(${ticket.id})" title="Edit">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteTicket(${ticket.id})" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
      <tr class="segments-row" id="segments-${ticket.id}">
        <td colspan="10">
          <div class="segments-detail">
            <div class="segment-timeline">
              ${segments.map((s, i) => `
                <div class="segment-item">
                  <span class="flight-no">${s.flight_number || 'TBA'}</span>
                  <span class="route">${s.origin || '?'} → ${s.destination || '?'}</span>
                  <span class="time">
                    ${s.departure_date ? formatDate(s.departure_date) : '?'} 
                    ${s.departure_time ? s.departure_time : ''}
                  </span>
                  ${s.flight_status ? `<span class="flight-status ${s.flight_status.toLowerCase().replace(' ', '-')}">${s.flight_status}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  renderPagination();
}

// Get departure badge based on date
function getDepartureBadge(dateStr) {
  if (!dateStr) return '';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const departure = new Date(dateStr);
  departure.setHours(0, 0, 0, 0);
  
  const diffDays = Math.ceil((departure - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return '<span class="departure-badge past">Past</span>';
  } else if (diffDays === 0) {
    return '<span class="departure-badge today">🔴 Today</span>';
  } else if (diffDays <= 3) {
    return `<span class="departure-badge soon">⚠️ ${diffDays}d</span>`;
  } else if (diffDays <= 7) {
    return `<span class="departure-badge upcoming">${diffDays}d</span>`;
  }
  
  return '';
}

// Toggle segments row visibility
window.toggleSegments = function(id) {
  const row = document.getElementById(`segments-${id}`);
  const btn = document.querySelector(`tr[data-id="${id}"] .expand-segments`);
  
  if (row.classList.contains('show')) {
    row.classList.remove('show');
    btn.classList.remove('expanded');
  } else {
    row.classList.add('show');
    btn.classList.add('expanded');
  }
};

// Render pagination
function renderPagination() {
  const container = document.getElementById('paginationControls');
  const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE);
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<div style="display: flex; gap: 8px; align-items: center; justify-content: center;">';
  
  html += `<button class="btn btn-sm" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(1)">«</button>`;
  html += `<button class="btn btn-sm" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">‹</button>`;
  
  html += `<span style="padding: 0 12px;">Page ${currentPage} of ${totalPages}</span>`;
  
  html += `<button class="btn btn-sm" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">›</button>`;
  html += `<button class="btn btn-sm" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${totalPages})">»</button>`;
  
  html += '</div>';
  container.innerHTML = html;
}

window.goToPage = function(page) {
  currentPage = page;
  renderTable();
};

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Setup event listeners
function setupEventListeners() {
  // Add ticket button
  document.getElementById('addTicketBtn').addEventListener('click', () => openModal());
  
  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  
  // Form submit
  document.getElementById('modalForm').addEventListener('submit', handleSubmit);
  
  // Add segment button
  document.getElementById('addSegmentBtn').addEventListener('click', addSegment);
  
  // Filter events
  document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 300));
  document.getElementById('airlineFilter').addEventListener('change', applyFilters);
  document.getElementById('gdsFilter').addEventListener('change', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('ticketTypeFilter').addEventListener('change', applyFilters);
  document.getElementById('departureDateFilter').addEventListener('change', applyFilters);
  
  // Clear filters
  document.getElementById('clearFilters').addEventListener('click', clearFilters);
  
  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportToCSV);
  
  // Airline code autocomplete
  document.getElementById('airline_code').addEventListener('input', handleAirlineCodeInput);
  
  // Modal backdrop click
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
}

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Clear filters
function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('airlineFilter').value = 'all';
  document.getElementById('gdsFilter').value = 'all';
  document.getElementById('statusFilter').value = 'all';
  document.getElementById('ticketTypeFilter').value = 'all';
  document.getElementById('departureDateFilter').value = '';
  applyFilters();
}

// Open modal
function openModal(ticket = null) {
  editingId = ticket?.id || null;
  
  document.getElementById('modalTitle').textContent = ticket ? 'Edit Ticket' : 'Add Ticket';
  
  // Reset form
  document.getElementById('modalForm').reset();
  
  // Fill form if editing
  if (ticket) {
    document.getElementById('booking_code').value = ticket.booking_code || '';
    document.getElementById('airline_code').value = ticket.airline_code || '';
    document.getElementById('gds_system').value = ticket.gds_system || '';
    document.getElementById('airline_name').value = ticket.airline_name || '';
    document.getElementById('status').value = ticket.status || 'Active';
    document.getElementById('staff_name').value = ticket.staff_name || '';
    document.getElementById('passenger_names').value = ticket.passenger_names || '';
    document.getElementById('is_open_ticket').checked = ticket.is_open_ticket === 1 || ticket.is_open_ticket === true;
    document.getElementById('notes').value = ticket.notes || '';
    
    // Add segments
    renderSegments(ticket.segments || []);
  } else {
    // Add one empty segment for new ticket
    renderSegments([{}]);
    
    // Set default staff name
    try {
      const token = localStorage.getItem('token');
      const payload = JSON.parse(atob(token.split('.')[1]));
      document.getElementById('staff_name').value = payload.name || payload.username || '';
    } catch (e) {}
  }
  
  document.getElementById('modal').classList.add('active');
}

// Close modal
function closeModal() {
  document.getElementById('modal').classList.remove('active');
  editingId = null;
}

// Render segments in form
function renderSegments(segments) {
  const container = document.getElementById('segmentsContainer');
  
  if (segments.length === 0) {
    segments = [{}];
  }
  
  container.innerHTML = segments.map((s, i) => createSegmentCard(s, i)).join('');
}

// Create segment card HTML
function createSegmentCard(segment, index) {
  return `
    <div class="segment-card" data-index="${index}">
      <div class="segment-header">
        <span class="segment-title">✈️ Segment ${index + 1}</span>
        ${index > 0 ? '<button type="button" class="segment-remove" onclick="removeSegment(this)">Remove</button>' : ''}
      </div>
      <div class="segment-grid">
        <div class="segment-field">
          <label>Origin <span class="required">*</span></label>
          <input type="text" name="segment_origin_${index}" value="${segment.origin || ''}" placeholder="CGK" required maxlength="3" style="text-transform: uppercase;">
        </div>
        <div class="segment-field">
          <label>Destination <span class="required">*</span></label>
          <input type="text" name="segment_destination_${index}" value="${segment.destination || ''}" placeholder="SIN" required maxlength="3" style="text-transform: uppercase;">
        </div>
        <div class="segment-field">
          <label>Flight Number</label>
          <input type="text" name="segment_flight_${index}" value="${segment.flight_number || ''}" placeholder="GA123" style="text-transform: uppercase;">
        </div>
        <div class="segment-field">
          <label>Departure Date</label>
          <input type="date" name="segment_dep_date_${index}" value="${segment.departure_date || ''}">
        </div>
        <div class="segment-field">
          <label>Departure Time</label>
          <input type="time" name="segment_dep_time_${index}" value="${segment.departure_time || ''}">
        </div>
        <div class="segment-field">
          <label>Arrival Date</label>
          <input type="date" name="segment_arr_date_${index}" value="${segment.arrival_date || ''}">
        </div>
        <div class="segment-field">
          <label>Arrival Time</label>
          <input type="time" name="segment_arr_time_${index}" value="${segment.arrival_time || ''}">
        </div>
        <div class="segment-field">
          <label>Flight Status</label>
          <select name="segment_status_${index}">
            <option value="Scheduled" ${segment.flight_status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
            <option value="On Time" ${segment.flight_status === 'On Time' ? 'selected' : ''}>On Time</option>
            <option value="Delayed" ${segment.flight_status === 'Delayed' ? 'selected' : ''}>Delayed</option>
            <option value="Departed" ${segment.flight_status === 'Departed' ? 'selected' : ''}>Departed</option>
            <option value="Arrived" ${segment.flight_status === 'Arrived' ? 'selected' : ''}>Arrived</option>
            <option value="Cancelled" ${segment.flight_status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

// Add new segment
function addSegment() {
  const container = document.getElementById('segmentsContainer');
  const index = container.children.length;
  const segmentHtml = createSegmentCard({}, index);
  container.insertAdjacentHTML('beforeend', segmentHtml);
}

// Remove segment
window.removeSegment = function(btn) {
  const card = btn.closest('.segment-card');
  card.remove();
  
  // Re-index remaining segments
  const cards = document.querySelectorAll('.segment-card');
  cards.forEach((card, i) => {
    card.dataset.index = i;
    card.querySelector('.segment-title').textContent = `✈️ Segment ${i + 1}`;
    
    // Update input names
    card.querySelectorAll('input, select').forEach(input => {
      const name = input.name.replace(/_\d+$/, `_${i}`);
      input.name = name;
    });
  });
};

// Handle airline code autocomplete
function handleAirlineCodeInput(e) {
  const code = e.target.value.toUpperCase();
  const airline = COMMON_AIRLINES.find(a => a.code === code);
  
  if (airline) {
    document.getElementById('airline_name').value = airline.name;
  }
}

// Handle form submit
async function handleSubmit(e) {
  e.preventDefault();
  
  const form = e.target;
  
  // Collect ticket data
  const ticket = {
    booking_code: form.booking_code.value.toUpperCase(),
    airline_code: form.airline_code.value.toUpperCase() || null,
    gds_system: form.gds_system.value || null,
    airline_name: form.airline_name.value || null,
    status: form.status.value || 'Active',
    staff_name: form.staff_name.value || null,
    passenger_names: form.passenger_names.value || null,
    is_open_ticket: form.is_open_ticket.checked ? 1 : 0,
    notes: form.notes.value || null
  };
  
  // Collect segments
  const segmentCards = document.querySelectorAll('.segment-card');
  const segments = [];
  
  for (const card of segmentCards) {
    const index = card.dataset.index;
    const segment = {
      origin: form[`segment_origin_${index}`]?.value.toUpperCase() || '',
      destination: form[`segment_destination_${index}`]?.value.toUpperCase() || '',
      flight_number: form[`segment_flight_${index}`]?.value.toUpperCase() || null,
      departure_date: form[`segment_dep_date_${index}`]?.value || null,
      departure_time: form[`segment_dep_time_${index}`]?.value || null,
      arrival_date: form[`segment_arr_date_${index}`]?.value || null,
      arrival_time: form[`segment_arr_time_${index}`]?.value || null,
      flight_status: form[`segment_status_${index}`]?.value || 'Scheduled'
    };
    
    if (segment.origin && segment.destination) {
      segments.push(segment);
    }
  }
  
  if (segments.length === 0) {
    window.toast?.warning('Please add at least one flight segment');
    return;
  }
  
  try {
    document.getElementById('modalSave').disabled = true;
    document.getElementById('modalSave').textContent = 'Saving...';
    
    const payload = { ticket, segments };
    
    if (editingId) {
      await fetchJson(`/api/ticket_recaps/${editingId}/full`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      window.toast?.success('Ticket updated successfully');
    } else {
      await fetchJson('/api/ticket_recaps/full', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      window.toast?.success('Ticket created successfully');
    }
    
    closeModal();
    loadTickets();
  } catch (error) {
    console.error('Save error:', error);
    window.toast?.error(error.message || 'Failed to save ticket');
  } finally {
    document.getElementById('modalSave').disabled = false;
    document.getElementById('modalSave').textContent = 'Save Ticket';
  }
}

// Edit ticket
window.editTicket = async function(id) {
  const ticket = allTickets.find(t => t.id === id);
  if (ticket) {
    openModal(ticket);
  }
};

// Delete ticket
window.deleteTicket = async function(id) {
  const ticket = allTickets.find(t => t.id === id);
  if (!ticket) return;
  
  const confirmed = await window.confirmDialog?.show({
    title: 'Delete Ticket',
    message: `Are you sure you want to delete ticket "${ticket.booking_code}"?`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    type: 'danger'
  });
  
  if (confirmed === false) return;
  if (confirmed !== true && !confirm(`Delete ticket "${ticket.booking_code}"?`)) return;
  
  try {
    await fetchJson(`/api/ticket_recaps/${id}`, { method: 'DELETE' });
    window.toast?.success('Ticket deleted successfully');
    loadTickets();
  } catch (error) {
    console.error('Delete error:', error);
    window.toast?.error(error.message || 'Failed to delete ticket');
  }
};

// Export to CSV
function exportToCSV() {
  if (filteredTickets.length === 0) {
    window.toast?.warning('No data to export');
    return;
  }
  
  const headers = ['Booking Code', 'Airline Code', 'Airline Name', 'GDS', 'Passengers', 'Staff', 'Status', 'Route', 'First Departure'];
  
  const rows = filteredTickets.map(ticket => {
    const segments = ticket.segments || [];
    const firstSeg = segments[0] || {};
    const lastSeg = segments[segments.length - 1] || firstSeg;
    const route = segments.length > 0 ? `${firstSeg.origin || '?'} - ${lastSeg.destination || '?'}` : '';
    
    return [
      ticket.booking_code || '',
      ticket.airline_code || '',
      ticket.airline_name || '',
      ticket.gds_system || '',
      (ticket.passenger_names || '').replace(/\n/g, '; '),
      ticket.staff_name || '',
      ticket.status || '',
      route,
      firstSeg.departure_date || ''
    ];
  });
  
  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `ticket_recap_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  
  window.toast?.success('Export completed');
}

// Export for external use
export { loadTickets, allTickets };
