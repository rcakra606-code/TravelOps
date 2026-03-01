/**
 * Tracking Dashboard JavaScript
 * Modal-based CRUD with enhanced courier tracking UI
 */

class TrackingDashboard {
  constructor() {
    this.deliveries = [];
    this.receivings = [];
    this.selectedCourier = '';
    this.currentTrackingData = null;
    
    // Form submission protection flags
    this.isSubmitting = false;
    this.lastSubmitTime = 0;
    this.submitCooldown = 2000; // 2 seconds cooldown between submissions
    
    // Courier tracking URLs with tracking number support
    this.courierUrls = {
      jne: 'https://www.jne.co.id/tracking-package',
      jnt: 'https://www.jet.co.id/track',
      sicepat: 'https://www.sicepat.com/checkAwb',
      anteraja: 'https://anteraja.id/tracking',
      pos: 'https://www.posindonesia.co.id/id/tracking',
      tiki: 'https://www.tiki.id/id/track',
      other: null
    };
    
    // Courier URLs with tracking number parameter support
    this.courierTrackUrls = {
      jne: (no) => `https://www.jne.co.id/tracking-package?awb=${no}`,
      jnt: (no) => `https://www.jet.co.id/track?no=${no}`,
      sicepat: (no) => `https://www.sicepat.com/checkAwb?awb=${no}`,
      anteraja: (no) => `https://anteraja.id/tracking/${no}`,
      pos: (no) => `https://www.posindonesia.co.id/id/tracking?barcode=${no}`,
      tiki: (no) => `https://www.tiki.id/id/track?awb=${no}`,
      other: null
    };
    
    this.courierEmojis = {
      jne: '🚚',
      jnt: '🚛',
      sicepat: '⚡',
      anteraja: '📦',
      pos: '📮',
      tiki: '🚀',
      other: '📋'
    };
    
    this.init();
  }

