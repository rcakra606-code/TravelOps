/**
 * Invoice Generator
 * Generate professional invoices from tour/sale data
 */

class InvoiceGenerator {
  constructor() {
    this.companyInfo = {
      name: 'TravelOps Agency',
      address: '123 Travel Street, City, Country',
      phone: '+1 (555) 123-4567',
      email: 'info@travelops.com',
      website: 'www.travelops.com',
      taxId: 'TAX-123456789'
    };
    
    this.init();
  }

  init() {
    this.addStyles();
    this.addInvoiceButtons();
  }

  addInvoiceButtons() {
    // Wait for DOM to be ready
    setTimeout(() => {
      // Add to table rows
      this.setupRowActions();
      
      // Add header button
      const headerActions = document.querySelector('.header-actions, .header > div:last-child');
      if (headerActions && !document.getElementById('invoiceGeneratorBtn')) {
        const btn = document.createElement('button');
        btn.id = 'invoiceGeneratorBtn';
        btn.className = 'btn invoice-generator-btn';
        btn.innerHTML = '🧾 Invoices';
        btn.title = 'Generate invoices';
        btn.addEventListener('click', () => this.showInvoiceManager());
        headerActions.appendChild(btn);
      }
    }, 1500);
  }

  setupRowActions() {
    // Use event delegation
    document.addEventListener('click', (e) => {
      const invoiceBtn = e.target.closest('.invoice-row-btn');
      if (invoiceBtn) {
        const row = invoiceBtn.closest('tr');
        const id = row?.dataset?.id || invoiceBtn.dataset.id;
        if (id) {
          this.generateFromRow(id);
        }
      }
    });
  }

