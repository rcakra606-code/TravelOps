/**
 * Bulk Actions Manager
 * Enhanced UI for selecting and acting on multiple records
 */

class BulkActions {
  constructor(options = {}) {
    this.options = {
      tableSelector: '.table-bulk',
      checkboxSelector: '.bulk-checkbox',
      selectAllSelector: '.bulk-select-all',
      onDelete: options.onDelete || (() => {}),
      onExport: options.onExport || (() => {}),
      onAction: options.onAction || (() => {}),
      ...options
    };

    this.selected = new Set();
    this.actionBar = null;
    this.init();
  }

  init() {
    this.createActionBar();
    this.addStyles();

    // Event delegation for checkboxes
    document.addEventListener('change', (e) => {
      if (e.target.matches('.bulk-checkbox')) {
        this.handleCheckboxChange(e.target);
      }
      if (e.target.matches('.bulk-select-all')) {
        this.handleSelectAll(e.target);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+A to select all (when not in input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.target.matches('input, textarea')) {
        const table = document.querySelector(this.options.tableSelector);
        if (table) {
          e.preventDefault();
          this.selectAll(table);
        }
      }
      
      // Delete key to delete selected
      if (e.key === 'Delete' && this.selected.size > 0 && !e.target.matches('input, textarea')) {
        e.preventDefault();
        this.confirmDelete();
      }
      
      // Escape to clear selection
      if (e.key === 'Escape' && this.selected.size > 0) {
        this.clearSelection();
      }
    });
  }

  /**
   * Create floating action bar
   */
  createActionBar() {
    if (document.getElementById('bulkActionBar')) {
      this.actionBar = document.getElementById('bulkActionBar');
      return;
    }

    this.actionBar = document.createElement('div');
    this.actionBar.id = 'bulkActionBar';
    this.actionBar.className = 'bulk-action-bar';
    this.actionBar.innerHTML = `
      <div class="bulk-action-info">
        <span class="bulk-count">0</span>
        <span class="bulk-label">items selected</span>
      </div>
      <div class="bulk-action-buttons">
        <button class="bulk-btn bulk-export" title="Export Selected">
          📥 Export
        </button>
        <button class="bulk-btn bulk-edit" title="Bulk Edit">
          ✏️ Edit
        </button>
        <button class="bulk-btn bulk-delete danger" title="Delete Selected">
          🗑️ Delete
        </button>
      </div>
      <button class="bulk-close" title="Clear Selection">✕</button>
    `;

    document.body.appendChild(this.actionBar);

    // Event listeners
    this.actionBar.querySelector('.bulk-export').addEventListener('click', () => this.exportSelected());
    this.actionBar.querySelector('.bulk-edit').addEventListener('click', () => this.bulkEdit());
    this.actionBar.querySelector('.bulk-delete').addEventListener('click', () => this.confirmDelete());
    this.actionBar.querySelector('.bulk-close').addEventListener('click', () => this.clearSelection());
  }

  /**
   * Handle individual checkbox change
   */
  handleCheckboxChange(checkbox) {
    const row = checkbox.closest('tr');
    const id = row?.dataset.id || checkbox.dataset.id;
    
    if (!id) return;

    if (checkbox.checked) {
      this.selected.add(id);
      row?.classList.add('selected');
    } else {
      this.selected.delete(id);
      row?.classList.remove('selected');
    }

    this.updateUI();
  }

  /**
   * Handle select all checkbox
   */
  handleSelectAll(checkbox) {
    const table = checkbox.closest('table');
    if (!table) return;

    const checkboxes = table.querySelectorAll('.bulk-checkbox:not(.bulk-select-all)');
    
    checkboxes.forEach(cb => {
      cb.checked = checkbox.checked;
      this.handleCheckboxChange(cb);
    });
  }

  /**
   * Select all items in table
   */
  selectAll(table) {
    const selectAllCb = table.querySelector('.bulk-select-all');
    if (selectAllCb) {
      selectAllCb.checked = true;
      this.handleSelectAll(selectAllCb);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selected.clear();
    
    document.querySelectorAll('.bulk-checkbox').forEach(cb => {
      cb.checked = false;
    });
    
    document.querySelectorAll('tr.selected').forEach(row => {
      row.classList.remove('selected');
    });

    this.updateUI();
  }

  /**
   * Update UI based on selection
   */
  updateUI() {
    const count = this.selected.size;
    
    // Update action bar
    this.actionBar.querySelector('.bulk-count').textContent = count;
    
    if (count > 0) {
      this.actionBar.classList.add('visible');
    } else {
      this.actionBar.classList.remove('visible');
    }

    // Update select all checkbox state
    document.querySelectorAll('.bulk-select-all').forEach(cb => {
      const table = cb.closest('table');
      if (!table) return;
      
      const total = table.querySelectorAll('.bulk-checkbox:not(.bulk-select-all)').length;
      const checked = table.querySelectorAll('.bulk-checkbox:not(.bulk-select-all):checked').length;
      
      cb.checked = total > 0 && checked === total;
      cb.indeterminate = checked > 0 && checked < total;
    });
  }

  /**
   * Get selected IDs
   */
  getSelected() {
    return Array.from(this.selected);
  }

  /**
   * Export selected items
   */
  exportSelected() {
    const ids = this.getSelected();
    if (ids.length === 0) return;

    this.options.onExport(ids);
    
    if (window.toast) {
      window.toast.info(`Exporting ${ids.length} items...`);
    }
  }

  /**
   * Show bulk edit modal
   */
  bulkEdit() {
    const ids = this.getSelected();
    if (ids.length === 0) return;

    // Create bulk edit modal
    const modal = document.createElement('div');
    modal.className = 'bulk-edit-modal';
    modal.innerHTML = `
      <div class="bulk-edit-overlay"></div>
      <div class="bulk-edit-content">
        <h3>✏️ Bulk Edit ${ids.length} Items</h3>
        <p class="bulk-edit-info">Select fields to update. Leave blank to keep original values.</p>
        <div class="bulk-edit-form" id="bulkEditForm">
          <div class="bulk-edit-field">
            <label>
              <input type="checkbox" class="bulk-field-toggle" data-field="status">
              Update Status
            </label>
            <select name="status" disabled>
              <option value="">Select status...</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div class="bulk-edit-field">
            <label>
              <input type="checkbox" class="bulk-field-toggle" data-field="notes">
              Add Note
            </label>
            <textarea name="notes" disabled placeholder="Add a note to all selected items..."></textarea>
          </div>
        </div>
        <div class="bulk-edit-actions">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-apply">Apply to ${ids.length} Items</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Enable/disable fields based on checkbox
    modal.querySelectorAll('.bulk-field-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const field = toggle.closest('.bulk-edit-field').querySelector('select, textarea, input:not(.bulk-field-toggle)');
        if (field) {
          field.disabled = !toggle.checked;
          if (toggle.checked) field.focus();
        }
      });
    });

    // Cancel button
    modal.querySelector('.btn-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.bulk-edit-overlay').addEventListener('click', () => modal.remove());

    // Apply button
    modal.querySelector('.btn-apply').addEventListener('click', () => {
      const updates = {};
      modal.querySelectorAll('.bulk-field-toggle:checked').forEach(toggle => {
        const field = toggle.closest('.bulk-edit-field').querySelector('select, textarea, input:not(.bulk-field-toggle)');
        if (field && field.value) {
          updates[field.name] = field.value;
        }
      });

      if (Object.keys(updates).length > 0) {
        this.options.onAction('bulkEdit', ids, updates);
        if (window.toast) {
          window.toast.success(`Updated ${ids.length} items`);
        }
      }
      
      modal.remove();
      this.clearSelection();
    });

    // Animate in
    requestAnimationFrame(() => modal.classList.add('visible'));
  }

  /**
   * Confirm delete selected items
   */
  async confirmDelete() {
    const ids = this.getSelected();
    if (ids.length === 0) return;

    let confirmed = false;
    
    if (window.confirmDialog) {
      confirmed = await window.confirmDialog.show({
        title: 'Delete Selected Items',
        message: `Are you sure you want to delete ${ids.length} selected item${ids.length > 1 ? 's' : ''}? This action cannot be undone.`,
        icon: '🗑️',
        confirmText: `Delete ${ids.length} Item${ids.length > 1 ? 's' : ''}`,
        confirmColor: '#ef4444'
      });
    } else {
      confirmed = confirm(`Delete ${ids.length} selected items?`);
    }

    if (confirmed) {
      this.options.onDelete(ids);
      this.clearSelection();
      
      if (window.toast) {
        window.toast.success(`Deleted ${ids.length} items`);
      }
    }
  }

  /**
   * Add checkbox column to table
   */
  enableOnTable(table, options = {}) {
    if (typeof table === 'string') {
      table = document.querySelector(table);
    }
    if (!table) return;

    table.classList.add('table-bulk');

    // Add header checkbox
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('.bulk-select-all')) {
      const th = document.createElement('th');
      th.className = 'bulk-col';
      th.innerHTML = '<input type="checkbox" class="bulk-select-all bulk-checkbox" aria-label="Select all">';
      headerRow.insertBefore(th, headerRow.firstChild);
    }

    // Add row checkboxes
    table.querySelectorAll('tbody tr').forEach(row => {
      if (!row.querySelector('.bulk-checkbox')) {
        const td = document.createElement('td');
        td.className = 'bulk-col';
        td.innerHTML = `<input type="checkbox" class="bulk-checkbox" aria-label="Select row">`;
        row.insertBefore(td, row.firstChild);
      }
    });
  }

  addStyles() {
    if (document.getElementById('bulk-actions-styles')) return;

    const style = document.createElement('style');
    style.id = 'bulk-actions-styles';
    style.textContent = `
      .bulk-action-bar {
        position: fixed;
        bottom: -80px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 14px 24px;
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        z-index: 9999;
        transition: bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .bulk-action-bar.visible {
        bottom: 24px;
      }

      .bulk-action-info {
        display: flex;
        align-items: center;
        gap: 8px;
        color: white;
      }

      .bulk-count {
        background: var(--primary, #3b82f6);
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-weight: 700;
        font-size: 14px;
      }

      .bulk-label {
        font-size: 14px;
        opacity: 0.9;
      }

      .bulk-action-buttons {
        display: flex;
        gap: 8px;
      }

      .bulk-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 16px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .bulk-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-2px);
      }

      .bulk-btn.danger {
        background: rgba(239, 68, 68, 0.8);
      }

      .bulk-btn.danger:hover {
        background: rgba(239, 68, 68, 1);
      }

      .bulk-close {
        background: none;
        border: none;
        color: white;
        opacity: 0.6;
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        transition: opacity 0.2s;
      }

      .bulk-close:hover {
        opacity: 1;
      }

      .bulk-col {
        width: 40px;
        text-align: center;
      }

      .bulk-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--primary, #3b82f6);
      }

      tr.selected {
        background: rgba(59, 130, 246, 0.1) !important;
      }

      tr.selected td:first-child {
        border-left: 3px solid var(--primary, #3b82f6);
      }

      /* Bulk Edit Modal */
      .bulk-edit-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10002;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .bulk-edit-modal.visible {
        opacity: 1;
      }

      .bulk-edit-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
      }

      .bulk-edit-content {
        position: relative;
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 28px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
      }

      .bulk-edit-content h3 {
        margin: 0 0 8px 0;
        font-size: 20px;
      }

      .bulk-edit-info {
        color: var(--muted, #6b7280);
        margin: 0 0 20px 0;
        font-size: 14px;
      }

      .bulk-edit-field {
        margin-bottom: 16px;
      }

      .bulk-edit-field label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-weight: 500;
        cursor: pointer;
      }

      .bulk-edit-field select,
      .bulk-edit-field textarea {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 14px;
        background: var(--bg, #fff);
      }

      .bulk-edit-field select:disabled,
      .bulk-edit-field textarea:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .bulk-edit-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;
      }

      .bulk-edit-actions button {
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-cancel {
        background: var(--bg-alt, #f3f4f6);
        border: 1px solid var(--border-light, #e5e7eb);
        color: var(--text-primary, #1f2937);
      }

      .btn-apply {
        background: var(--primary, #3b82f6);
        border: none;
        color: white;
      }

      .btn-apply:hover {
        background: #2563eb;
      }
    `;
    document.head.appendChild(style);
  }
}

// Global instance
window.bulkActions = new BulkActions();
