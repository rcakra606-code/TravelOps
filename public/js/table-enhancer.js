/**
 * Table Enhancement Utilities
 * Provides advanced table features: multi-select, inline editing, row expansion, etc.
 */

class TableEnhancer {
  constructor(tableId, options = {}) {
    this.table = document.getElementById(tableId);
    if (!this.table) return;

    this.options = {
      multiSelect: options.multiSelect !== false,
      inlineEdit: options.inlineEdit || false,
      expandable: options.expandable || false,
      stickyHeader: options.stickyHeader !== false,
      hoverHighlight: options.hoverHighlight !== false,
      zebraStripe: options.zebraStripe !== false,
      ...options
    };

    this.selectedRows = new Set();
    this.init();
  }

  init() {
    // Add CSS classes
    if (this.options.stickyHeader) this.table.classList.add('table-sticky');
    if (this.options.zebraStripe) this.table.classList.add('table-striped');

    // Initialize features
    if (this.options.multiSelect) this.initMultiSelect();
    if (this.options.inlineEdit) this.initInlineEdit();
    if (this.options.expandable) this.initExpandable();
    
    // Add stagger animation to rows
    this.addStaggerAnimation();
  }

  initMultiSelect() {
    const thead = this.table.querySelector('thead tr');
    if (!thead) return;

    // Add header checkbox
    const th = document.createElement('th');
    th.innerHTML = '<input type="checkbox" class="table-checkbox" id="selectAll">';
    thead.insertBefore(th, thead.firstChild);

    // Add checkbox to each row
    const rows = this.table.querySelectorAll('tbody tr');
    rows.forEach((row, index) => {
      const td = document.createElement('td');
      td.innerHTML = `<input type="checkbox" class="table-checkbox row-checkbox" data-row-id="${index}">`;
      row.insertBefore(td, row.firstChild);
    });

    // Handle select all
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const checkboxes = this.table.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
          cb.checked = e.target.checked;
          this.toggleRowSelection(cb.closest('tr'), e.target.checked);
        });
        this.updateBatchBar();
      });
    }

    // Handle individual checkboxes
    this.table.addEventListener('change', (e) => {
      if (e.target.classList.contains('row-checkbox')) {
        const row = e.target.closest('tr');
        this.toggleRowSelection(row, e.target.checked);
        this.updateBatchBar();
      }
    });

    this.createBatchBar();
  }

  toggleRowSelection(row, selected) {
    if (selected) {
      row.classList.add('selected');
      this.selectedRows.add(row);
    } else {
      row.classList.remove('selected');
      this.selectedRows.delete(row);
    }
  }

  createBatchBar() {
    if (document.getElementById('batchActionsBar')) return;

    const bar = document.createElement('div');
    bar.id = 'batchActionsBar';
    bar.className = 'batch-actions-bar';
    bar.innerHTML = `
      <span class="count">0 selected</span>
      <button onclick="tableEnhancer.deleteSelected()">Delete</button>
      <button onclick="tableEnhancer.exportSelected()">Export</button>
      <button onclick="tableEnhancer.clearSelection()">Clear</button>
    `;
    document.body.appendChild(bar);
  }

  updateBatchBar() {
    const bar = document.getElementById('batchActionsBar');
    if (!bar) return;

    const count = this.selectedRows.size;
    bar.querySelector('.count').textContent = `${count} selected`;
    
    if (count > 0) {
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
    }
  }

  deleteSelected() {
    if (this.selectedRows.size === 0) return;
    
    confirmDialog.custom({
      title: 'Delete Selected Items',
      message: `Are you sure you want to delete ${this.selectedRows.size} item(s)?`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    }).then(confirmed => {
      if (confirmed) {
        this.selectedRows.forEach(row => row.remove());
        this.selectedRows.clear();
        this.updateBatchBar();
        toast.success(`${this.selectedRows.size} items deleted`);
      }
    });
  }

  exportSelected() {
    if (this.selectedRows.size === 0) return;
    
    const data = [];
    this.selectedRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      const rowData = {};
      cells.forEach((cell, i) => {
        if (i > 0) { // Skip checkbox column
          const header = this.table.querySelectorAll('th')[i].textContent;
          rowData[header] = cell.textContent.trim();
        }
      });
      data.push(rowData);
    });

    exportUtils.toCSV(data, 'selected_items');
    toast.success('Selected items exported');
  }

  clearSelection() {
    const checkboxes = this.table.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    this.selectedRows.forEach(row => row.classList.remove('selected'));
    this.selectedRows.clear();
    this.updateBatchBar();
  }

  initInlineEdit() {
    this.table.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td');
      if (!td || td.classList.contains('no-edit')) return;

      const currentValue = td.textContent.trim();
      const input = document.createElement('input');
      input.value = currentValue;
      input.className = 'inline-edit-input';
      
      td.textContent = '';
      td.appendChild(input);
      input.focus();
      input.select();

      const finishEdit = () => {
        const newValue = input.value;
        td.textContent = newValue;
        if (newValue !== currentValue && this.options.onEdit) {
          this.options.onEdit(td, newValue, currentValue);
        }
      };

      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEdit();
        if (e.key === 'Escape') {
          td.textContent = currentValue;
        }
      });
    });
  }

  initExpandable() {
    const rows = this.table.querySelectorAll('tbody tr');
    rows.forEach((row, index) => {
      row.classList.add('expandable');
      row.dataset.rowId = index;
      
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        this.toggleExpand(row);
      });
    });
  }

  toggleExpand(row) {
    const isExpanded = row.classList.contains('expanded');
    
    if (isExpanded) {
      row.classList.remove('expanded');
      const detailRow = row.nextElementSibling;
      if (detailRow && detailRow.classList.contains('expanded-content')) {
        detailRow.remove();
      }
    } else {
      row.classList.add('expanded');
      const detailRow = this.createDetailRow(row);
      row.after(detailRow);
    }
  }

  createDetailRow(row) {
    const tr = document.createElement('tr');
    tr.className = 'expanded-content';
    
    const td = document.createElement('td');
    td.colSpan = row.cells.length;
    
    const cells = row.querySelectorAll('td');
    const headers = this.table.querySelectorAll('th');
    
    let html = '<div class="row-details"><div class="row-details-grid">';
    cells.forEach((cell, i) => {
      if (i === 0) return; // Skip checkbox
      const label = headers[i]?.textContent || `Field ${i}`;
      const value = cell.textContent.trim() || '—';
      html += `
        <div class="row-details-item">
          <div class="row-details-label">${label}</div>
          <div class="row-details-value">${value}</div>
        </div>
      `;
    });
    html += '</div></div>';
    
    td.innerHTML = html;
    tr.appendChild(td);
    return tr;
  }

  addStaggerAnimation() {
    const rows = this.table.querySelectorAll('tbody tr');
    rows.forEach((row, index) => {
      if (index < 10) { // Only first 10 rows
        row.classList.add('stagger-item');
      }
    });
  }

  showSkeleton(rowCount = 5) {
    const tbody = this.table.querySelector('tbody');
    if (!tbody) return;

    const colCount = this.table.querySelectorAll('thead th').length;
    tbody.innerHTML = '';

    for (let i = 0; i < rowCount; i++) {
      const tr = document.createElement('tr');
      for (let j = 0; j < colCount; j++) {
        const td = document.createElement('td');
        td.innerHTML = '<div class="skeleton"></div>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  showEmptyState(message = 'No data available', icon = '📭') {
    const tbody = this.table.querySelector('tbody');
    if (!tbody) return;

    const colCount = this.table.querySelectorAll('thead th').length;
    tbody.innerHTML = `
      <tr>
        <td colspan="${colCount}">
          <div class="empty-state">
            <div class="empty-state-icon">${icon}</div>
            <div class="empty-state-title">No Data Found</div>
            <div class="empty-state-description">${message}</div>
          </div>
        </td>
      </tr>
    `;
  }
}

// Global instance
let tableEnhancer;

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TableEnhancer = TableEnhancer;
}