  async init() {
    // Prevent double initialization
    if (this.initialized) return;
    this.initialized = true;
    
    this.bindEvents();
    await this.loadData();
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.tracking-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Add buttons
    document.getElementById('addDeliveryBtn')?.addEventListener('click', () => this.openDeliveryModal());
    document.getElementById('addReceivingBtn')?.addEventListener('click', () => this.openReceivingModal());

    // Courier selection in modal
    document.querySelectorAll('#courierSelect .courier-item').forEach(item => {
      item.addEventListener('click', () => this.selectCourier(item.dataset.courier));
    });

    // Forms - use bound functions to prevent duplicate handlers
    const deliveryForm = document.getElementById('deliveryForm');
    const receivingForm = document.getElementById('receivingForm');
    
    if (deliveryForm) {
      // Remove any existing listener and add fresh one
      deliveryForm.onsubmit = (e) => this.handleDeliverySubmit(e);
    }
    
    if (receivingForm) {
      // Remove any existing listener and add fresh one
      receivingForm.onsubmit = (e) => this.handleReceivingSubmit(e);
    }

    // Modal close buttons
    document.getElementById('closeDeliveryModal')?.addEventListener('click', () => this.closeDeliveryModal());
    document.getElementById('cancelDeliveryBtn')?.addEventListener('click', () => this.closeDeliveryModal());
    document.getElementById('closeReceivingModal')?.addEventListener('click', () => this.closeReceivingModal());
    document.getElementById('cancelReceivingBtn')?.addEventListener('click', () => this.closeReceivingModal());
    document.getElementById('closeTrackingModal')?.addEventListener('click', () => this.closeTrackingModal());
    document.getElementById('closeTrackingModalBtn')?.addEventListener('click', () => this.closeTrackingModal());
    document.getElementById('openCourierSiteBtn')?.addEventListener('click', () => this.openCourierWebsite());

    // Click outside modal to close
    document.getElementById('deliveryModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'deliveryModal') this.closeDeliveryModal();
    });
    document.getElementById('receivingModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'receivingModal') this.closeReceivingModal();
    });
    document.getElementById('trackingModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'trackingModal') this.closeTrackingModal();
    });

    // Quick Track
    document.getElementById('quickTrackBtn')?.addEventListener('click', () => this.quickTrack());
    document.getElementById('quickTrackNumber')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.quickTrack();
    });

    // Search
    document.getElementById('deliverySearch')?.addEventListener('input', (e) => this.filterDeliveries(e.target.value));
    document.getElementById('receivingSearch')?.addEventListener('input', (e) => this.filterReceivings(e.target.value));

    // Export buttons
    document.getElementById('exportDeliveries')?.addEventListener('click', () => this.exportData('deliveries'));
    document.getElementById('exportReceivings')?.addEventListener('click', () => this.exportData('receivings'));
  }

  switchTab(tabName) {
    document.querySelectorAll('.tracking-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.getElementById('deliveringTab')?.classList.toggle('active', tabName === 'delivering');
    document.getElementById('receivingTab')?.classList.toggle('active', tabName === 'receiving');
  }

  selectCourier(courier) {
    this.selectedCourier = courier;
    document.getElementById('deliveryCourier').value = courier;
    document.querySelectorAll('#courierSelect .courier-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.courier === courier);
    });
  }

  // Modal Functions
  openDeliveryModal(editData = null) {
    const modal = document.getElementById('deliveryModal');
    const title = document.getElementById('deliveryModalTitle');
    const form = document.getElementById('deliveryForm');
    
    form.reset();
    this.selectedCourier = '';
    document.querySelectorAll('#courierSelect .courier-item').forEach(i => i.classList.remove('selected'));
    
    if (editData) {
      title.textContent = '✏️ Edit Pengiriman';
      document.getElementById('deliveryId').value = editData.id;
      document.getElementById('deliverySendDate').value = editData.send_date || '';
      document.getElementById('deliveryPassportCount').value = editData.passport_count || '';
      document.getElementById('deliveryInvoice').value = editData.invoice_no || '';
      document.getElementById('deliveryBookingCode').value = editData.booking_code || '';
      document.getElementById('deliveryTrackingNo').value = editData.tracking_no || '';
      document.getElementById('deliveryRecipient').value = editData.recipient || '';
      document.getElementById('deliveryAddress').value = editData.address || '';
      document.getElementById('deliveryStatus').value = editData.status || 'pending';
      document.getElementById('deliveryDetails').value = editData.details || '';
      
      if (editData.courier) {
        this.selectCourier(editData.courier);
      }
    } else {
      title.textContent = '📤 Tambah Pengiriman';
      document.getElementById('deliveryId').value = '';
      document.getElementById('deliverySendDate').value = new Date().toISOString().split('T')[0];
    }
    
    modal.classList.add('show');
  }

  closeDeliveryModal() {
    document.getElementById('deliveryModal')?.classList.remove('show');
    // Reset submission state when modal is closed
    this.isSubmitting = false;
    const submitBtn = document.querySelector('#deliveryForm button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '💾 Simpan';
    }
  }

  openReceivingModal(editData = null) {
    const modal = document.getElementById('receivingModal');
    const title = document.getElementById('receivingModalTitle');
    const form = document.getElementById('receivingForm');
    
    form.reset();
    
    if (editData) {
      title.textContent = '✏️ Edit Penerimaan';
      document.getElementById('receivingId').value = editData.id;
      document.getElementById('receiveDate').value = editData.receive_date || '';
      document.getElementById('receivePassportCount').value = editData.passport_count || '';
      document.getElementById('receiveSender').value = editData.sender || '';
      document.getElementById('receiveTrackingNo').value = editData.tracking_no || '';
      document.getElementById('receiveDetails').value = editData.details || '';
    } else {
      title.textContent = '📥 Tambah Penerimaan';
      document.getElementById('receivingId').value = '';
      document.getElementById('receiveDate').value = new Date().toISOString().split('T')[0];
    }
    
    modal.classList.add('show');
  }

  closeReceivingModal() {
    document.getElementById('receivingModal')?.classList.remove('show');
    // Reset submission state when modal is closed
    this.isSubmitting = false;
    const submitBtn = document.querySelector('#receivingForm button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '💾 Simpan';
    }
  }

  closeTrackingModal() {
    document.getElementById('trackingModal')?.classList.remove('show');
    this.currentTrackingData = null;
  }

  openCourierWebsite() {
    if (this.currentTrackingData) {
      const url = this.courierUrls[this.currentTrackingData.courier];
      if (url) {
        window.open(url, '_blank');
      } else {
        window.showToast?.('URL kurir tidak tersedia', 'warning');
      }
    }
  }

  // Data Loading
  async loadData() {
    const token = localStorage.getItem('token');
    
    try {
      const [deliveriesRes, receivingsRes] = await Promise.all([
        fetch('/api/tracking/deliveries', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/tracking/receivings', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (deliveriesRes.ok) this.deliveries = await deliveriesRes.json();
      if (receivingsRes.ok) this.receivings = await receivingsRes.json();

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

  // Rendering
  renderDeliveries(data = null) {
    const deliveries = data || this.deliveries;
    const tbody = document.getElementById('deliveryTableBody');

    if (deliveries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
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
          <div class="courier-badge">${this.courierEmojis[d.courier] || '📦'} ${this.getCourierName(d.courier)}</div>
          <div style="font-size: 13px; margin-top: 4px; color: var(--text-secondary);">
            ${d.tracking_no || '-'}
            ${d.tracking_no ? `<button class="action-btn track" onclick="trackingDashboard.showTrackingDetail('${d.tracking_no}', '${d.courier}')" style="margin-left: 6px;">🔍</button>` : ''}
          </div>
        </td>
        <td>
          <div>${d.recipient || '-'}</div>
          ${d.address ? `<div style="font-size: 11px; color: var(--text-secondary);">${this.truncateText(d.address, 30)}</div>` : ''}
        </td>
        <td>
          ${d.invoice_no ? `<div>INV: ${d.invoice_no}</div>` : ''}
          ${d.booking_code ? `<div>BC: ${d.booking_code}</div>` : ''}
          ${!d.invoice_no && !d.booking_code ? '-' : ''}
        </td>
        <td>${this.getStatusBadge(d.status)}</td>
        <td style="text-align: center;">
          ${d.status !== 'delivered' ? `<button class="action-btn delivered" onclick="trackingDashboard.markDelivered(${d.id})" title="Tandai Terkirim">✅</button>` : ''}
          <button class="action-btn edit" onclick="trackingDashboard.editDelivery(${d.id})" title="Edit">✏️</button>
          <button class="action-btn delete" onclick="trackingDashboard.deleteDelivery(${d.id})" title="Hapus">🗑️</button>
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
        <td title="${r.details || ''}">${this.truncateText(r.details, 40)}</td>
        <td style="text-align: center;">
          <button class="action-btn edit" onclick="trackingDashboard.editReceiving(${r.id})" title="Edit">✏️</button>
          <button class="action-btn delete" onclick="trackingDashboard.deleteReceiving(${r.id})" title="Hapus">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  // Helper Functions
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getCourierName(courier) {
    const names = { jne: 'JNE', jnt: 'J&T', sicepat: 'SiCepat', anteraja: 'AnterAja', pos: 'POS', tiki: 'TIKI', other: 'Lainnya' };
    return names[courier] || courier || '-';
  }

  getStatusBadge(status) {
    const badges = {
      pending: '<span class="status-badge pending">⏳ Pending</span>',
      'in-transit': '<span class="status-badge in-transit">🚚 Dalam Perjalanan</span>',
      delivered: '<span class="status-badge delivered">✅ Terkirim</span>'
    };
    return badges[status] || badges.pending;
  }

  truncateText(text, maxLength) {
    if (!text) return '-';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  // CRUD Operations
  async handleDeliverySubmit(e) {
    e.preventDefault();
    
    // Prevent double submission
    if (this.isSubmitting) {
      window.showToast?.('Mohon tunggu, data sedang diproses...', 'warning');
      return;
    }
    
    // Check cooldown period to prevent rapid submissions
    const now = Date.now();
    if (now - this.lastSubmitTime < this.submitCooldown) {
      window.showToast?.('Mohon tunggu sebentar sebelum menyimpan lagi', 'warning');
      return;
    }
    
    const token = localStorage.getItem('token');
    const id = document.getElementById('deliveryId').value;
    
    // Get form data first before disabling
    const data = {
      send_date: document.getElementById('deliverySendDate').value,
      passport_count: document.getElementById('deliveryPassportCount').value || null,
      invoice_no: document.getElementById('deliveryInvoice').value.trim() || null,
      booking_code: document.getElementById('deliveryBookingCode').value.trim() || null,
      courier: this.selectedCourier || null,
      tracking_no: document.getElementById('deliveryTrackingNo').value.trim() || null,
      recipient: document.getElementById('deliveryRecipient').value.trim() || null,
      address: document.getElementById('deliveryAddress').value.trim() || null,
      status: document.getElementById('deliveryStatus').value,
      details: document.getElementById('deliveryDetails').value.trim() || null
    };

    // Set submission flags and disable button
    this.isSubmitting = true;
    this.lastSubmitTime = now;
    const submitBtn = document.querySelector('#deliveryForm button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Menyimpan...';
    }

    try {
      const url = id ? `/api/tracking/deliveries/${id}` : '/api/tracking/deliveries';
      const method = id ? 'PUT' : 'POST';
      const csrfToken = sessionStorage.getItem('csrfToken');
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const result = await res.json();
        window.showToast?.(id ? 'Pengiriman berhasil diperbarui!' : 'Pengiriman berhasil disimpan!', 'success');
        window.logAudit?.(id ? 'update' : 'create', 'tracking_deliveries', id || result.id, data);
        this.closeDeliveryModal();
        await this.loadData();
      } else {
        const error = await res.json();
        window.showToast?.(error.message || 'Gagal menyimpan pengiriman', 'error');
      }
    } catch (error) {
      console.error('Error saving delivery:', error);
      window.showToast?.('Terjadi kesalahan saat menyimpan', 'error');
    } finally {
      // Reset submission flags and re-enable button
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Simpan';
      }
    }
  }

  async handleReceivingSubmit(e) {
    e.preventDefault();
    
    // Prevent double submission
    if (this.isSubmitting) {
      window.showToast?.('Mohon tunggu, data sedang diproses...', 'warning');
      return;
    }
    
    // Check cooldown period to prevent rapid submissions
    const now = Date.now();
    if (now - this.lastSubmitTime < this.submitCooldown) {
      window.showToast?.('Mohon tunggu sebentar sebelum menyimpan lagi', 'warning');
      return;
    }
    
    const token = localStorage.getItem('token');
    const id = document.getElementById('receivingId').value;

    // Get form data first before disabling
    const data = {
      receive_date: document.getElementById('receiveDate').value,
      passport_count: document.getElementById('receivePassportCount').value || null,
      sender: document.getElementById('receiveSender').value.trim() || null,
      tracking_no: document.getElementById('receiveTrackingNo').value.trim() || null,
      details: document.getElementById('receiveDetails').value.trim() || null
    };

    // Set submission flags and disable button
    this.isSubmitting = true;
    this.lastSubmitTime = now;
    const submitBtn = document.querySelector('#receivingForm button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Menyimpan...';
    }

    try {
      const url = id ? `/api/tracking/receivings/${id}` : '/api/tracking/receivings';
      const method = id ? 'PUT' : 'POST';
      const csrfToken = sessionStorage.getItem('csrfToken');
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const result = await res.json();
        window.showToast?.(id ? 'Penerimaan berhasil diperbarui!' : 'Penerimaan berhasil disimpan!', 'success');
        window.logAudit?.(id ? 'update' : 'create', 'tracking_receivings', id || result.id, data);
        this.closeReceivingModal();
        await this.loadData();
      } else {
        const error = await res.json();
        window.showToast?.(error.message || 'Gagal menyimpan penerimaan', 'error');
      }
    } catch (error) {
      console.error('Error saving receiving:', error);
      window.showToast?.('Terjadi kesalahan saat menyimpan', 'error');
    } finally {
      // Reset submission flags and re-enable button
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Simpan';
      }
    }
  }

  editDelivery(id) {
    const delivery = this.deliveries.find(d => d.id === id);
    if (delivery) this.openDeliveryModal(delivery);
  }

  editReceiving(id) {
    const receiving = this.receivings.find(r => r.id === id);
    if (receiving) this.openReceivingModal(receiving);
  }

  async markDelivered(id) {
    // Check if id exists in current deliveries to prevent operating on stale data
    const delivery = this.deliveries.find(d => d.id === id);
    if (!delivery) {
      window.showToast?.('Data tidak ditemukan, mungkin sudah dihapus', 'warning');
      await this.loadData();
      return;
    }
    
    if (!confirm('Tandai pengiriman ini sebagai terkirim?')) return;

    // Prevent double-click by checking if already delivered
    if (delivery.status === 'delivered') {
      window.showToast?.('Pengiriman ini sudah ditandai terkirim', 'info');
      return;
    }

    const token = localStorage.getItem('token');
    const csrfToken = sessionStorage.getItem('csrfToken');
    try {
      const res = await fetch(`/api/tracking/deliveries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify({ status: 'delivered' })
      });

      if (res.ok) {
        window.showToast?.('Status berhasil diperbarui!', 'success');
        await this.loadData();
      } else {
        const error = await res.json();
        window.showToast?.(error.message || 'Gagal memperbarui status', 'error');
      }
    } catch (error) {
      console.error('Error marking delivered:', error);
      window.showToast?.('Gagal memperbarui status', 'error');
    }
  }

  async deleteDelivery(id) {
    // Check if id exists in current deliveries to prevent operating on stale/deleted data
    const delivery = this.deliveries.find(d => d.id === id);
    if (!delivery) {
      window.showToast?.('Data tidak ditemukan, mungkin sudah dihapus', 'warning');
      await this.loadData();
      return;
    }
    
    if (!confirm('Yakin ingin menghapus data pengiriman ini?')) return;

    // Prevent double-click by removing from local array immediately
    this.deliveries = this.deliveries.filter(d => d.id !== id);
    this.renderDeliveries();

    const token = localStorage.getItem('token');
    const csrfToken = sessionStorage.getItem('csrfToken');
    try {
      const res = await fetch(`/api/tracking/deliveries/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }
      });

      if (res.ok) {
        window.showToast?.('Data berhasil dihapus!', 'success');
        this.updateStats();
      } else {
        // Restore data if delete failed
        await this.loadData();
        window.showToast?.('Gagal menghapus data', 'error');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      // Restore data if delete failed
      await this.loadData();
      window.showToast?.('Gagal menghapus data', 'error');
    }
  }

  async deleteReceiving(id) {
    // Check if id exists in current receivings to prevent operating on stale/deleted data
    const receiving = this.receivings.find(r => r.id === id);
    if (!receiving) {
      window.showToast?.('Data tidak ditemukan, mungkin sudah dihapus', 'warning');
      await this.loadData();
      return;
    }
    
    if (!confirm('Yakin ingin menghapus data penerimaan ini?')) return;

    // Prevent double-click by removing from local array immediately
    this.receivings = this.receivings.filter(r => r.id !== id);
    this.renderReceivings();

    const token = localStorage.getItem('token');
    const csrfToken = sessionStorage.getItem('csrfToken');
    try {
      const res = await fetch(`/api/tracking/receivings/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }
      });

      if (res.ok) {
        window.showToast?.('Data berhasil dihapus!', 'success');
        this.updateStats();
      } else {
        // Restore data if delete failed
        await this.loadData();
        window.showToast?.('Gagal menghapus data', 'error');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      // Restore data if delete failed
      await this.loadData();
      window.showToast?.('Gagal menghapus data', 'error');
    }
  }

  // Tracking Functions - Direct redirect to courier website
  quickTrack() {
    const courier = document.getElementById('quickTrackCourier').value;
    const trackingNo = document.getElementById('quickTrackNumber').value.trim();

    if (!courier) {
      window.showToast?.('Pilih kurir terlebih dahulu', 'warning');
      return;
    }
    
    if (!trackingNo) {
      window.showToast?.('Masukkan nomor resi terlebih dahulu', 'warning');
      return;
    }

    // Open courier tracking page directly
    const trackUrl = this.courierTrackUrls[courier];
    if (trackUrl) {
      window.open(trackUrl(trackingNo), '_blank');
      window.showToast?.(`Membuka halaman tracking ${this.getCourierName(courier)}...`, 'info');
    } else {
      window.showToast?.('Kurir tidak mendukung tracking otomatis', 'warning');
    }
  }

  renderQuickTrackResult(data, container) {
    const emoji = this.courierEmojis[data.courier] || '📦';
    const courierName = this.getCourierName(data.courier);
    
    // If not found locally, show fallback with courier link
    if (data.not_found) {
      const url = this.courierUrls[data.courier];
      container.innerHTML = `
        <div class="tracking-info-card">
          <div class="tracking-header-info">
            <div class="tracking-courier-display">
              <div class="courier-logo">${emoji}</div>
              <div class="courier-info">
                <h4>${courierName}</h4>
                <span>${data.tracking_no}</span>
              </div>
            </div>
            <span class="status-badge pending">❓ Belum Diketahui</span>
          </div>
          <p style="color: var(--text-secondary); text-align: center; padding: 16px 0;">${data.message || 'Data tracking tidak ditemukan di sistem lokal.'}</p>
          ${url ? `
            <div style="text-align: center; margin-top: 8px;">
              <a href="${url}" target="_blank" class="btn btn-primary">🔗 Cek di Website ${courierName}</a>
            </div>
          ` : ''}
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="tracking-info-card">
        <div class="tracking-header-info">
          <div class="tracking-courier-display">
            <div class="courier-logo">${emoji}</div>
            <div class="courier-info">
              <h4>${courierName}</h4>
              <span>${data.tracking_no}</span>
            </div>
          </div>
          ${this.getStatusBadge(data.status)}
        </div>
        ${data.timeline && data.timeline.length > 0 ? `
          <div class="tracking-timeline">
            ${data.timeline.slice(0, 5).map((event, idx) => `
              <div class="timeline-item ${idx === 0 ? 'active' : ''}">
                <div class="timeline-time">${event.date} ${event.time || ''}</div>
                <div class="timeline-desc">${event.description}</div>
                ${event.location ? `<div class="timeline-location">📍 ${event.location}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : '<p style="color: var(--text-secondary); text-align: center; padding: 16px 0;">Tidak ada detail tracking tersedia</p>'}
        ${data.courier && this.courierUrls[data.courier] ? `
          <div style="text-align: center; margin-top: 16px;">
            <a href="${this.courierUrls[data.courier]}" target="_blank" class="btn btn-secondary">🔗 Buka Website ${courierName}</a>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderQuickTrackFallback(trackingNo, courier, container) {
    const url = this.courierUrls[courier];
    const emoji = this.courierEmojis[courier] || '📦';
    const courierName = this.getCourierName(courier);
    
    container.innerHTML = `
      <div class="tracking-info-card">
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">${emoji}</div>
          <p><strong>No. Resi:</strong> ${trackingNo}</p>
          <p style="color: var(--text-secondary); margin: 12px 0;">Data tracking tidak dapat dimuat otomatis.</p>
          ${url ? `
            <a href="${url}" target="_blank" class="btn btn-primary">🔗 Cek di Website ${courierName}</a>
          ` : `
            <p style="color: var(--text-secondary);">Pilih kurir untuk mendapatkan link tracking.</p>
          `}
        </div>
      </div>
    `;
  }

  showTrackingDetail(trackingNo, courier) {
    // Directly open courier tracking page instead of showing modal
    if (courier && this.courierTrackUrls[courier]) {
      window.open(this.courierTrackUrls[courier](trackingNo), '_blank');
      window.showToast?.(`Membuka tracking ${this.getCourierName(courier)}...`, 'info');
    } else if (courier && this.courierUrls[courier]) {
      window.open(this.courierUrls[courier], '_blank');
      window.showToast?.(`Membuka website ${this.getCourierName(courier)}...`, 'info');
    } else {
      window.showToast?.('Kurir tidak mendukung tracking online', 'warning');
    }
  }

  getTrackingDetailHTML(data) {
    const emoji = this.courierEmojis[data.courier] || '📦';
    const courierName = this.getCourierName(data.courier);
    
    return `
      <div class="tracking-header-info">
        <div class="tracking-courier-display">
          <div class="courier-logo">${emoji}</div>
          <div class="courier-info">
            <h4>${courierName}</h4>
            <span>${data.tracking_no}</span>
          </div>
        </div>
        ${this.getStatusBadge(data.status)}
      </div>
      ${data.origin ? `<p style="margin: 12px 0;"><strong>🏠 Asal:</strong> ${data.origin}</p>` : ''}
      ${data.destination ? `<p style="margin: 12px 0;"><strong>📍 Tujuan:</strong> ${data.destination}</p>` : ''}
      ${data.timeline && data.timeline.length > 0 ? `
        <h4 style="margin: 20px 0 16px; font-size: 14px;">📜 Riwayat Perjalanan</h4>
        <div class="tracking-timeline">
          ${data.timeline.map((event, idx) => `
            <div class="timeline-item ${idx === 0 ? 'active' : ''}">
              <div class="timeline-time">${event.date} ${event.time || ''}</div>
              <div class="timeline-desc">${event.description}</div>
              ${event.location ? `<div class="timeline-location">📍 ${event.location}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">Tidak ada detail tracking tersedia</p>'}
    `;
  }

  getTrackingFallbackHTML(trackingNo, courier) {
    const url = this.courierUrls[courier];
    const emoji = this.courierEmojis[courier] || '📦';
    
    return `
      <div style="text-align: center; padding: 24px;">
        <div style="font-size: 56px; margin-bottom: 16px;">${emoji}</div>
        <p><strong>No. Resi:</strong> ${trackingNo}</p>
        <p style="color: var(--text-secondary); margin: 16px 0;">Data tracking tidak dapat dimuat otomatis.</p>
        ${url ? `<p style="font-size: 13px; color: var(--text-secondary);">Gunakan tombol di bawah untuk cek di website kurir.</p>` : ''}
      </div>
    `;
  }

  // Search & Filter
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

  // Export
  exportData(type) {
    const data = type === 'deliveries' ? this.deliveries : this.receivings;
    const filename = type === 'deliveries' ? 'pengiriman' : 'penerimaan';
    
    if (data.length === 0) {
      window.showToast?.('Tidak ada data untuk diekspor', 'warning');
      return;
    }

    let headers, rows;
    
    if (type === 'deliveries') {
      headers = ['ID', 'Tanggal', 'No Resi', 'Kurir', 'Penerima', 'Alamat', 'Passport', 'Invoice', 'Booking Code', 'Status', 'Detail'];
      rows = data.map(row => [
        row.id,
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
      ]);
    } else {
      headers = ['ID', 'Tanggal', 'No Resi', 'Pengirim', 'Passport', 'Detail'];
      rows = data.map(row => [
        row.id,
        row.receive_date || '',
        row.tracking_no || '',
        row.sender || '',
        row.passport_count || '',
        `"${(row.details || '').replace(/"/g, '""')}"`
      ]);
    }

    let csv = headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    window.showToast?.('Data berhasil diekspor!', 'success');
  }
}

// Initialize - prevent multiple instantiation
let trackingDashboard;
document.addEventListener('DOMContentLoaded', () => {
  if (!trackingDashboard) {
    trackingDashboard = new TrackingDashboard();
  }
});
