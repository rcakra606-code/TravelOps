/**
 * Enhanced Customer Relationship Manager (CRM)
 * Complete CRM-style customer management with history, notes, and analytics
 */

class CustomerDatabase {
  constructor() {
    this.storageKey = 'travelops_customers';
    this.notesKey = 'travelops_customer_notes';
    this.init();
  }

  init() {
    this.addStyles();
    this.addCustomerButton();
  }

  // Get customers from localStorage
  getCustomers() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch {
      return [];
    }
  }

  getCustomerById(id) {
    return this.getCustomers().find(c => c.id === id);
  }

  saveCustomers(customers) {
    localStorage.setItem(this.storageKey, JSON.stringify(customers));
  }

  saveCustomer(customer) {
    const customers = this.getCustomers();
    const existing = customers.findIndex(c => c.id === customer.id);
    
    if (existing >= 0) {
      customers[existing] = {
        ...customers[existing],
        ...customer,
        updatedAt: new Date().toISOString()
      };
    } else {
      customers.push({
        id: Date.now(),
        ...customer,
        createdAt: new Date().toISOString(),
        tourCount: 0,
        totalSpent: 0,
        tags: customer.tags || [],
        status: customer.status || 'active'
      });
    }
    
    this.saveCustomers(customers);
    return customers;
  }

  deleteCustomer(id) {
    const customers = this.getCustomers().filter(c => c.id !== id);
    this.saveCustomers(customers);
    // Also delete notes
    const notes = this.getNotes().filter(n => n.customerId !== id);
    localStorage.setItem(this.notesKey, JSON.stringify(notes));
    return customers;
  }

  // Notes management
  getNotes(customerId = null) {
    try {
      const notes = JSON.parse(localStorage.getItem(this.notesKey) || '[]');
      return customerId ? notes.filter(n => n.customerId === customerId) : notes;
    } catch {
      return [];
    }
  }

  addNote(customerId, note) {
    const notes = this.getNotes();
    notes.push({
      id: Date.now(),
      customerId,
      text: note,
      createdAt: new Date().toISOString(),
      user: localStorage.getItem('username') || 'User'
    });
    localStorage.setItem(this.notesKey, JSON.stringify(notes));
    return notes;
  }

  deleteNote(noteId) {
    const notes = this.getNotes().filter(n => n.id !== noteId);
    localStorage.setItem(this.notesKey, JSON.stringify(notes));
    return notes;
  }

  searchCustomers(query) {
    const customers = this.getCustomers();
    if (!query) return customers;
    
    const q = query.toLowerCase();
    return customers.filter(c => 
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  // Auto-sync customers from tours and sales data
  async syncFromData() {
    try {
      const [tours, sales] = await Promise.all([
        window.fetchJson?.('/api/tours') || [],
        window.fetchJson?.('/api/sales') || []
      ]);
      
      const existingCustomers = this.getCustomers();
      const customerMap = new Map();

      // Build map from existing
      existingCustomers.forEach(c => {
        const key = (c.email || c.phone || c.name || '').toLowerCase();
        if (key) customerMap.set(key, c);
      });

      // Process tours
      tours.forEach(tour => {
        const name = tour.lead_passenger || tour.customer_name || tour.client;
        const email = tour.email || '';
        const phone = tour.phone_number || tour.phone || '';
        const key = (email || phone || name || '').toLowerCase();
        
        if (!key || !name) return;

        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: Date.now() + Math.random(),
            name: name,
            email: email,
            phone: phone,
            company: '',
            address: '',
            tags: [],
            status: 'active',
            tours: [],
            totalSpent: 0,
            tourCount: 0,
            createdAt: new Date().toISOString()
          });
        }

        const customer = customerMap.get(key);
        const amount = parseFloat(tour.price) || parseFloat(tour.sales_amount) || 0;
        
        // Check if tour already tracked
        if (!customer.tours) customer.tours = [];
        const tourExists = customer.tours.some(t => t.id === tour.id);
        
        if (!tourExists) {
          customer.tours.push({
            id: tour.id,
            type: 'tour',
            name: tour.tour_name || tour.tour_code || 'Tour',
            date: tour.date || tour.departure_date,
            amount: amount,
            status: tour.status
          });
          customer.totalSpent = (customer.totalSpent || 0) + amount;
          customer.tourCount = customer.tours.length;
        }
        
        customer.lastActivity = tour.date || tour.departure_date;
      });

      // Process sales
      sales.forEach(sale => {
        const name = sale.customer_name || sale.client || sale.name;
        const email = sale.email || '';
        const phone = sale.phone || '';
        const key = (email || phone || name || '').toLowerCase();
        
        if (!key || !name) return;

        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: Date.now() + Math.random(),
            name: name,
            email: email,
            phone: phone,
            company: '',
            address: '',
            tags: [],
            status: 'active',
            tours: [],
            totalSpent: 0,
            tourCount: 0,
            createdAt: new Date().toISOString()
          });
        }

        const customer = customerMap.get(key);
        const amount = parseFloat(sale.price) || parseFloat(sale.amount) || 0;
        
        if (!customer.tours) customer.tours = [];
        const saleExists = customer.tours.some(t => t.id === sale.id && t.type === 'sale');
        
        if (!saleExists) {
          customer.tours.push({
            id: sale.id,
            type: 'sale',
            name: sale.description || sale.product || 'Sale',
            date: sale.date,
            amount: amount,
            status: sale.status
          });
          customer.totalSpent = (customer.totalSpent || 0) + amount;
          customer.tourCount = customer.tours.length;
        }

        if (!customer.lastActivity || new Date(sale.date) > new Date(customer.lastActivity)) {
          customer.lastActivity = sale.date;
        }
      });

      const customers = Array.from(customerMap.values());
      this.saveCustomers(customers);
      return customers;
    } catch (err) {
      console.error('Failed to sync customers:', err);
      return this.getCustomers();
    }
  }

  // Analytics
  getAnalytics() {
    const customers = this.getCustomers();
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

    return {
      total: customers.length,
      active: customers.filter(c => c.status === 'active').length,
      repeat: customers.filter(c => c.tourCount > 1).length,
      vip: customers.filter(c => c.totalSpent >= 50000000 || c.tourCount >= 5).length,
      recentlyActive: customers.filter(c => new Date(c.lastActivity) >= thirtyDaysAgo).length,
      inactive: customers.filter(c => new Date(c.lastActivity) < ninetyDaysAgo).length,
      totalRevenue: customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0),
      avgSpend: customers.length > 0 ? 
        customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / customers.length : 0,
      topSpenders: [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 5)
    };
  }

  addCustomerButton() {
    setTimeout(() => {
      // Try multiple selectors to find header area
      let header = document.querySelector('.header-actions');
      
      // If no header-actions, try to create one in the header
      if (!header) {
        const mainHeader = document.querySelector('.header');
        if (mainHeader) {
          // Check if header-actions already exists
          header = mainHeader.querySelector('.header-actions');
          if (!header) {
            header = document.createElement('div');
            header.className = 'header-actions';
            header.style.cssText = 'display: flex; gap: 8px; align-items: center;';
            mainHeader.appendChild(header);
          }
        }
      }
      
      if (!header || document.getElementById('customerDbBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'customerDbBtn';
      btn.className = 'btn customer-db-btn';
      btn.innerHTML = '👥 CRM';
      btn.title = 'Customer Relationship Manager';
      btn.addEventListener('click', () => this.showCustomerModal());
      header.appendChild(btn);
    }, 1000);
  }

  async showCustomerModal() {
    document.getElementById('customerDbModal')?.remove();
    
    // Show loading
    const loadingModal = document.createElement('div');
    loadingModal.className = 'customer-db-modal show';
    loadingModal.innerHTML = '<div class="customer-loading">⏳ Loading customer data...</div>';
    document.body.appendChild(loadingModal);

    // Sync data
    await this.syncFromData();
    loadingModal.remove();

    const customers = this.getCustomers();
    const analytics = this.getAnalytics();

    const modal = document.createElement('div');
    modal.id = 'customerDbModal';
    modal.className = 'customer-db-modal';
    modal.innerHTML = `
      <div class="customer-db-content">
        <div class="customer-db-header">
          <div class="header-left">
            <h2>👥 Customer Relationship Manager</h2>
            <span class="sync-status">Last sync: ${new Date().toLocaleTimeString()}</span>
          </div>
          <div class="header-right">
            <button class="btn btn-secondary" id="syncCustomersBtn">🔄 Sync</button>
            <button class="btn btn-primary" id="addCustomerBtn">+ Add Customer</button>
            <button class="customer-db-close" id="closeCustomerDb">&times;</button>
          </div>
        </div>

        <div class="customer-db-tabs">
          <button class="cdb-tab active" data-tab="list">📋 Customer List</button>
          <button class="cdb-tab" data-tab="analytics">📊 Analytics</button>
          <button class="cdb-tab" data-tab="segments">🏷️ Segments</button>
        </div>

        <div class="customer-tab-content" id="listTab">
          <div class="customer-toolbar">
            <div class="search-box">
              <input type="text" id="customerSearch" placeholder="🔍 Search by name, email, phone, or tag...">
            </div>
            <div class="filter-buttons">
              <button class="filter-btn active" data-filter="all">All (${customers.length})</button>
              <button class="filter-btn" data-filter="repeat">Repeat (${analytics.repeat})</button>
              <button class="filter-btn" data-filter="vip">VIP (${analytics.vip})</button>
              <button class="filter-btn" data-filter="inactive">Inactive</button>
            </div>
          </div>

          <div class="customer-list-container">
            <table class="customer-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Bookings</th>
                  <th>Total Spent</th>
                  <th>Last Activity</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="customerTableBody">
                ${this.renderCustomerRows(customers)}
              </tbody>
            </table>
          </div>
        </div>

        <div class="customer-tab-content" id="analyticsTab" style="display:none;">
          <div class="analytics-grid">
            <div class="analytics-card primary">
              <div class="analytics-icon">👥</div>
              <div class="analytics-data">
                <span class="analytics-value">${analytics.total}</span>
                <span class="analytics-label">Total Customers</span>
              </div>
            </div>
            <div class="analytics-card">
              <div class="analytics-icon">🔄</div>
              <div class="analytics-data">
                <span class="analytics-value">${analytics.repeat}</span>
                <span class="analytics-label">Repeat Customers</span>
              </div>
            </div>
            <div class="analytics-card">
              <div class="analytics-icon">⭐</div>
              <div class="analytics-data">
                <span class="analytics-value">${analytics.vip}</span>
                <span class="analytics-label">VIP Customers</span>
              </div>
            </div>
            <div class="analytics-card">
              <div class="analytics-icon">💰</div>
              <div class="analytics-data">
                <span class="analytics-value">Rp ${(analytics.totalRevenue / 1000000).toFixed(1)}M</span>
                <span class="analytics-label">Total Revenue</span>
              </div>
            </div>
            <div class="analytics-card">
              <div class="analytics-icon">📊</div>
              <div class="analytics-data">
                <span class="analytics-value">Rp ${(analytics.avgSpend / 1000000).toFixed(1)}M</span>
                <span class="analytics-label">Avg. per Customer</span>
              </div>
            </div>
            <div class="analytics-card">
              <div class="analytics-icon">📅</div>
              <div class="analytics-data">
                <span class="analytics-value">${analytics.recentlyActive}</span>
                <span class="analytics-label">Active (30 days)</span>
              </div>
            </div>
          </div>

          <div class="top-customers">
            <h4>🏆 Top Spenders</h4>
            <div class="top-list">
              ${analytics.topSpenders.map((c, i) => `
                <div class="top-item">
                  <span class="rank">#${i + 1}</span>
                  <span class="name">${c.name}</span>
                  <span class="amount">Rp ${(c.totalSpent || 0).toLocaleString('id-ID')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="customer-tab-content" id="segmentsTab" style="display:none;">
          <div class="segments-container">
            <div class="segment-card">
              <h4>⭐ VIP Customers</h4>
              <p>Spent ≥ Rp 50M or 5+ bookings</p>
              <span class="segment-count">${analytics.vip} customers</span>
              <button class="btn btn-sm view-segment" data-segment="vip">View</button>
            </div>
            <div class="segment-card">
              <h4>🔄 Repeat Customers</h4>
              <p>2+ bookings with us</p>
              <span class="segment-count">${analytics.repeat} customers</span>
              <button class="btn btn-sm view-segment" data-segment="repeat">View</button>
            </div>
            <div class="segment-card">
              <h4>🆕 New Customers</h4>
              <p>Only 1 booking so far</p>
              <span class="segment-count">${customers.filter(c => c.tourCount === 1).length} customers</span>
              <button class="btn btn-sm view-segment" data-segment="new">View</button>
            </div>
            <div class="segment-card warning">
              <h4>⚠️ Inactive Customers</h4>
              <p>No activity in 90+ days</p>
              <span class="segment-count">${analytics.inactive} customers</span>
              <button class="btn btn-sm view-segment" data-segment="inactive">View</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    this.bindModalEvents(modal);
  }

  bindModalEvents(modal) {
    // Close
    document.getElementById('closeCustomerDb')?.addEventListener('click', () => this.closeModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });

    // Tabs
    document.querySelectorAll('.cdb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cdb-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.customer-tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + 'Tab').style.display = 'block';
      });
    });

    // Search
    document.getElementById('customerSearch')?.addEventListener('input', (e) => {
      const filtered = this.searchCustomers(e.target.value);
      document.getElementById('customerTableBody').innerHTML = this.renderCustomerRows(filtered);
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyFilter(btn.dataset.filter);
      });
    });

    // Sync
    document.getElementById('syncCustomersBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('syncCustomersBtn');
      btn.innerHTML = '⏳ Syncing...';
      btn.disabled = true;
      await this.syncFromData();
      window.toast?.success('Customer data synced');
      this.closeModal();
      this.showCustomerModal();
    });

    // Add customer
    document.getElementById('addCustomerBtn')?.addEventListener('click', () => this.showAddForm());

    // View segment
    document.querySelectorAll('.view-segment').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('.cdb-tab[data-tab="list"]').click();
        document.querySelector(`.filter-btn[data-filter="${btn.dataset.segment}"]`)?.click();
      });
    });

    // Table actions
    document.getElementById('customerTableBody')?.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.view-customer');
      const editBtn = e.target.closest('.edit-customer');
      const deleteBtn = e.target.closest('.delete-customer');

      if (viewBtn) {
        this.showCustomerDetails(parseInt(viewBtn.dataset.id));
      }
      if (editBtn) {
        this.showEditForm(parseInt(editBtn.dataset.id));
      }
      if (deleteBtn) {
        if (confirm('Delete this customer and all their data?')) {
          this.deleteCustomer(parseInt(deleteBtn.dataset.id));
          this.applyFilter(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
          window.toast?.success('Customer deleted');
        }
      }
    });
  }

  applyFilter(filter) {
    let customers = this.getCustomers();
    const now = new Date();
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

    switch(filter) {
      case 'repeat':
        customers = customers.filter(c => c.tourCount > 1);
        break;
      case 'vip':
        customers = customers.filter(c => c.totalSpent >= 50000000 || c.tourCount >= 5);
        break;
      case 'new':
        customers = customers.filter(c => c.tourCount === 1);
        break;
      case 'inactive':
        customers = customers.filter(c => !c.lastActivity || new Date(c.lastActivity) < ninetyDaysAgo);
        break;
    }

    document.getElementById('customerTableBody').innerHTML = this.renderCustomerRows(customers);
  }

  renderCustomerRows(customers) {
    if (customers.length === 0) {
      return '<tr><td colspan="7" class="empty-row">No customers found</td></tr>';
    }

    return customers.map(c => {
      const isVip = (c.totalSpent || 0) >= 50000000 || (c.tourCount || 0) >= 5;
      const isRepeat = (c.tourCount || 0) > 1;
      const lastActivity = c.lastActivity ? new Date(c.lastActivity).toLocaleDateString() : '-';
      
      return `
        <tr data-id="${c.id}">
          <td>
            <div class="customer-name-cell">
              <div class="customer-avatar">${(c.name || '?').charAt(0).toUpperCase()}</div>
              <div class="customer-name-info">
                <span class="name">${c.name || 'Unknown'}</span>
                ${isVip ? '<span class="badge vip">VIP</span>' : ''}
                ${isRepeat && !isVip ? '<span class="badge repeat">Repeat</span>' : ''}
              </div>
            </div>
          </td>
          <td>
            <div class="contact-info">
              ${c.email ? `<span class="email">📧 ${c.email}</span>` : ''}
              ${c.phone ? `<span class="phone">📱 ${c.phone}</span>` : ''}
            </div>
          </td>
          <td><strong>${c.tourCount || 0}</strong></td>
          <td class="amount">Rp ${(c.totalSpent || 0).toLocaleString('id-ID')}</td>
          <td>${lastActivity}</td>
          <td><span class="status-badge ${c.status || 'active'}">${c.status || 'active'}</span></td>
          <td class="actions-cell">
            <button class="action-btn view-customer" data-id="${c.id}" title="View">👁️</button>
            <button class="action-btn edit-customer" data-id="${c.id}" title="Edit">✏️</button>
            <button class="action-btn delete-customer" data-id="${c.id}" title="Delete">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  showCustomerDetails(id) {
    const customer = this.getCustomerById(id);
    if (!customer) return;

    const notes = this.getNotes(id);
    
    const detailModal = document.createElement('div');
    detailModal.className = 'customer-detail-modal';
    detailModal.innerHTML = `
      <div class="customer-detail-content">
        <div class="detail-header">
          <div class="customer-profile">
            <div class="profile-avatar">${(customer.name || '?').charAt(0).toUpperCase()}</div>
            <div class="profile-info">
              <h3>${customer.name}</h3>
              <span class="customer-since">Customer since ${new Date(customer.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <button class="detail-close" id="closeDetailModal">&times;</button>
        </div>

        <div class="detail-body">
          <div class="detail-section">
            <h4>📋 Contact Information</h4>
            <div class="info-grid">
              <div class="info-item">
                <label>Email</label>
                <span>${customer.email || '-'}</span>
              </div>
              <div class="info-item">
                <label>Phone</label>
                <span>${customer.phone || '-'}</span>
              </div>
              <div class="info-item">
                <label>Company</label>
                <span>${customer.company || '-'}</span>
              </div>
              <div class="info-item">
                <label>Address</label>
                <span>${customer.address || '-'}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h4>📊 Statistics</h4>
            <div class="stats-row">
              <div class="stat-item">
                <span class="stat-number">${customer.tourCount || 0}</span>
                <span class="stat-text">Total Bookings</span>
              </div>
              <div class="stat-item">
                <span class="stat-number">Rp ${((customer.totalSpent || 0) / 1000000).toFixed(1)}M</span>
                <span class="stat-text">Total Spent</span>
              </div>
              <div class="stat-item">
                <span class="stat-number">Rp ${customer.tourCount > 0 ? ((customer.totalSpent || 0) / customer.tourCount / 1000000).toFixed(1) : 0}M</span>
                <span class="stat-text">Avg. per Booking</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h4>🎫 Booking History</h4>
            <div class="booking-history">
              ${(customer.tours || []).length > 0 ? 
                customer.tours.sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => `
                  <div class="booking-item">
                    <div class="booking-icon">${t.type === 'tour' ? '🎫' : '💼'}</div>
                    <div class="booking-info">
                      <span class="booking-name">${t.name}</span>
                      <span class="booking-date">${new Date(t.date).toLocaleDateString()}</span>
                    </div>
                    <div class="booking-amount">Rp ${(t.amount || 0).toLocaleString('id-ID')}</div>
                  </div>
                `).join('') : 
                '<div class="no-data">No bookings recorded</div>'
              }
            </div>
          </div>

          <div class="detail-section">
            <h4>📝 Notes</h4>
            <div class="notes-container">
              <div class="add-note-form">
                <textarea id="newNoteText" placeholder="Add a note about this customer..."></textarea>
                <button class="btn btn-sm btn-primary" id="addNoteBtn">Add Note</button>
              </div>
              <div class="notes-list" id="notesList">
                ${notes.length > 0 ? 
                  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(n => `
                    <div class="note-item" data-note-id="${n.id}">
                      <div class="note-header">
                        <span class="note-author">${n.user}</span>
                        <span class="note-date">${new Date(n.createdAt).toLocaleString()}</span>
                        <button class="delete-note" data-note-id="${n.id}">&times;</button>
                      </div>
                      <div class="note-text">${n.text}</div>
                    </div>
                  `).join('') : 
                  '<div class="no-notes">No notes yet</div>'
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(detailModal);
    requestAnimationFrame(() => detailModal.classList.add('show'));

    // Events
    document.getElementById('closeDetailModal')?.addEventListener('click', () => {
      detailModal.classList.remove('show');
      setTimeout(() => detailModal.remove(), 200);
    });

    document.getElementById('addNoteBtn')?.addEventListener('click', () => {
      const text = document.getElementById('newNoteText')?.value.trim();
      if (text) {
        this.addNote(id, text);
        document.getElementById('newNoteText').value = '';
        // Refresh notes
        const updatedNotes = this.getNotes(id);
        document.getElementById('notesList').innerHTML = updatedNotes.length > 0 ?
          updatedNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(n => `
            <div class="note-item" data-note-id="${n.id}">
              <div class="note-header">
                <span class="note-author">${n.user}</span>
                <span class="note-date">${new Date(n.createdAt).toLocaleString()}</span>
                <button class="delete-note" data-note-id="${n.id}">&times;</button>
              </div>
              <div class="note-text">${n.text}</div>
            </div>
          `).join('') : '<div class="no-notes">No notes yet</div>';
        window.toast?.success('Note added');
      }
    });

    document.getElementById('notesList')?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-note');
      if (deleteBtn) {
        this.deleteNote(parseInt(deleteBtn.dataset.noteId));
        deleteBtn.closest('.note-item').remove();
        if (document.querySelectorAll('.note-item').length === 0) {
          document.getElementById('notesList').innerHTML = '<div class="no-notes">No notes yet</div>';
        }
      }
    });

    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) {
        detailModal.classList.remove('show');
        setTimeout(() => detailModal.remove(), 200);
      }
    });
  }

  showAddForm() {
    this.showEditForm(null);
  }

  showEditForm(id) {
    const customer = id ? this.getCustomerById(id) : null;
    const isEdit = !!customer;

    const formModal = document.createElement('div');
    formModal.className = 'customer-form-modal';
    formModal.innerHTML = `
      <div class="customer-form-content">
        <div class="form-header">
          <h3>${isEdit ? '✏️ Edit Customer' : '➕ Add Customer'}</h3>
          <button class="form-close" id="closeFormModal">&times;</button>
        </div>
        <div class="form-body">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" id="customerName" value="${customer?.name || ''}" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="customerEmail" value="${customer?.email || ''}">
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input type="tel" id="customerPhone" value="${customer?.phone || ''}">
            </div>
          </div>
          <div class="form-group">
            <label>Company</label>
            <input type="text" id="customerCompany" value="${customer?.company || ''}">
          </div>
          <div class="form-group">
            <label>Address</label>
            <textarea id="customerAddress" rows="2">${customer?.address || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="customerStatus">
              <option value="active" ${customer?.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${customer?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
              <option value="vip" ${customer?.status === 'vip' ? 'selected' : ''}>VIP</option>
            </select>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" id="cancelForm">Cancel</button>
            <button class="btn btn-primary" id="saveCustomer">${isEdit ? 'Update' : 'Add'} Customer</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(formModal);
    requestAnimationFrame(() => formModal.classList.add('show'));

    const closeForm = () => {
      formModal.classList.remove('show');
      setTimeout(() => formModal.remove(), 200);
    };

    document.getElementById('closeFormModal')?.addEventListener('click', closeForm);
    document.getElementById('cancelForm')?.addEventListener('click', closeForm);

    document.getElementById('saveCustomer')?.addEventListener('click', () => {
      const name = document.getElementById('customerName')?.value.trim();
      if (!name) {
        window.toast?.error('Name is required');
        return;
      }

      const data = {
        id: customer?.id,
        name,
        email: document.getElementById('customerEmail')?.value.trim(),
        phone: document.getElementById('customerPhone')?.value.trim(),
        company: document.getElementById('customerCompany')?.value.trim(),
        address: document.getElementById('customerAddress')?.value.trim(),
        status: document.getElementById('customerStatus')?.value,
        tourCount: customer?.tourCount || 0,
        totalSpent: customer?.totalSpent || 0,
        tours: customer?.tours || []
      };

      this.saveCustomer(data);
      window.toast?.success(`Customer ${isEdit ? 'updated' : 'added'}`);
      closeForm();
      
      // Refresh list
      this.applyFilter('all');
    });

    formModal.addEventListener('click', (e) => {
      if (e.target === formModal) closeForm();
    });
  }

  closeModal() {
    const modal = document.getElementById('customerDbModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  addStyles() {
    if (document.getElementById('customerDbStyles')) return;

    const style = document.createElement('style');
    style.id = 'customerDbStyles';
    style.textContent = `
      .customer-db-btn {
        background: linear-gradient(135deg, #06b6d4, #0891b2) !important;
        color: white !important;
      }

      .customer-db-modal,
      .customer-detail-modal,
      .customer-form-modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s;
        backdrop-filter: blur(4px);
      }

      .customer-db-modal.show,
      .customer-detail-modal.show,
      .customer-form-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .customer-loading {
        background: var(--card, #fff);
        padding: 40px 60px;
        border-radius: 16px;
        font-size: 16px;
      }

      .customer-db-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 95%;
        max-width: 1100px;
        height: 85vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0,0,0,0.4);
      }

      .customer-db-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        background: linear-gradient(135deg, #06b6d4, #0891b2);
        color: white;
      }

      .customer-db-header h2 { margin: 0; font-size: 18px; }
      .sync-status { font-size: 11px; opacity: 0.8; }

      .header-right {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .customer-db-close {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }

      .customer-db-tabs {
        display: flex;
        background: var(--bg-alt, #f9fafb);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .cdb-tab {
        flex: 1;
        padding: 14px;
        border: none;
        background: none;
        cursor: pointer;
        font-weight: 500;
        color: var(--text-secondary, #6b7280);
      }

      .cdb-tab.active {
        color: #06b6d4;
        background: var(--card, #fff);
        border-bottom: 2px solid #06b6d4;
      }

      .customer-tab-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .customer-toolbar {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .search-box {
        flex: 1;
        min-width: 250px;
      }

      .search-box input {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--border-light, #d1d5db);
        border-radius: 8px;
        font-size: 14px;
      }

      .filter-buttons {
        display: flex;
        gap: 8px;
      }

      .filter-btn {
        padding: 8px 14px;
        border: 1px solid var(--border-light, #d1d5db);
        background: var(--card, #fff);
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .filter-btn.active {
        background: #06b6d4;
        color: white;
        border-color: #06b6d4;
      }

      .customer-table {
        width: 100%;
        border-collapse: collapse;
      }

      .customer-table th,
      .customer-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .customer-table th {
        background: var(--bg-alt, #f9fafb);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-secondary, #6b7280);
      }

      .customer-name-cell {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .customer-avatar {
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #06b6d4, #0891b2);
        color: white;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
      }

      .customer-name-info .name {
        font-weight: 600;
        display: block;
      }

      .badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
      }

      .badge.vip {
        background: #fef3c7;
        color: #d97706;
      }

      .badge.repeat {
        background: #dbeafe;
        color: #2563eb;
      }

      .contact-info {
        display: flex;
        flex-direction: column;
        font-size: 13px;
        gap: 2px;
      }

      .status-badge {
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        text-transform: capitalize;
      }

      .status-badge.active { background: #dcfce7; color: #16a34a; }
      .status-badge.inactive { background: #fee2e2; color: #dc2626; }
      .status-badge.vip { background: #fef3c7; color: #d97706; }

      .actions-cell {
        display: flex;
        gap: 6px;
      }

      .action-btn {
        width: 30px;
        height: 30px;
        border: none;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      }

      .action-btn:hover {
        background: var(--border-light, #e5e7eb);
      }

      .empty-row {
        text-align: center;
        color: var(--text-secondary, #6b7280);
        padding: 40px !important;
      }

      /* Analytics */
      .analytics-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }

      .analytics-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
      }

      .analytics-card.primary {
        background: linear-gradient(135deg, #06b6d4, #0891b2);
        color: white;
      }

      .analytics-icon {
        font-size: 28px;
      }

      .analytics-value {
        display: block;
        font-size: 24px;
        font-weight: 700;
      }

      .analytics-label {
        font-size: 12px;
        opacity: 0.8;
      }

      .top-customers h4 {
        margin: 0 0 16px 0;
      }

      .top-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
        margin-bottom: 8px;
      }

      .top-item .rank {
        font-weight: 700;
        color: #d97706;
      }

      .top-item .name { flex: 1; font-weight: 500; }
      .top-item .amount { font-weight: 600; color: #059669; }

      /* Segments */
      .segments-container {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      .segment-card {
        padding: 20px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
      }

      .segment-card.warning {
        background: #fef3c7;
      }

      .segment-card h4 { margin: 0 0 8px 0; }
      .segment-card p { 
        margin: 0 0 12px 0; 
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }

      .segment-count {
        display: block;
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 12px;
      }

      /* Detail Modal */
      .customer-detail-content,
      .customer-form-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 90%;
        max-width: 600px;
        max-height: 85vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        background: linear-gradient(135deg, #06b6d4, #0891b2);
        color: white;
      }

      .customer-profile {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .profile-avatar {
        width: 56px;
        height: 56px;
        background: rgba(255,255,255,0.2);
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        font-weight: 700;
      }

      .profile-info h3 { margin: 0; }
      .customer-since { font-size: 12px; opacity: 0.8; }

      .detail-close {
        width: 36px;
        height: 36px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 10px;
        font-size: 22px;
        cursor: pointer;
      }

      .detail-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
      }

      .detail-section {
        margin-bottom: 24px;
      }

      .detail-section h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: var(--text-secondary, #6b7280);
      }

      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .info-item label {
        display: block;
        font-size: 11px;
        color: var(--text-secondary, #6b7280);
        margin-bottom: 4px;
      }

      .info-item span {
        font-weight: 500;
      }

      .stats-row {
        display: flex;
        gap: 16px;
      }

      .stat-item {
        flex: 1;
        text-align: center;
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
      }

      .stat-number {
        display: block;
        font-size: 22px;
        font-weight: 700;
        color: #06b6d4;
      }

      .stat-text {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }

      .booking-history {
        max-height: 200px;
        overflow-y: auto;
      }

      .booking-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .booking-icon { font-size: 20px; }
      .booking-info { flex: 1; }
      .booking-name { display: block; font-weight: 500; }
      .booking-date { font-size: 12px; color: var(--text-secondary, #6b7280); }
      .booking-amount { font-weight: 600; color: #059669; }

      .no-data, .no-notes {
        text-align: center;
        padding: 20px;
        color: var(--text-secondary, #6b7280);
      }

      /* Notes */
      .add-note-form {
        display: flex;
        gap: 10px;
        margin-bottom: 16px;
      }

      .add-note-form textarea {
        flex: 1;
        padding: 10px;
        border: 1px solid var(--border-light, #d1d5db);
        border-radius: 8px;
        resize: none;
        font-size: 13px;
      }

      .note-item {
        padding: 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 8px;
        margin-bottom: 10px;
      }

      .note-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .note-author { font-weight: 600; font-size: 13px; }
      .note-date { font-size: 11px; color: var(--text-secondary, #6b7280); flex: 1; }

      .delete-note {
        width: 20px;
        height: 20px;
        border: none;
        background: none;
        color: var(--text-secondary, #6b7280);
        cursor: pointer;
        font-size: 16px;
      }

      .note-text { font-size: 13px; }

      /* Form */
      .form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        background: var(--bg-alt, #f9fafb);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .form-header h3 { margin: 0; }

      .form-close {
        width: 32px;
        height: 32px;
        border: none;
        background: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--text-secondary, #6b7280);
      }

      .form-body {
        padding: 24px;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-group label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 6px;
      }

      .form-group input,
      .form-group textarea,
      .form-group select {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-light, #d1d5db);
        border-radius: 8px;
        font-size: 14px;
      }

      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }

      /* Responsive */
      @media (max-width: 768px) {
        .analytics-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .segments-container {
          grid-template-columns: 1fr;
        }
        .filter-buttons {
          flex-wrap: wrap;
        }
        .form-row {
          grid-template-columns: 1fr;
        }
        .info-grid {
          grid-template-columns: 1fr;
        }
        .stats-row {
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.customerDatabase = new CustomerDatabase();
