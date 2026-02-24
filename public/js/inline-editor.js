/**
 * Inline Table Editor
 * Double-click cells to edit without opening modal
 */

class InlineEditor {
  constructor(options = {}) {
    this.options = {
      tableSelector: '.table-inline-edit',
      editableSelector: '[data-editable]',
      onSave: options.onSave || (() => {}),
      onCancel: options.onCancel || (() => {}),
      ...options
    };
    
    this.activeCell = null;
    this.originalValue = null;
    this.init();
  }

  init() {
    document.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    document.addEventListener('click', (e) => this.handleClickOutside(e));

    this.addStyles();
  }

  /**
   * Handle double-click to start editing
   */
  handleDoubleClick(e) {
    const cell = e.target.closest('[data-editable]');
    if (!cell) return;

    // Don't edit if already editing
    if (this.activeCell) {
      this.saveEdit();
    }

    this.startEdit(cell);
  }

  /**
   * Start editing a cell
   */
  startEdit(cell) {
    const field = cell.dataset.editable;
    const type = cell.dataset.type || 'text';
    const value = cell.dataset.value || cell.textContent.trim();
    const rowId = cell.closest('tr')?.dataset.id;

    this.activeCell = cell;
    this.originalValue = value;

    // Store original content
    cell.dataset.originalContent = cell.innerHTML;

    // Create input based on type
    let input;
    
    switch (type) {
      case 'select':
        input = this.createSelect(cell, value);
        break;
      case 'date':
        input = this.createDateInput(value);
        break;
      case 'number':
        input = this.createNumberInput(value, cell.dataset);
        break;
      case 'textarea':
        input = this.createTextarea(value);
        break;
      default:
        input = this.createTextInput(value);
    }

    // Add classes for styling
    cell.classList.add('editing');
    cell.innerHTML = '';
    cell.appendChild(input);
    
    // Focus and select
    input.focus();
    if (input.select) input.select();

    // Store reference
    input.dataset.field = field;
    input.dataset.rowId = rowId;
  }

