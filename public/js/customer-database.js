/**
 * Customer Database Manager
 * Track repeat customers and their history
 */

class CustomerDatabase {
  constructor() {
    this.storageKey = 'travelops_customers';
    this.init();
  }

  init() {
    this.addStyles();
    this.addCustomerButton();
  }

  // Get customers from localStorage (fallback) or would use API
  getCustomers() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch {
      return [];
    }
  }

  saveCustomer(customer) {
    const customers = this.getCustomers();
    const existing = customers.findIndex(c => 
      c.email === customer.email || c.phone === customer.phone
    );
    
    if (existing >= 0) {
      // Update existing
      customers[existing] = {
        ...customers[existing],
        ...customer,
        updatedAt: new Date().toISOString(),
        tourCount: (customers[existing].tourCount || 0) + (customer.incrementTour ? 1 : 0)
      };
    } else {
      // Add new
      customers.push({
        id: Date.now(),
        ...customer,
        createdAt: new Date().toISOString(),
        tourCount: 1,
        totalSpent: 0
      });
    }
    
    localStorage.setItem(this.storageKey, JSON.stringify(customers));
    return customers;
  }

  deleteCustomer(id) {
    const customers = this.getCustomers().filter(c => c.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(customers));
    return customers;
  }

  searchCustomers(query) {
    const customers = this.getCustomers();
    if (!query) return customers;
    
    const q = query.toLowerCase();
    return customers.filter(c => 
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  }

  // Auto-extract customers from tours data
  async syncFromTours() {
    try {
      const tours = window.toursData || await window.fetchJson?.('/api/tours') || [];
      const customerMap = new Map();

      tours.forEach(tour => {
        const key = tour.email || tour.phone_number || tour.lead_passenger;
        if (!key) return;

        if (!customerMap.has(key)) {
          customerMap.set(key, {
            name: tour.lead_passenger,
            email: tour.email || '',
            phone: tour.phone_number || '',
            tours: [],
            totalSpent: 0
          });
        }

        const customer = customerMap.get(key);
        customer.tours.push({
          id: tour.id,
          code: tour.tour_code,
          date: tour.departure_date,
          amount: parseFloat(tour.sales_amount) || 0
        });
        customer.totalSpent += parseFloat(tour.sales_amount) || 0;
      });

      // Convert to array and save
      const customers = Array.from(customerMap.values()).map((c, i) => ({
        id: Date.now() + i,
        ...c,
        tourCount: c.tours.length,
        createdAt: new Date().toISOString()
      }));

      localStorage.setItem(this.storageKey, JSON.stringify(customers));
      return customers;
    } catch (err) {
      console.error('Failed to sync customers from tours:', err);
      return [];
    }
  }

  addCustomerButton() {
    setTimeout(() => {
      // Add to admin settings or reports page
      const path = window.location.pathname;
      if (!path.includes('admin') && !path.includes('reports') && !path.includes('single-dashboard')) return;

      const nav = document.querySelector('.nav');
      if (!nav) return;

      // Check if already exists
      if (document.getElementById('customerDbLink')) return;

      // Add link in sidebar
      const link = document.createElement('a');
      link.id = 'customerDbLink';
      link.href = '#';
      link.innerHTML = '👥 Customer DB';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.showCustomerModal();
      });

      // Insert before Reports
      const reportsLink = nav.querySelector('a[href*="reports"]');
      if (reportsLink) {
        nav.insertBefore(link, reportsLink);
      }
    }, 500);
  }

  async showCustomerModal() {
    // Sync from tours first
    await this.syncFromTours();
    const customers = this.getCustomers();

    const modal = document.createElement('div');
    modal.id = 'customerDbModal';
    modal.className = 'customer-db-modal';
    modal.innerHTML = `
      <div class="customer-db-content">
        <div class="customer-db-header">
          <h2>👥 Customer Database</h2>
          <div class="customer-db-actions">
            <input type="text" id="customerSearch" placeholder="🔍 Search customers..." class="customer-search">
            <button class="btn btn-primary" id="addCustomerBtn">+ Add Customer</button>
            <button class="customer-db-close" id="closeCustomerDb">&times;</button>
          </div>
        </div>
        <div class="customer-db-stats">
          <div class="stat-card">
            <div class="stat-value">${customers.length}</div>
            <div class="stat-label">Total Customers</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${customers.filter(c => c.tourCount > 1).length}</div>
            <div class="stat-label">Repeat Customers</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">Rp ${Math.round(customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0)).toLocaleString('id-ID')}</div>
            <div class="stat-label">Total Revenue</div>
          </div>
        </div>
        <div class="customer-db-body">
          <table class="customer-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Tours</th>
                <th>Total Spent</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="customerTableBody">
              ${this.renderCustomerRows(customers)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    // Bind events
    document.getElementById('closeCustomerDb')?.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    });

    document.getElementById('customerSearch')?.addEventListener('input', (e) => {
      const filtered = this.searchCustomers(e.target.value);
      document.getElementById('customerTableBody').innerHTML = this.renderCustomerRows(filtered);
    });

    document.getElementById('addCustomerBtn')?.addEventListener('click', () => {
      this.showAddCustomerForm();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
      }

      // View customer details
      if (e.target.closest('.view-customer')) {
        const id = parseInt(e.target.closest('.view-customer').dataset.id);
        this.showCustomerDetails(id);
      }

      // Delete customer
      if (e.target.closest('.delete-customer')) {
        const id = parseInt(e.target.closest('.delete-customer').dataset.id);
        if (confirm('Delete this customer?')) {
          this.deleteCustomer(id);
          const filtered = this.searchCustomers(document.getElementById('customerSearch')?.value || '');
          document.getElementById('customerTableBody').innerHTML = this.renderCustomerRows(filtered);
          window.toast?.success('Customer deleted');
        }
      }
    });
  }

  renderCustomerRows(customers) {
    if (customers.length === 0) {
      return '<tr><td colspan="6" class="text-center">No customers found</td></tr>';
    }

    return customers.map(c => `
      <tr>
        <td><strong>${c.name || '—'}</strong></td>
        <td>${c.email || '—'}</td>
        <td>${c.phone || '—'}</td>
        <td>
          <span class="tour-badge ${c.tourCount > 1 ? 'repeat' : ''}">${c.tourCount || 0} tours</span>
        </td>
        <td>Rp ${Math.round(c.totalSpent || 0).toLocaleString('id-ID')}</td>
        <td>
          <button class="btn-icon view-customer" data-id="${c.id}" title="View Details">👁️</button>
          <button class="btn-icon delete-customer" data-id="${c.id}" title="Delete">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  showCustomerDetails(id) {
    const customer = this.getCustomers().find(c => c.id === id);
    if (!customer) return;

    if (window.quickView) {
      window.quickView.show({
        title: `Customer: ${customer.name}`,
        sections: [
          {
            title: 'Contact Info',
            fields: [
              { label: 'Name', value: customer.name },
              { label: 'Email', value: customer.email || '-' },
              { label: 'Phone', value: customer.phone || '-' },
              { label: 'Customer Since', value: new Date(customer.createdAt).toLocaleDateString('id-ID') }
            ]
          },
          {
            title: 'Statistics',
            fields: [
              { label: 'Total Tours', value: customer.tourCount || 0 },
              { label: 'Total Spent', value: `Rp ${Math.round(customer.totalSpent || 0).toLocaleString('id-ID')}` },
              { label: 'Avg per Tour', value: `Rp ${Math.round((customer.totalSpent || 0) / (customer.tourCount || 1)).toLocaleString('id-ID')}` }
            ]
          },
          {
            title: 'Tour History',
            fields: (customer.tours || []).slice(0, 5).map(t => ({
              label: t.code || 'Tour',
              value: `${t.date} - Rp ${Math.round(t.amount).toLocaleString('id-ID')}`
            }))
          }
        ]
      });
    }
  }

  showAddCustomerForm() {
    const name = prompt('Customer Name:');
    if (!name) return;
    
    const email = prompt('Email (optional):');
    const phone = prompt('Phone (optional):');

    this.saveCustomer({ name, email, phone });
    
    // Refresh table
    const filtered = this.searchCustomers(document.getElementById('customerSearch')?.value || '');
    document.getElementById('customerTableBody').innerHTML = this.renderCustomerRows(filtered);
    window.toast?.success('Customer added');
  }

  addStyles() {
    if (document.getElementById('customerDbStyles')) return;

    const style = document.createElement('style');
    style.id = 'customerDbStyles';
    style.textContent = `
      #customerDbLink {
        background: linear-gradient(135deg, #10b981, #059669) !important;
        color: white !important;
        border-radius: 8px;
        margin: 4px 8px;
      }

      .customer-db-modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s;
        backdrop-filter: blur(4px);
      }

      .customer-db-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .customer-db-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 95%;
        max-width: 1100px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
      }

      .customer-db-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        flex-wrap: wrap;
        gap: 16px;
      }

      .customer-db-header h2 {
        margin: 0;
        font-size: 20px;
      }

      .customer-db-actions {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .customer-search {
        padding: 10px 16px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        min-width: 250px;
        background: rgba(255,255,255,0.2);
        color: white;
      }

      .customer-search::placeholder {
        color: rgba(255,255,255,0.7);
      }

      .customer-db-close {
        width: 36px;
        height: 36px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }

      .customer-db-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        padding: 20px 24px;
        background: var(--bg-alt, #f9fafb);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .stat-card {
        background: var(--card, #fff);
        padding: 16px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }

      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #10b981;
      }

      .stat-label {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
        margin-top: 4px;
      }

      .customer-db-body {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
      }

      .customer-table {
        width: 100%;
        border-collapse: collapse;
      }

      .customer-table th {
        text-align: left;
        padding: 12px;
        font-size: 12px;
        text-transform: uppercase;
        color: var(--text-secondary, #6b7280);
        border-bottom: 2px solid var(--border-light, #e5e7eb);
      }

      .customer-table td {
        padding: 12px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .tour-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        background: var(--bg-alt, #f3f4f6);
        color: var(--text-secondary, #6b7280);
      }

      .tour-badge.repeat {
        background: #d1fae5;
        color: #065f46;
      }

      .btn-icon {
        background: none;
        border: none;
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .btn-icon:hover {
        background: var(--bg-alt, #f3f4f6);
      }

      /* Dark mode */
      [data-theme="dark"] .customer-db-content {
        background: var(--card, #1e293b);
      }

      [data-theme="dark"] .customer-db-stats {
        background: var(--bg-alt, #0f172a);
      }

      [data-theme="dark"] .stat-card {
        background: var(--card, #1e293b);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.customerDatabase = new CustomerDatabase();
