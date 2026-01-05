/**
 * Batch Status Updates
 * Change multiple records status at once
 */

class BatchStatusUpdater {
  constructor() {
    this.selectedIds = new Set();
    this.currentEntity = this.detectEntity();
    this.init();
  }

  detectEntity() {
    const path = window.location.pathname;
    if (path.includes('tours') || path.includes('my-tours')) return 'tours';
    if (path.includes('sales')) return 'sales';
    if (path.includes('overtime')) return 'overtime';
    if (path.includes('tracking')) return 'tracking_deliveries';
    if (path.includes('documents')) return 'documents';
    return null;
  }

  getStatusOptions() {
    switch (this.currentEntity) {
      case 'tours':
        return [
          { value: 'Pending', label: 'Pending', color: '#f59e0b' },
          { value: 'Confirmed', label: 'Confirmed', color: '#3b82f6' },
          { value: 'Completed', label: 'Completed', color: '#10b981' },
          { value: 'Cancelled', label: 'Cancelled', color: '#ef4444' }
        ];
      case 'sales':
        return [
          { value: 'Pending', label: 'Pending', color: '#f59e0b' },
          { value: 'Confirmed', label: 'Confirmed', color: '#3b82f6' },
          { value: 'Completed', label: 'Completed', color: '#10b981' }
        ];
      case 'overtime':
        return [
          { value: 'pending', label: 'Pending', color: '#f59e0b' },
          { value: 'paid', label: 'Paid', color: '#10b981' },
          { value: 'cancel', label: 'Cancelled', color: '#ef4444' }
        ];
      case 'tracking_deliveries':
        return [
          { value: 'pending', label: 'Pending', color: '#f59e0b' },
          { value: 'delivering', label: 'In Transit', color: '#3b82f6' },
          { value: 'delivered', label: 'Delivered', color: '#10b981' }
        ];
      default:
        return [];
    }
  }

  init() {
    if (!this.currentEntity) return;
    
    this.addStyles();
    this.addBatchButton();
    this.setupTableSelection();
  }