  async showInvoiceManager() {
    document.getElementById('invoiceManagerModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'invoiceManagerModal';
    modal.className = 'invoice-modal';
    modal.innerHTML = `
      <div class="invoice-modal-content">
        <div class="invoice-modal-header">
          <h3>🧾 Invoice Generator</h3>
          <button class="invoice-close-btn" id="closeInvoiceManager">&times;</button>
        </div>
        <div class="invoice-modal-body">
          <div class="invoice-tabs">
            <button class="invoice-tab active" data-tab="generate">Generate New</button>
            <button class="invoice-tab" data-tab="recent">Recent Invoices</button>
            <button class="invoice-tab" data-tab="settings">Settings</button>
          </div>

          <div class="invoice-tab-content" id="generateTab">
            <div class="invoice-form">
              <div class="form-section">
                <h4>Customer Information</h4>
                <div class="form-row">
                  <div class="form-group">
                    <label>Customer Name *</label>
                    <input type="text" id="invoiceCustomerName" placeholder="John Doe">
                  </div>
                  <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="invoiceCustomerEmail" placeholder="john@example.com">
                  </div>
                </div>
                <div class="form-group">
                  <label>Address</label>
                  <textarea id="invoiceCustomerAddress" rows="2" placeholder="Street, City, Country"></textarea>
                </div>
              </div>

              <div class="form-section">
                <h4>Invoice Items</h4>
                <div id="invoiceItems">
                  <div class="invoice-item">
                    <input type="text" class="item-desc" placeholder="Description">
                    <input type="number" class="item-qty" placeholder="Qty" value="1">
                    <input type="number" class="item-price" placeholder="Price">
                    <button class="remove-item-btn">&times;</button>
                  </div>
                </div>
                <button class="add-item-btn" id="addInvoiceItem">+ Add Item</button>
              </div>

              <div class="form-section">
                <div class="form-row">
                  <div class="form-group">
                    <label>Tax Rate (%)</label>
                    <input type="number" id="invoiceTaxRate" value="10">
                  </div>
                  <div class="form-group">
                    <label>Discount (%)</label>
                    <input type="number" id="invoiceDiscount" value="0">
                  </div>
                </div>
                <div class="form-group">
                  <label>Notes</label>
                  <textarea id="invoiceNotes" rows="2" placeholder="Thank you for your business!"></textarea>
                </div>
              </div>

              <div class="invoice-totals">
                <div class="total-row">
                  <span>Subtotal:</span>
                  <span id="invoiceSubtotal">$0.00</span>
                </div>
                <div class="total-row">
                  <span>Tax:</span>
                  <span id="invoiceTax">$0.00</span>
                </div>
                <div class="total-row">
                  <span>Discount:</span>
                  <span id="invoiceDiscountAmt">$0.00</span>
                </div>
                <div class="total-row grand-total">
                  <span>Total:</span>
                  <span id="invoiceTotal">$0.00</span>
                </div>
              </div>

              <button class="btn btn-primary generate-invoice-btn" id="generateInvoiceBtn">
                📄 Generate Invoice
              </button>
            </div>
          </div>

          <div class="invoice-tab-content" id="recentTab" style="display:none;">
            <div id="recentInvoicesList" class="recent-invoices-list">
              <div class="empty-state">
                <span>📋</span>
                <p>No recent invoices</p>
              </div>
            </div>
          </div>

          <div class="invoice-tab-content" id="settingsTab" style="display:none;">
            <div class="settings-form">
              <h4>Company Information</h4>
              <div class="form-group">
                <label>Company Name</label>
                <input type="text" id="companyName" value="${this.companyInfo.name}">
              </div>
              <div class="form-group">
                <label>Address</label>
                <textarea id="companyAddress" rows="2">${this.companyInfo.address}</textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Phone</label>
                  <input type="text" id="companyPhone" value="${this.companyInfo.phone}">
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input type="email" id="companyEmail" value="${this.companyInfo.email}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Website</label>
                  <input type="text" id="companyWebsite" value="${this.companyInfo.website}">
                </div>
                <div class="form-group">
                  <label>Tax ID</label>
                  <input type="text" id="companyTaxId" value="${this.companyInfo.taxId}">
                </div>
              </div>
              <button class="btn btn-primary" id="saveCompanyInfo">💾 Save Settings</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    this.bindModalEvents();
    this.loadRecentInvoices();
    this.loadCompanySettings();
    this.calculateTotals();
  }

  bindModalEvents() {
    document.getElementById('closeInvoiceManager')?.addEventListener('click', () => this.closeModal());
    
    document.getElementById('invoiceManagerModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'invoiceManagerModal') this.closeModal();
    });

    // Tab switching
    document.querySelectorAll('.invoice-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.invoice-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.invoice-tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const tabId = tab.dataset.tab + 'Tab';
        document.getElementById(tabId).style.display = 'block';
      });
    });

    // Add item
    document.getElementById('addInvoiceItem')?.addEventListener('click', () => {
      const container = document.getElementById('invoiceItems');
      const item = document.createElement('div');
      item.className = 'invoice-item';
      item.innerHTML = `
        <input type="text" class="item-desc" placeholder="Description">
        <input type="number" class="item-qty" placeholder="Qty" value="1">
        <input type="number" class="item-price" placeholder="Price">
        <button class="remove-item-btn">&times;</button>
      `;
      container.appendChild(item);
    });

    // Remove item
    document.getElementById('invoiceItems')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-item-btn')) {
        const items = document.querySelectorAll('.invoice-item');
        if (items.length > 1) {
          e.target.closest('.invoice-item').remove();
          this.calculateTotals();
        }
      }
    });

    // Calculate totals on input change
    document.getElementById('invoiceItems')?.addEventListener('input', () => this.calculateTotals());
    document.getElementById('invoiceTaxRate')?.addEventListener('input', () => this.calculateTotals());
    document.getElementById('invoiceDiscount')?.addEventListener('input', () => this.calculateTotals());

    // Generate invoice
    document.getElementById('generateInvoiceBtn')?.addEventListener('click', () => this.generateInvoice());

    // Save settings
    document.getElementById('saveCompanyInfo')?.addEventListener('click', () => this.saveCompanySettings());
  }

  calculateTotals() {
    const items = document.querySelectorAll('.invoice-item');
    let subtotal = 0;

    items.forEach(item => {
      const qty = parseFloat(item.querySelector('.item-qty')?.value) || 0;
      const price = parseFloat(item.querySelector('.item-price')?.value) || 0;
      subtotal += qty * price;
    });

    const taxRate = parseFloat(document.getElementById('invoiceTaxRate')?.value) || 0;
    const discountRate = parseFloat(document.getElementById('invoiceDiscount')?.value) || 0;

    const tax = subtotal * (taxRate / 100);
    const discount = subtotal * (discountRate / 100);
    const total = subtotal + tax - discount;

    document.getElementById('invoiceSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('invoiceTax').textContent = `$${tax.toFixed(2)}`;
    document.getElementById('invoiceDiscountAmt').textContent = `-$${discount.toFixed(2)}`;
    document.getElementById('invoiceTotal').textContent = `$${total.toFixed(2)}`;
  }

  async generateFromRow(id) {
    // Try to get data from different entities
    try {
      const path = window.location.pathname;
      let entity = 'tours';
      if (path.includes('sales')) entity = 'sales';
      if (path.includes('hotel')) entity = 'hotels';

      const data = await window.fetchJson?.(`/api/${entity}/${id}`);
      if (data) {
        this.showInvoiceManager();
        
        // Fill form
        setTimeout(() => {
          document.getElementById('invoiceCustomerName').value = 
            data.customer_name || data.guest_name || data.client || '';
          document.getElementById('invoiceCustomerEmail').value = data.email || '';
          
          const itemDesc = document.querySelector('.item-desc');
          const itemQty = document.querySelector('.item-qty');
          const itemPrice = document.querySelector('.item-price');
          
          if (itemDesc) itemDesc.value = data.tour_name || data.description || data.hotel_name || entity;
          if (itemQty) itemQty.value = data.quantity || data.pax || data.nights || 1;
          if (itemPrice) itemPrice.value = data.price || data.total || data.cost || 0;
          
          this.calculateTotals();
        }, 100);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      window.toast?.error('Failed to load record data');
    }
  }

  generateInvoice() {
    const customerName = document.getElementById('invoiceCustomerName')?.value;
    if (!customerName) {
      window.toast?.error('Customer name is required');
      return;
    }

    // Collect invoice data
    const items = [];
    document.querySelectorAll('.invoice-item').forEach(item => {
      const desc = item.querySelector('.item-desc')?.value;
      const qty = parseFloat(item.querySelector('.item-qty')?.value) || 0;
      const price = parseFloat(item.querySelector('.item-price')?.value) || 0;
      if (desc && qty && price) {
        items.push({ description: desc, quantity: qty, price: price });
      }
    });

    if (items.length === 0) {
      window.toast?.error('Add at least one item');
      return;
    }

    const invoiceData = {
      invoiceNumber: this.generateInvoiceNumber(),
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      customer: {
        name: customerName,
        email: document.getElementById('invoiceCustomerEmail')?.value || '',
        address: document.getElementById('invoiceCustomerAddress')?.value || ''
      },
      items: items,
      taxRate: parseFloat(document.getElementById('invoiceTaxRate')?.value) || 0,
      discount: parseFloat(document.getElementById('invoiceDiscount')?.value) || 0,
      notes: document.getElementById('invoiceNotes')?.value || '',
      subtotal: document.getElementById('invoiceSubtotal')?.textContent || '$0.00',
      tax: document.getElementById('invoiceTax')?.textContent || '$0.00',
      discountAmt: document.getElementById('invoiceDiscountAmt')?.textContent || '$0.00',
      total: document.getElementById('invoiceTotal')?.textContent || '$0.00'
    };

    // Save to history
    this.saveInvoice(invoiceData);

    // Generate printable invoice
    this.openPrintableInvoice(invoiceData);
  }

  generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  }

  openPrintableInvoice(data) {
    const html = this.generateInvoiceHTML(data);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  }

  generateInvoiceHTML(data) {
    const itemsHTML = data.items.map(item => `
      <tr>
        <td>${item.description}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: right;">$${item.price.toFixed(2)}</td>
        <td style="text-align: right;">$${(item.quantity * item.price).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${data.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', sans-serif; 
      padding: 40px; 
      max-width: 800px; 
      margin: 0 auto;
      color: #333;
    }
    .invoice-header { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #3b82f6;
    }
    .company-info h1 { 
      color: #3b82f6; 
      font-size: 28px;
      margin-bottom: 8px;
    }
    .company-info p { 
      color: #666; 
      font-size: 13px;
      line-height: 1.5;
    }
    .invoice-meta { 
      text-align: right; 
    }
    .invoice-number { 
      font-size: 24px; 
      font-weight: bold;
      color: #333;
    }
    .invoice-date { 
      color: #666;
      margin-top: 8px;
    }
    .addresses { 
      display: flex; 
      justify-content: space-between;
      margin-bottom: 40px;
    }
    .address-block h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
    }
    .address-block p {
      font-size: 14px;
      line-height: 1.6;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 30px;
    }
    th { 
      background: #f3f4f6; 
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      border-bottom: 2px solid #e5e7eb;
    }
    td { 
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }
    .totals { 
      width: 300px;
      margin-left: auto;
    }
    .totals table { margin-bottom: 0; }
    .totals td { 
      padding: 8px 0;
      border: none;
    }
    .totals tr:last-child td {
      padding-top: 12px;
      border-top: 2px solid #333;
      font-size: 18px;
      font-weight: bold;
    }
    .notes {
      margin-top: 40px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .notes h4 {
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 8px;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      <h1>${this.companyInfo.name}</h1>
      <p>${this.companyInfo.address}<br>
      ${this.companyInfo.phone}<br>
      ${this.companyInfo.email}</p>
    </div>
    <div class="invoice-meta">
      <div class="invoice-number">INVOICE</div>
      <div class="invoice-date">
        <strong>${data.invoiceNumber}</strong><br>
        Date: ${data.date}<br>
        Due: ${data.dueDate}
      </div>
    </div>
  </div>

  <div class="addresses">
    <div class="address-block">
      <h3>Bill To</h3>
      <p><strong>${data.customer.name}</strong><br>
      ${data.customer.email ? data.customer.email + '<br>' : ''}
      ${data.customer.address || ''}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align: center;">Qty</th>
        <th style="text-align: right;">Unit Price</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal:</td>
        <td style="text-align: right;">${data.subtotal}</td>
      </tr>
      <tr>
        <td>Tax (${data.taxRate}%):</td>
        <td style="text-align: right;">${data.tax}</td>
      </tr>
      ${data.discount > 0 ? `
      <tr>
        <td>Discount (${data.discount}%):</td>
        <td style="text-align: right;">${data.discountAmt}</td>
      </tr>
      ` : ''}
      <tr>
        <td>TOTAL:</td>
        <td style="text-align: right;">${data.total}</td>
      </tr>
    </table>
  </div>

  ${data.notes ? `
  <div class="notes">
    <h4>Notes</h4>
    <p>${data.notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>${this.companyInfo.website}</p>
  </div>

  <div class="no-print" style="margin-top: 40px; text-align: center;">
    <button onclick="window.print()" style="padding: 12px 32px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
      🖨️ Print Invoice
    </button>
  </div>
</body>
</html>
    `;
  }

  saveInvoice(data) {
    const invoices = JSON.parse(localStorage.getItem('travelops_invoices') || '[]');
    invoices.unshift(data);
    if (invoices.length > 50) invoices.pop();
    localStorage.setItem('travelops_invoices', JSON.stringify(invoices));
    this.loadRecentInvoices();
  }

  loadRecentInvoices() {
    const container = document.getElementById('recentInvoicesList');
    if (!container) return;

    const invoices = JSON.parse(localStorage.getItem('travelops_invoices') || '[]');
    
    if (invoices.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span>📋</span>
          <p>No recent invoices</p>
        </div>
      `;
      return;
    }

    container.innerHTML = invoices.map(inv => `
      <div class="recent-invoice-item" data-invoice='${JSON.stringify(inv)}'>
        <div class="invoice-info">
          <span class="invoice-num">${inv.invoiceNumber}</span>
          <span class="invoice-customer">${inv.customer.name}</span>
        </div>
        <div class="invoice-amount">
          <span class="invoice-total">${inv.total}</span>
          <span class="invoice-date">${inv.date}</span>
        </div>
        <button class="view-invoice-btn">View</button>
      </div>
    `).join('');

    container.querySelectorAll('.view-invoice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.recent-invoice-item');
        const data = JSON.parse(item.dataset.invoice);
        this.openPrintableInvoice(data);
      });
    });
  }

  saveCompanySettings() {
    this.companyInfo = {
      name: document.getElementById('companyName')?.value || this.companyInfo.name,
      address: document.getElementById('companyAddress')?.value || this.companyInfo.address,
      phone: document.getElementById('companyPhone')?.value || this.companyInfo.phone,
      email: document.getElementById('companyEmail')?.value || this.companyInfo.email,
      website: document.getElementById('companyWebsite')?.value || this.companyInfo.website,
      taxId: document.getElementById('companyTaxId')?.value || this.companyInfo.taxId
    };
    
    localStorage.setItem('travelops_company_info', JSON.stringify(this.companyInfo));
    window.toast?.success('Company settings saved');
  }

  loadCompanySettings() {
    const saved = localStorage.getItem('travelops_company_info');
    if (saved) {
      this.companyInfo = JSON.parse(saved);
    }
  }

  closeModal() {
    const modal = document.getElementById('invoiceManagerModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  addStyles() {
    if (document.getElementById('invoiceGeneratorStyles')) return;

    const style = document.createElement('style');
    style.id = 'invoiceGeneratorStyles';
    style.textContent = `
      .invoice-generator-btn {
        background: linear-gradient(135deg, #059669, #047857) !important;
        color: white !important;
      }

      .invoice-modal {
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

      .invoice-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .invoice-modal-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 95%;
        max-width: 700px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
      }

      .invoice-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        background: linear-gradient(135deg, #059669, #047857);
        color: white;
      }

      .invoice-modal-header h3 { margin: 0; }

      .invoice-close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }

      .invoice-modal-body {
        overflow-y: auto;
        flex: 1;
      }

      .invoice-tabs {
        display: flex;
        background: var(--bg-alt, #f9fafb);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .invoice-tab {
        flex: 1;
        padding: 14px;
        border: none;
        background: none;
        cursor: pointer;
        font-weight: 500;
        color: var(--text-secondary, #6b7280);
      }

      .invoice-tab.active {
        color: #059669;
        background: var(--card, #fff);
        border-bottom: 2px solid #059669;
      }

      .invoice-tab-content {
        padding: 24px;
      }

      .form-section {
        margin-bottom: 24px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .form-section:last-of-type {
        border-bottom: none;
      }

      .form-section h4 {
        margin: 0 0 16px 0;
        font-size: 14px;
        color: var(--text-secondary, #6b7280);
        text-transform: uppercase;
      }

      .invoice-form .form-group {
        margin-bottom: 12px;
      }

      .invoice-form label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 4px;
      }

      .invoice-form input,
      .invoice-form textarea,
      .invoice-form select {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-light, #d1d5db);
        border-radius: 8px;
        font-size: 14px;
        background: var(--input-bg, #fff);
        color: var(--text, #1f2937);
      }

      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .invoice-item {
        display: grid;
        grid-template-columns: 1fr 80px 100px 40px;
        gap: 8px;
        margin-bottom: 8px;
      }

      .remove-item-btn {
        background: #fee2e2;
        color: #dc2626;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
      }

      .add-item-btn {
        background: none;
        border: 1px dashed var(--border-light, #d1d5db);
        padding: 10px;
        width: 100%;
        border-radius: 8px;
        cursor: pointer;
        color: var(--text-secondary, #6b7280);
        margin-top: 8px;
      }

      .invoice-totals {
        background: var(--bg-alt, #f9fafb);
        padding: 16px;
        border-radius: 12px;
        margin: 20px 0;
      }

      .total-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 14px;
      }

      .total-row.grand-total {
        border-top: 2px solid var(--border-light, #e5e7eb);
        margin-top: 8px;
        padding-top: 12px;
        font-size: 18px;
        font-weight: 700;
        color: #059669;
      }

      .generate-invoice-btn {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #059669, #047857) !important;
      }

      /* Recent Invoices */
      .recent-invoice-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
        margin-bottom: 10px;
      }

      .invoice-info {
        display: flex;
        flex-direction: column;
      }

      .invoice-num {
        font-weight: 600;
        font-size: 13px;
      }

      .invoice-customer {
        font-size: 14px;
        color: var(--text-secondary, #6b7280);
      }

      .invoice-amount {
        text-align: right;
      }

      .invoice-total {
        display: block;
        font-weight: 700;
        color: #059669;
      }

      .invoice-date {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }

      .view-invoice-btn {
        padding: 6px 14px;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #d1d5db);
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
      }

      .empty-state {
        text-align: center;
        padding: 40px;
        color: var(--text-secondary, #6b7280);
      }

      .empty-state span {
        font-size: 48px;
      }

      /* Settings */
      .settings-form h4 {
        margin: 0 0 16px 0;
      }

      /* Dark mode */
      [data-theme="dark"] .invoice-modal-content {
        background: var(--card, #1e293b);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.invoiceGenerator = new InvoiceGenerator();