  /**
   * Create text input
   */
  createTextInput(value) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = value;
    return input;
  }

  /**
   * Create number input
   */
  createNumberInput(value, dataset) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'inline-edit-input';
    input.value = value;
    if (dataset.min) input.min = dataset.min;
    if (dataset.max) input.max = dataset.max;
    if (dataset.step) input.step = dataset.step;
    return input;
  }

  /**
   * Create date input
   */
  createDateInput(value) {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'inline-edit-input';
    input.value = value ? value.slice(0, 10) : '';
    return input;
  }

  /**
   * Create textarea
   */
  createTextarea(value) {
    const textarea = document.createElement('textarea');
    textarea.className = 'inline-edit-input inline-edit-textarea';
    textarea.value = value;
    textarea.rows = 3;
    return textarea;
  }

  /**
   * Create select dropdown
   */
  createSelect(cell, value) {
    const select = document.createElement('select');
    select.className = 'inline-edit-input';
    
    // Get options from data attribute
    const optionsStr = cell.dataset.options;
    if (optionsStr) {
      try {
        const options = JSON.parse(optionsStr);
        options.forEach(opt => {
          const option = document.createElement('option');
          if (typeof opt === 'object') {
            option.value = opt.value;
            option.textContent = opt.label;
          } else {
            option.value = opt;
            option.textContent = opt;
          }
          if (option.value === value) option.selected = true;
          select.appendChild(option);
        });
      } catch (e) {
        console.error('Invalid options JSON:', e);
      }
    }
    
    return select;
  }

  /**
   * Handle keyboard events
   */
  handleKeydown(e) {
    if (!this.activeCell) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.saveEdit();
      this.moveToNextEditable(e.shiftKey);
    }
  }

  /**
   * Handle click outside to save
   */
  handleClickOutside(e) {
    if (!this.activeCell) return;
    
    if (!this.activeCell.contains(e.target)) {
      this.saveEdit();
    }
  }

  /**
   * Save the edit
   */
  async saveEdit() {
    if (!this.activeCell) return;

    const input = this.activeCell.querySelector('.inline-edit-input');
    if (!input) return;

    const newValue = input.value;
    const field = input.dataset.field;
    const rowId = input.dataset.rowId;
    const row = this.activeCell.closest('tr');

    // Check if value changed
    if (newValue === this.originalValue) {
      this.cancelEdit();
      return;
    }

    // Show saving state
    this.activeCell.classList.add('saving');
    this.activeCell.innerHTML = `
      <span class="inline-edit-saving">
        <span class="spinner"></span> Saving...
      </span>
    `;

    try {
      // Call save callback
      await this.options.onSave({
        field,
        value: newValue,
        oldValue: this.originalValue,
        rowId,
        row,
        cell: this.activeCell
      });

      // Update cell with new value
      this.activeCell.classList.remove('editing', 'saving');
      this.activeCell.classList.add('saved');
      
      // Display the new value (formatted if needed)
      this.activeCell.textContent = this.formatDisplayValue(newValue, this.activeCell.dataset.type);
      this.activeCell.dataset.value = newValue;

      // Flash success
      setTimeout(() => {
        this.activeCell.classList.remove('saved');
      }, 1500);

      // Show toast
      if (window.toast) {
        window.toast.success('Changes saved');
      }

    } catch (error) {
      // Restore original value
      this.activeCell.innerHTML = this.activeCell.dataset.originalContent;
      this.activeCell.classList.remove('editing', 'saving');
      this.activeCell.classList.add('error');

      setTimeout(() => {
        this.activeCell.classList.remove('error');
      }, 1500);

      // Show error
      if (window.toast) {
        window.toast.error('Failed to save: ' + (error.message || 'Unknown error'));
      }
    }

    this.activeCell = null;
    this.originalValue = null;
  }

  /**
   * Cancel the edit
   */
  cancelEdit() {
    if (!this.activeCell) return;

    this.activeCell.innerHTML = this.activeCell.dataset.originalContent;
    this.activeCell.classList.remove('editing');

    this.activeCell = null;
    this.originalValue = null;
  }

  /**
   * Move to next editable cell
   */
  moveToNextEditable(reverse = false) {
    const editables = document.querySelectorAll('[data-editable]');
    const current = Array.from(editables).indexOf(this.activeCell);
    
    let next;
    if (reverse) {
      next = editables[current - 1] || editables[editables.length - 1];
    } else {
      next = editables[current + 1] || editables[0];
    }

    if (next) {
      this.startEdit(next);
    }
  }

  /**
   * Format value for display
   */
  formatDisplayValue(value, type) {
    switch (type) {
      case 'number':
        return new Intl.NumberFormat().format(value);
      case 'date':
        return value ? new Date(value).toLocaleDateString() : '';
      default:
        return value;
    }
  }

  /**
   * Enable inline editing on a table
   */
  enableOnTable(table, config = {}) {
    if (typeof table === 'string') {
      table = document.querySelector(table);
    }
    if (!table) return;

    table.classList.add('table-inline-edit');
    
    // Mark editable columns
    if (config.columns) {
      config.columns.forEach(col => {
        table.querySelectorAll(`td[data-field="${col.field}"]`).forEach(cell => {
          cell.dataset.editable = col.field;
          cell.dataset.type = col.type || 'text';
          if (col.options) {
            cell.dataset.options = JSON.stringify(col.options);
          }
        });
      });
    }
  }

  addStyles() {
    if (document.getElementById('inline-editor-styles')) return;

    const style = document.createElement('style');
    style.id = 'inline-editor-styles';
    style.textContent = `
      [data-editable] {
        cursor: pointer;
        position: relative;
        transition: background 0.2s;
      }

      [data-editable]:hover {
        background: rgba(59, 130, 246, 0.05);
      }

      [data-editable]::after {
        content: '✎';
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        opacity: 0;
        font-size: 12px;
        color: var(--muted, #6b7280);
        transition: opacity 0.2s;
      }

      [data-editable]:hover::after {
        opacity: 0.5;
      }

      [data-editable].editing {
        padding: 4px !important;
        background: rgba(59, 130, 246, 0.1);
      }

      [data-editable].editing::after {
        display: none;
      }

      .inline-edit-input {
        width: 100%;
        padding: 8px 12px;
        border: 2px solid var(--primary, #3b82f6);
        border-radius: 6px;
        font-size: inherit;
        font-family: inherit;
        background: var(--card, #fff);
        color: var(--text-primary, #1f2937);
        outline: none;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
      }

      .inline-edit-textarea {
        min-height: 80px;
        resize: vertical;
      }

      .inline-edit-saving {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--muted, #6b7280);
        font-size: 13px;
      }

      .inline-edit-saving .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid var(--border-light, #e5e7eb);
        border-top-color: var(--primary, #3b82f6);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      [data-editable].saved {
        animation: savedFlash 0.5s ease;
      }

      @keyframes savedFlash {
        0%, 100% { background: transparent; }
        50% { background: rgba(16, 185, 129, 0.2); }
      }

      [data-editable].error {
        animation: errorFlash 0.3s ease;
      }

      @keyframes errorFlash {
        0%, 100% { background: transparent; }
        50% { background: rgba(239, 68, 68, 0.2); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Global instance
window.inlineEditor = new InlineEditor();