  addBatchButton() {
    setTimeout(() => {
      const headerActions = document.querySelector('.header-actions, .header > div:last-child, .card:first-of-type');
      if (!headerActions) return;

      // Check if button already exists
      if (document.getElementById('batchStatusBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'batchStatusBtn';
      btn.className = 'btn batch-status-btn';
      btn.innerHTML = '⚡ Batch Update';
      btn.title = 'Update status for multiple records';
      btn.addEventListener('click', () => this.showBatchModal());

      // Find existing buttons
      const existingBtn = headerActions.querySelector('.btn, button');
      if (existingBtn) {
        existingBtn.parentElement.insertBefore(btn, existingBtn);
      } else {
        headerActions.appendChild(btn);
      }
    }, 1000);
  }

  setupTableSelection() {
    document.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-id], tr.table-row');
      if (!row || e.target.closest('button, a, .actions')) return;

      // Toggle selection on row click while holding Ctrl/Cmd
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const id = row.dataset.id || row.querySelector('[data-id]')?.dataset.id;
        if (id) {
          if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
            row.classList.remove('batch-selected');
          } else {
            this.selectedIds.add(id);
            row.classList.add('batch-selected');
          }
          this.updateSelectionCount();
        }
      }
    });
  }

  updateSelectionCount() {
    let countEl = document.getElementById('batchSelectionCount');
    
    if (this.selectedIds.size > 0) {
      if (!countEl) {
        countEl = document.createElement('span');
        countEl.id = 'batchSelectionCount';
        countEl.className = 'batch-selection-count';
        document.getElementById('batchStatusBtn')?.appendChild(countEl);
      }
      countEl.textContent = this.selectedIds.size;
    } else if (countEl) {
      countEl.remove();
    }
  }

  showBatchModal() {
    const statusOptions = this.getStatusOptions();
    if (statusOptions.length === 0) {
      window.toast?.error('Batch updates not available for this dashboard');
      return;
    }

    // Remove existing modal
    document.getElementById('batchStatusModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'batchStatusModal';
    modal.className = 'batch-status-modal';
    modal.innerHTML = `
      <div class="batch-status-content">
        <div class="batch-status-header">
          <h3>⚡ Batch Status Update</h3>
          <button class="batch-close-btn" id="closeBatchModal">&times;</button>
        </div>
        <div class="batch-status-body">
          <div class="batch-instructions">
            <p><strong>How to use:</strong></p>
            <ol>
              <li>Hold <kbd>Ctrl</kbd> (or <kbd>Cmd</kbd> on Mac) and click rows to select them</li>
              <li>Choose the new status below</li>
              <li>Click "Update Selected" to apply changes</li>
            </ol>
          </div>
          
          <div class="batch-selection-info">
            <span class="selection-count">${this.selectedIds.size}</span> records selected
            ${this.selectedIds.size > 0 ? `
              <button class="clear-selection-btn" id="clearBatchSelection">Clear Selection</button>
            ` : ''}
          </div>
          
          <div class="batch-status-options">
            <label>Select New Status:</label>
            <div class="status-grid">
              ${statusOptions.map(opt => `
                <label class="status-option" style="--status-color: ${opt.color}">
                  <input type="radio" name="batchStatus" value="${opt.value}">
                  <span class="status-label">${opt.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="batch-status-footer">
          <button class="btn btn-secondary" id="cancelBatchUpdate">Cancel</button>
          <button class="btn btn-primary" id="applyBatchUpdate" ${this.selectedIds.size === 0 ? 'disabled' : ''}>
            Update ${this.selectedIds.size} Records
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    // Bind events
    document.getElementById('closeBatchModal')?.addEventListener('click', () => this.closeModal());
    document.getElementById('cancelBatchUpdate')?.addEventListener('click', () => this.closeModal());
    document.getElementById('clearBatchSelection')?.addEventListener('click', () => {
      this.clearSelection();
      this.showBatchModal(); // Refresh modal
    });

    document.getElementById('applyBatchUpdate')?.addEventListener('click', async () => {
      const selectedStatus = document.querySelector('input[name="batchStatus"]:checked')?.value;
      if (!selectedStatus) {
        window.toast?.error('Please select a status');
        return;
      }
      await this.applyBatchUpdate(selectedStatus);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });
  }

  closeModal() {
    const modal = document.getElementById('batchStatusModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  clearSelection() {
    this.selectedIds.clear();
    document.querySelectorAll('.batch-selected').forEach(el => {
      el.classList.remove('batch-selected');
    });
    this.updateSelectionCount();
  }

  async applyBatchUpdate(newStatus) {
    if (this.selectedIds.size === 0) {
      window.toast?.error('No records selected');
      return;
    }

    const btn = document.getElementById('applyBatchUpdate');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Updating...';
    }

    try {
      const ids = Array.from(this.selectedIds);
      let successCount = 0;
      let failCount = 0;

      // Update each record
      for (const id of ids) {
        try {
          await window.fetchJson?.(`/api/${this.currentEntity}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to update ${id}:`, err);
          failCount++;
        }
      }

      // Show result
      if (successCount > 0) {
        window.toast?.success(`Updated ${successCount} records to "${newStatus}"`);
      }
      if (failCount > 0) {
        window.toast?.error(`Failed to update ${failCount} records`);
      }

      // Clear selection and close modal
      this.clearSelection();
      this.closeModal();

      // Refresh data
      if (typeof window.loadData === 'function') {
        window.loadData();
      } else if (typeof window.loadTours === 'function') {
        window.loadTours();
      } else if (typeof window.loadOvertime === 'function') {
        window.loadOvertime();
      } else {
        // Try to find and call any load function
        const loadFn = Object.keys(window).find(k => k.startsWith('load') && typeof window[k] === 'function');
        if (loadFn) window[loadFn]();
      }
    } catch (err) {
      console.error('Batch update failed:', err);
      window.toast?.error('Batch update failed');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Update ${this.selectedIds.size} Records`;
      }
    }
  }

  addStyles() {
    if (document.getElementById('batchStatusStyles')) return;

    const style = document.createElement('style');
    style.id = 'batchStatusStyles';
    style.textContent = `
      .batch-status-btn {
        background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important;
        color: white !important;
        position: relative;
        margin-right: 8px;
      }

      .batch-selection-count {
        position: absolute;
        top: -8px;
        right: -8px;
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 700;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      tr.batch-selected {
        background: rgba(139, 92, 246, 0.1) !important;
        outline: 2px solid #8b5cf6;
        outline-offset: -2px;
      }

      .batch-status-modal {
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

      .batch-status-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .batch-status-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 90%;
        max-width: 500px;
        overflow: hidden;
        box-shadow: 0 25px 80px rgba(0,0,0,0.3);
      }

      .batch-status-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        background: linear-gradient(135deg, #8b5cf6, #7c3aed);
        color: white;
      }

      .batch-status-header h3 {
        margin: 0;
        font-size: 18px;
      }

      .batch-close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: rgba(255,255,255,0.2);
        color: white;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }

      .batch-status-body {
        padding: 24px;
      }

      .batch-instructions {
        background: var(--bg-alt, #f9fafb);
        padding: 16px;
        border-radius: 12px;
        margin-bottom: 20px;
        font-size: 14px;
      }

      .batch-instructions p {
        margin: 0 0 8px 0;
      }

      .batch-instructions ol {
        margin: 0;
        padding-left: 20px;
      }

      .batch-instructions li {
        margin-bottom: 4px;
      }

      .batch-instructions kbd {
        background: var(--card, #fff);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        border: 1px solid var(--border-light, #e5e7eb);
      }

      .batch-selection-info {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
        padding: 12px 16px;
        background: rgba(139, 92, 246, 0.1);
        border-radius: 8px;
        font-size: 14px;
      }

      .selection-count {
        font-size: 24px;
        font-weight: 700;
        color: #8b5cf6;
      }

      .clear-selection-btn {
        margin-left: auto;
        background: none;
        border: 1px solid var(--border-light, #e5e7eb);
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        color: var(--text-secondary, #6b7280);
      }

      .batch-status-options label:first-child {
        display: block;
        font-weight: 600;
        margin-bottom: 12px;
        font-size: 14px;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }

      .status-option {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: var(--bg-alt, #f9fafb);
        border: 2px solid transparent;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .status-option:hover {
        border-color: var(--status-color);
      }

      .status-option input {
        display: none;
      }

      .status-option input:checked + .status-label::before {
        background: var(--status-color);
        border-color: var(--status-color);
      }

      .status-option:has(input:checked) {
        border-color: var(--status-color);
        background: color-mix(in srgb, var(--status-color) 10%, transparent);
      }

      .status-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
      }

      .status-label::before {
        content: '';
        width: 18px;
        height: 18px;
        border: 2px solid var(--border-light, #d1d5db);
        border-radius: 50%;
        transition: all 0.2s;
      }

      .batch-status-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 24px;
        background: var(--bg-alt, #f9fafb);
        border-top: 1px solid var(--border-light, #e5e7eb);
      }

      /* Dark mode */
      [data-theme="dark"] .batch-status-content {
        background: var(--card, #1e293b);
      }

      [data-theme="dark"] .batch-instructions {
        background: var(--bg-alt, #0f172a);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.batchStatusUpdater = new BatchStatusUpdater();
