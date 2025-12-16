/**
 * Tracking Dashboard JavaScript
 * Handles delivering and receiving records with courier tracking integration
 */

class TrackingDashboard {
  constructor() {
    this.deliveries = [];
    this.receivings = [];
    this.currentEditId = null;
    this.currentEditType = null;
    this.selectedCourier = '';
    this.currentTrackingNo = '';
    
    // Courier tracking URLs (for reference/external check)
    this.courierUrls = {
      jne: 'https://www.jne.co.id/id/tracking/trace',
      jnt: 'https://www.jet.co.id/track',
      sicepat: 'https://www.sicepat.com/checkAwb',
      anteraja: 'https://anteraja.id/tracking',
      pos: 'https://www.posindonesia.co.id/id/tracking',
      tiki: 'https://www.tiki.id/id/tracking',
      other: null
    };
    
    this.init();
  }

  async init() {
    // Set default dates to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('deliverySendDate').value = today;
    document.getElementById('receiveDate').value = today;
    
    this.bindEvents();
    await this.loadData();
    this.updateStats();
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.tracking-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Courier selection
    document.querySelectorAll('.courier-option').forEach(option => {
      option.addEventListener('click', () => this.selectCourier(option.dataset.courier));
    });

    // Forms
    document.getElementById('deliveryForm').addEventListener('submit', (e) => this.handleDeliverySubmit(e));
    document.getElementById('receivingForm').addEventListener('submit', (e) => this.handleReceivingSubmit(e));
    document.getElementById('editForm').addEventListener('submit', (e) => this.handleEditSubmit(e));

    // Check tracking button
    document.getElementById('checkTrackingBtn').addEventListener('click', () => this.checkTracking());

    // Invoice/Booking code sync indicator
    document.getElementById('deliveryInvoice').addEventListener('input', (e) => this.handleSyncInput(e));
    document.getElementById('deliveryBookingCode').addEventListener('input', (e) => this.handleSyncInput(e));

    // Search
    document.getElementById('deliverySearch').addEventListener('input', (e) => this.filterDeliveries(e.target.value));
    document.getElementById('receivingSearch').addEventListener('input', (e) => this.filterReceivings(e.target.value));

    // Export buttons
    document.getElementById('exportDeliveries').addEventListener('click', () => this.exportData('deliveries'));
    document.getElementById('exportReceivings').addEventListener('click', () => this.exportData('receivings'));

    // Modal close
    document.getElementById('closeEditModal').addEventListener('click', () => this.closeEditModal());
    document.getElementById('cancelEdit').addEventListener('click', () => this.closeEditModal());
    document.getElementById('closeTrackingModal').addEventListener('click', () => this.closeTrackingModal());
    document.getElementById('closeTrackingModalBtn').addEventListener('click', () => this.closeTrackingModal());
    document.getElementById('refreshTrackingBtn').addEventListener('click', () => this.refreshCurrentTracking());

    // Click outside modal
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') this.closeEditModal();
    });
    document.getElementById('trackingModal').addEventListener('click', (e) => {
      if (e.target.id === 'trackingModal') this.closeTrackingModal();
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tracking-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.getElementById('deliveringTab').classList.toggle('active', tabName === 'delivering');
    document.getElementById('receivingTab').classList.toggle('active', tabName === 'receiving');
  }

  selectCourier(courier) {
    this.selectedCourier = courier;
    document.getElementById('deliveryCourier').value = courier;
    
    document.querySelectorAll('.courier-option').forEach(option => {
      option.classList.toggle('selected', option.dataset.courier === courier);
    });
  }

  async loadData() {
    const token = localStorage.getItem('token');
    
    try {
      // Load deliveries
      const deliveriesRes = await fetch('/api/tracking/deliveries', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (deliveriesRes.ok) {
        this.deliveries = await deliveriesRes.json();
      }

      // Load receivings
      const receivingsRes = await fetch('/api/tracking/receivings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (receivingsRes.ok) {
        this.receivings = await receivingsRes.json();
      }

      this.renderDeliveries();
      this.renderReceivings();
      this.updateStats();
    } catch (error) {
      console.error('Error loading tracking data:', error);
      window.showToast?.('Gagal memuat data tracking', 'error');
    }
  }

  updateStats() {
    const inTransit = this.deliveries.filter(d => d.status !== 'delivered').length;
    const delivered = this.deliveries.filter(d => d.status === 'delivered').length;
    const received = this.receivings.length;

    document.getElementById('statDelivering').textContent = inTransit;
    document.getElementById('statDelivered').textContent = delivered;
    document.getElementById('statReceived').textContent = received;
    document.getElementById('deliveringCount').textContent = this.deliveries.length;
    document.getElementById('receivingCount').textContent = this.receivings.length;
  }

  renderDeliveries(data = null) {
    const deliveries = data || this.deliveries;
    const tbody = document.getElementById('deliveryTableBody');

    if (deliveries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="icon">📦</div>
              <p>Belum ada data pengiriman</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = deliveries.map(d => `
      <tr data-id="${d.id}">
        <td>${this.formatDate(d.send_date)}</td>
        <td>
          <strong>${d.tracking_no || '-'}</strong>
          ${d.tracking_no ? `<button class="action-btn view" onclick="trackingDashboard.showTrackingDetail('${d.tracking_no}', '${d.courier}')" title="Lihat Tracking">🔍</button>` : ''}
        </td>
        <td>${this.formatCourier(d.courier)}</td>
        <td>${d.recipient || '-'}</td>
        <td>${d.passport_count || '-'}</td>
        <td>${d.invoice_no || '-'}</td>
        <td>${this.getStatusBadge(d.status)}</td>
        <td>
          <button class="action-btn edit" onclick="trackingDashboard.editDelivery(${d.id})">✏️</button>
          <button class="action-btn delete" onclick="trackingDashboard.deleteDelivery(${d.id})">🗑️</button>
          ${d.status !== 'delivered' ? `<button class="action-btn view" onclick="trackingDashboard.markDelivered(${d.id})" title="Tandai Terkirim">✅</button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  renderReceivings(data = null) {
    const receivings = data || this.receivings;
    const tbody = document.getElementById('receivingTableBody');

    if (receivings.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <div class="icon">📥</div>
              <p>Belum ada data penerimaan</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = receivings.map(r => `
      <tr data-id="${r.id}">
        <td>${this.formatDate(r.receive_date)}</td>
        <td>${r.tracking_no || '-'}</td>
        <td>${r.sender || '-'}</td>
        <td>${r.passport_count || '-'}</td>
        <td title="${r.details || ''}">${this.truncateText(r.details, 50)}</td>
        <td>
          <button class="action-btn edit" onclick="trackingDashboard.editReceiving(${r.id})">✏️</button>
          <button class="action-btn delete" onclick="trackingDashboard.deleteReceiving(${r.id})">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatCourier(courier) {
    const courierNames = {
      jne: '🚚 JNE',
      jnt: '🚛 J&T',
      sicepat: '⚡ SiCepat',
      anteraja: '📦 AnterAja',
      pos: '📮 POS',
      tiki: '🚀 TIKI',
      other: '📋 Lainnya'
    };
    return courierNames[courier] || courier || '-';
  }

  getStatusBadge(status) {
    const statuses = {
      pending: '<span class="tracking-badge pending">Pending</span>',
      'in-transit': '<span class="tracking-badge in-transit">Dalam Perjalanan</span>',
      delivered: '<span class="tracking-badge delivered">Terkirim</span>'
    };
    return statuses[status] || statuses.pending;
  }

  truncateText(text, maxLength) {
    if (!text) return '-';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  handleSyncInput(e) {
    const invoice = document.getElementById('deliveryInvoice').value.trim();
    const bookingCode = document.getElementById('deliveryBookingCode').value.trim();
    
    // Show sync indicator if either field has value
    if (invoice || bookingCode) {
      // Visual indicator that data will be synced
      e.target.style.borderColor = '#22c55e';
    } else {
      e.target.style.borderColor = '';
    }
  }

  async handleDeliverySubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('token');

    const data = {
      send_date: document.getElementById('deliverySendDate').value,
      passport_count: document.getElementById('deliveryPassportCount').value || null,
      invoice_no: document.getElementById('deliveryInvoice').value.trim() || null,
      booking_code: document.getElementById('deliveryBookingCode').value.trim() || null,
      courier: this.selectedCourier || null,
      tracking_no: document.getElementById('deliveryTrackingNo').value.trim(),
      recipient: document.getElementById('deliveryRecipient').value.trim() || null,
      address: document.getElementById('deliveryAddress').value.trim() || null,
      details: document.getElementById('deliveryDetails').value.trim() || null,
      status: 'pending'
    };

    try {
      const res = await fetch('/api/tracking/deliveries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const result = await res.json();
        window.showToast?.('Pengiriman berhasil disimpan!', 'success');
        
        // Log audit
        window.logAudit?.('create', 'tracking_deliveries', result.id, data);
        
        // Reset form
        e.target.reset();
        document.getElementById('deliverySendDate').value = new Date().toISOString().split('T')[0];
        this.selectedCourier = '';
        document.querySelectorAll('.courier-option').forEach(o => o.classList.remove('selected'));
        
        // Reload data
        await this.loadData();
      } else {
        const error = await res.json();
        window.showToast?.(error.message || 'Gagal menyimpan pengiriman', 'error');
      }
    } catch (error) {
      console.error('Error saving delivery:', error);
      window.showToast?.('Terjadi kesalahan saat menyimpan', 'error');
    }
  }

  async handleReceivingSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('token');

    const data = {
      receive_date: document.getElementById('receiveDate').value,
      passport_count: document.getElementById('receivePassportCount').value || null,
      sender: document.getElementById('receiveSender').value.trim() || null,
      tracking_no: document.getElementById('receiveTrackingNo').value.trim() || null,
      details: document.getElementById('receiveDetails').value.trim() || null
    };

    try {
      const res = await fetch('/api/tracking/receivings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const result = await res.json();
        window.showToast?.('Penerimaan berhasil disimpan!', 'success');
        
        // Log audit
        window.logAudit?.('create', 'tracking_receivings', result.id, data);
        
        // Reset form
        e.target.reset();
        document.getElementById('receiveDate').value = new Date().toISOString().split('T')[0];
        
        // Reload data
        await this.loadData();
      } else {
        const error = await res.json();
        window.showToast?.(error.message || 'Gagal menyimpan penerimaan', 'error');
      }
    } catch (error) {
      console.error('Error saving receiving:', error);
      window.showToast?.('Terjadi kesalahan saat menyimpan', 'error');
    }
  }

  async checkTracking() {
    const trackingNo = document.getElementById('deliveryTrackingNo').value.trim();
    const courier = this.selectedCourier;

    if (!trackingNo) {
      window.showToast?.('Masukkan nomor resi terlebih dahulu', 'warning');
      return;
    }

    const resultDiv = document.getElementById('trackingResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="tracking-status-card"><p>🔄 Mengecek status...</p></div>';

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/tracking/check/${courier || 'auto'}/${trackingNo}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        this.renderTrackingResult(data, resultDiv);
      } else {
        // Fallback: show link to courier website
        this.renderTrackingFallback(trackingNo, courier, resultDiv);
      }
    } catch (error) {
      this.renderTrackingFallback(trackingNo, courier, resultDiv);
    }
  }

  renderTrackingResult(data, container) {
    container.innerHTML = `
      <div class="tracking-status-card">
        <div class="tracking-status-header">
          <div class="tracking-courier">
            <span>${this.formatCourier(data.courier)}</span>
          </div>
          ${this.getStatusBadge(data.status)}
        </div>
        ${data.timeline && data.timeline.length > 0 ? `
          <div class="tracking-timeline">
            ${data.timeline.slice(0, 5).map((event, idx) => `
              <div class="tracking-event ${idx === 0 ? 'current' : ''}">
                <div class="tracking-event-time">${event.date} ${event.time || ''}</div>
                <div class="tracking-event-desc">${event.description}</div>
              </div>
            `).join('')}
          </div>
        ` : '<p>Tidak ada detail tracking tersedia</p>'}
      </div>
    `;
  }

  renderTrackingFallback(trackingNo, courier, container) {
    const url = this.courierUrls[courier];
    container.innerHTML = `
      <div class="tracking-status-card">
        <p>⚠️ Tidak dapat mengambil data tracking otomatis.</p>
        ${url ? `
          <p>Cek manual di website kurir:</p>
          <a href="${url}" target="_blank" class="btn btn-secondary" style="display: inline-block; margin-top: 8px;">
            🔗 Buka Website ${this.formatCourier(courier).replace(/[^\w\s]/g, '').trim()}
          </a>
        ` : `
          <p>Pilih kurir untuk mendapatkan link tracking.</p>
        `}
      </div>
    `;
  }

  async showTrackingDetail(trackingNo, courier) {
    this.currentTrackingNo = trackingNo;
    const modal = document.getElementById('trackingModal');
    const body = document.getElementById('trackingModalBody');
    
    body.innerHTML = '<div style="text-align: center; padding: 40px;"><p>🔄 Memuat data tracking...</p></div>';
    modal.style.display = 'flex';

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/tracking/check/${courier || 'auto'}/${trackingNo}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        body.innerHTML = this.getTrackingDetailHTML(data);
      } else {
        body.innerHTML = this.getTrackingFallbackHTML(trackingNo, courier);
      }
    } catch (error) {
      body.innerHTML = this.getTrackingFallbackHTML(trackingNo, courier);
    }
  }

  getTrackingDetailHTML(data) {
    return `
      <div class="tracking-status-header" style="margin-bottom: 20px;">
        <div class="tracking-courier">
          <span style="font-size: 18px;">${this.formatCourier(data.courier)}</span>
        </div>
        ${this.getStatusBadge(data.status)}
      </div>
      <p><strong>No. Resi:</strong> ${data.tracking_no}</p>
      ${data.origin ? `<p><strong>Asal:</strong> ${data.origin}</p>` : ''}
      ${data.destination ? `<p><strong>Tujuan:</strong> ${data.destination}</p>` : ''}
      ${data.timeline && data.timeline.length > 0 ? `
        <h4 style="margin: 20px 0 12px;">📍 Riwayat Perjalanan</h4>
        <div class="tracking-timeline">
          ${data.timeline.map((event, idx) => `
            <div class="tracking-event ${idx === 0 ? 'current' : ''}">
              <div class="tracking-event-time">${event.date} ${event.time || ''}</div>
              <div class="tracking-event-desc">${event.description}</div>
              ${event.location ? `<div class="tracking-event-time">${event.location}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<p style="color: var(--text-secondary);">Tidak ada detail tracking tersedia</p>'}
    `;
  }

  getTrackingFallbackHTML(trackingNo, courier) {
    const url = this.courierUrls[courier];
    return `
      <div style="text-align: center; padding: 20px;">
        <p style="font-size: 48px; margin-bottom: 16px;">📦</p>
        <p><strong>No. Resi:</strong> ${trackingNo}</p>
        <p style="color: var(--text-secondary); margin: 16px 0;">Data tracking tidak dapat dimuat otomatis.</p>
        ${url ? `
          <a href="${url}" target="_blank" class="btn btn-primary" style="display: inline-block;">
            🔗 Cek di Website Kurir
          </a>
        ` : ''}
      </div>
    `;
  }

  refreshCurrentTracking() {
    if (this.currentTrackingNo) {
      const delivery = this.deliveries.find(d => d.tracking_no === this.currentTrackingNo);
      this.showTrackingDetail(this.currentTrackingNo, delivery?.courier);
    }
  }

  closeTrackingModal() {
    document.getElementById('trackingModal').style.display = 'none';
    this.currentTrackingNo = '';
  }

  async editDelivery(id) {
    const delivery = this.deliveries.find(d => d.id === id);
    if (!delivery) return;

    this.currentEditId = id;
    this.currentEditType = 'delivery';

    document.getElementById('editModalTitle').textContent = '✏️ Edit Pengiriman';
    document.getElementById('editModalBody').innerHTML = `
      <div class="form-grid">
        <div class="form-field">
          <label for="editSendDate">Tanggal Kirim</label>
          <input type="date" id="editSendDate" value="${delivery.send_date || ''}" required>
        </div>
        <div class="form-field">
          <label for="editPassportCount">Jumlah Passport</label>
          <input type="number" id="editPassportCount" value="${delivery.passport_count || ''}">
        </div>
        <div class="form-field">
          <label for="editInvoice">Invoice Number</label>
          <input type="text" id="editInvoice" value="${delivery.invoice_no || ''}">
        </div>
        <div class="form-field">
          <label for="editBookingCode">Booking Code</label>
          <input type="text" id="editBookingCode" value="${delivery.booking_code || ''}">
        </div>
        <div class="form-field">
          <label for="editCourier">Kurir</label>
          <select id="editCourier">
            <option value="">-- Pilih --</option>
            <option value="jne" ${delivery.courier === 'jne' ? 'selected' : ''}>JNE</option>
            <option value="jnt" ${delivery.courier === 'jnt' ? 'selected' : ''}>J&T</option>
            <option value="sicepat" ${delivery.courier === 'sicepat' ? 'selected' : ''}>SiCepat</option>
            <option value="anteraja" ${delivery.courier === 'anteraja' ? 'selected' : ''}>AnterAja</option>
            <option value="pos" ${delivery.courier === 'pos' ? 'selected' : ''}>POS</option>
            <option value="other" ${delivery.courier === 'other' ? 'selected' : ''}>Lainnya</option>
          </select>
        </div>
        <div class="form-field">
          <label for="editTrackingNo">Nomor Resi</label>
          <input type="text" id="editTrackingNo" value="${delivery.tracking_no || ''}" required>
        </div>
        <div class="form-field">
          <label for="editRecipient">Nama Penerima</label>
          <input type="text" id="editRecipient" value="${delivery.recipient || ''}">
        </div>
        <div class="form-field">
          <label for="editAddress">Alamat Tujuan</label>
          <input type="text" id="editAddress" value="${delivery.address || ''}">
        </div>
        <div class="form-field">
          <label for="editStatus">Status</label>
          <select id="editStatus">
            <option value="pending" ${delivery.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in-transit" ${delivery.status === 'in-transit' ? 'selected' : ''}>Dalam Perjalanan</option>
            <option value="delivered" ${delivery.status === 'delivered' ? 'selected' : ''}>Terkirim</option>
          </select>
        </div>
        <div class="form-field full-width">
          <label for="editDetails">Detail Pengiriman</label>
          <textarea id="editDetails">${delivery.details || ''}</textarea>
        </div>
      </div>
    `;

    document.getElementById('editModal').style.display = 'flex';
  }

  async editReceiving(id) {
    const receiving = this.receivings.find(r => r.id === id);
    if (!receiving) return;

    this.currentEditId = id;
    this.currentEditType = 'receiving';

    document.getElementById('editModalTitle').textContent = '✏️ Edit Penerimaan';
    document.getElementById('editModalBody').innerHTML = `
      <div class="form-grid">
        <div class="form-field">
          <label for="editReceiveDate">Tanggal Terima</label>
          <input type="date" id="editReceiveDate" value="${receiving.receive_date || ''}" required>
        </div>
        <div class="form-field">
          <label for="editPassportCount">Jumlah Passport</label>
          <input type="number" id="editPassportCount" value="${receiving.passport_count || ''}">
        </div>
        <div class="form-field">
          <label for="editSender">Pengirim</label>
          <input type="text" id="editSender" value="${receiving.sender || ''}">
        </div>
        <div class="form-field">
          <label for="editTrackingNo">Nomor Resi</label>
          <input type="text" id="editTrackingNo" value="${receiving.tracking_no || ''}">
        </div>
        <div class="form-field full-width">
          <label for="editDetails">Detail Penerimaan</label>
          <textarea id="editDetails">${receiving.details || ''}</textarea>
        </div>
      </div>
    `;

    document.getElementById('editModal').style.display = 'flex';
  }

  async handleEditSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('token');

    let data = {};
    let endpoint = '';

    if (this.currentEditType === 'delivery') {
      data = {
        send_date: document.getElementById('editSendDate').value,
        passport_count: document.getElementById('editPassportCount').value || null,
        invoice_no: document.getElementById('editInvoice').value.trim() || null,
        booking_code: document.getElementById('editBookingCode').value.trim() || null,
        courier: document.getElementById('editCourier').value || null,
        tracking_no: document.getElementById('editTrackingNo').value.trim(),
        recipient: document.getElementById('editRecipient').value.trim() || null,
        address: document.getElementById('editAddress').value.trim() || null,
        status: document.getElementById('editStatus').value,
        details: document.getElementById('editDetails').value.trim() || null
      };
      endpoint = `/api/tracking/deliveries/${this.currentEditId}`;
    } else {
      data = {
        receive_date: document.getElementById('editReceiveDate').value,
        passport_count: document.getElementById('editPassportCount').value || null,
        sender: document.getElementById('editSender').value.trim() || null,
        tracking_no: document.getElementById('editTrackingNo').value.trim() || null,
        details: document.getElementById('editDetails').value.trim() || null
      };
      endpoint = `/api/tracking/receivings/${this.currentEditId}`;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        window.showToast?.('Data berhasil diperbarui!', 'success');
        window.logAudit?.('update', this.currentEditType === 'delivery' ? 'tracking_deliveries' : 'tracking_receivings', this.currentEditId, data);
        this.closeEditModal();
        await this.loadData();
      } else {
        const error = await res.json();
        window.showToast?.(error.message || 'Gagal memperbarui data', 'error');
      }
    } catch (error) {
      console.error('Error updating:', error);
      window.showToast?.('Terjadi kesalahan', 'error');
    }
  }

  closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    this.currentEditId = null;
    this.currentEditType = null;
  }

  async markDelivered(id) {
    if (!confirm('Tandai pengiriman ini sebagai terkirim?')) return;

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/tracking/deliveries/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'delivered' })
      });

      if (res.ok) {
        window.showToast?.('Status berhasil diperbarui!', 'success');
        window.logAudit?.('update', 'tracking_deliveries', id, { status: 'delivered' });
        await this.loadData();
      }
    } catch (error) {
      console.error('Error marking delivered:', error);
      window.showToast?.('Gagal memperbarui status', 'error');
    }
  }

  async deleteDelivery(id) {
    if (!confirm('Yakin ingin menghapus data pengiriman ini?')) return;

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/tracking/deliveries/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        window.showToast?.('Data berhasil dihapus!', 'success');
        window.logAudit?.('delete', 'tracking_deliveries', id, {});
        await this.loadData();
      }
    } catch (error) {
      console.error('Error deleting:', error);
      window.showToast?.('Gagal menghapus data', 'error');
    }
  }

  async deleteReceiving(id) {
    if (!confirm('Yakin ingin menghapus data penerimaan ini?')) return;

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/tracking/receivings/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        window.showToast?.('Data berhasil dihapus!', 'success');
        window.logAudit?.('delete', 'tracking_receivings', id, {});
        await this.loadData();
      }
    } catch (error) {
      console.error('Error deleting:', error);
      window.showToast?.('Gagal menghapus data', 'error');
    }
  }

  filterDeliveries(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filtered = this.deliveries.filter(d => 
      (d.tracking_no && d.tracking_no.toLowerCase().includes(term)) ||
      (d.invoice_no && d.invoice_no.toLowerCase().includes(term)) ||
      (d.booking_code && d.booking_code.toLowerCase().includes(term)) ||
      (d.recipient && d.recipient.toLowerCase().includes(term))
    );
    this.renderDeliveries(filtered);
  }

  filterReceivings(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filtered = this.receivings.filter(r => 
      (r.tracking_no && r.tracking_no.toLowerCase().includes(term)) ||
      (r.sender && r.sender.toLowerCase().includes(term)) ||
      (r.details && r.details.toLowerCase().includes(term))
    );
    this.renderReceivings(filtered);
  }

  exportData(type) {
    const data = type === 'deliveries' ? this.deliveries : this.receivings;
    const filename = type === 'deliveries' ? 'pengiriman' : 'penerimaan';
    
    if (data.length === 0) {
      window.showToast?.('Tidak ada data untuk diekspor', 'warning');
      return;
    }

    // Convert to CSV
    let headers = [];
    if (type === 'deliveries') {
      headers = ['Tanggal', 'No Resi', 'Kurir', 'Penerima', 'Alamat', 'Passport', 'Invoice', 'Booking Code', 'Status', 'Detail'];
    } else {
      headers = ['Tanggal', 'No Resi', 'Pengirim', 'Passport', 'Detail'];
    }

    let csv = headers.join(',') + '\n';
    
    data.forEach(row => {
      if (type === 'deliveries') {
        csv += [
          row.send_date || '',
          row.tracking_no || '',
          row.courier || '',
          row.recipient || '',
          `"${(row.address || '').replace(/"/g, '""')}"`,
          row.passport_count || '',
          row.invoice_no || '',
          row.booking_code || '',
          row.status || '',
          `"${(row.details || '').replace(/"/g, '""')}"`
        ].join(',') + '\n';
      } else {
        csv += [
          row.receive_date || '',
          row.tracking_no || '',
          row.sender || '',
          row.passport_count || '',
          `"${(row.details || '').replace(/"/g, '""')}"`
        ].join(',') + '\n';
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    window.showToast?.('Data berhasil diekspor!', 'success');
  }
}

// Initialize
let trackingDashboard;
document.addEventListener('DOMContentLoaded', () => {
  trackingDashboard = new TrackingDashboard();
});
