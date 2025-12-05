/**
 * Dashboard Customization Manager
 * Drag-drop widgets, save layouts, customize dashboard
 */

class DashboardCustomizer {
  constructor() {
    this.widgets = [];
    this.layout = null;
    this.isEditMode = false;
    this.draggedWidget = null;
  }

  /**
   * Initialize dashboard customization
   */
  init(containerSelector = '.dashboard-widgets') {
    this.container = document.querySelector(containerSelector);
    if (!this.container) return;

    this.loadLayout();
    this.setupWidgets();
    this.addCustomizeButton();
  }

  /**
   * Setup draggable widgets
   */
  setupWidgets() {
    const widgets = this.container.querySelectorAll('.dashboard-widget');
    
    widgets.forEach((widget, index) => {
      widget.setAttribute('draggable', 'true');
      widget.dataset.widgetId = widget.dataset.widgetId || `widget-${index}`;
      
      // Add drag handle
      const header = widget.querySelector('.widget-header');
      if (header && !header.querySelector('.widget-drag-handle')) {
        const dragHandle = document.createElement('button');
        dragHandle.className = 'widget-action-btn widget-drag-handle';
        dragHandle.innerHTML = '⋮⋮';
        dragHandle.title = 'Drag to reorder';
        header.querySelector('.widget-actions')?.prepend(dragHandle);
      }

      // Drag events
      widget.addEventListener('dragstart', (e) => this.handleDragStart(e));
      widget.addEventListener('dragend', (e) => this.handleDragEnd(e));
      widget.addEventListener('dragover', (e) => this.handleDragOver(e));
      widget.addEventListener('drop', (e) => this.handleDrop(e));
    });
  }

  /**
   * Drag event handlers
   */
  handleDragStart(e) {
    if (!this.isEditMode) {
      e.preventDefault();
      return;
    }

    this.draggedWidget = e.currentTarget;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
  }

  handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    
    // Remove drag-over class from all widgets
    this.container.querySelectorAll('.dashboard-widget').forEach(w => {
      w.classList.remove('drag-over');
    });
  }

  handleDragOver(e) {
    if (!this.isEditMode) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const afterElement = this.getDragAfterElement(e.clientY);
    const draggable = this.draggedWidget;

    if (afterElement == null) {
      this.container.appendChild(draggable);
    } else {
      this.container.insertBefore(draggable, afterElement);
    }
  }

  handleDrop(e) {
    if (!this.isEditMode) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    this.saveLayout();
    return false;
  }

  getDragAfterElement(y) {
    const draggableElements = [...this.container.querySelectorAll('.dashboard-widget:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  /**
   * Add customize button
   */
  addCustomizeButton() {
    if (document.getElementById('customizeDashboardBtn')) return;

    const button = document.createElement('button');
    button.id = 'customizeDashboardBtn';
    button.className = 'customize-dashboard-btn';
    button.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
      </svg>
    `;
    button.title = 'Customize Dashboard';
    button.onclick = () => this.toggleEditMode();
    
    document.body.appendChild(button);

    // Add edit mode bar
    this.createEditModeBar();
  }

  /**
   * Create edit mode bar
   */
  createEditModeBar() {
    if (document.getElementById('dashboardEditMode')) return;

    const bar = document.createElement('div');
    bar.id = 'dashboardEditMode';
    bar.className = 'dashboard-edit-mode';
    bar.innerHTML = `
      <div class="edit-mode-text">
        <span>🎨</span>
        <span>Drag widgets to rearrange • Changes will be saved</span>
      </div>
      <div class="edit-mode-actions">
        <button class="edit-mode-btn edit-mode-save">Save Layout</button>
        <button class="edit-mode-btn edit-mode-cancel">Cancel</button>
      </div>
    `;

    document.body.appendChild(bar);

    // Event listeners
    bar.querySelector('.edit-mode-save').onclick = () => {
      this.saveLayout();
      this.toggleEditMode();
      if (window.showToast) {
        showToast('Layout saved successfully', 'success');
      }
    };

    bar.querySelector('.edit-mode-cancel').onclick = () => {
      this.loadLayout();
      this.toggleEditMode();
    };
  }

  /**
   * Toggle edit mode
   */
  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    const bar = document.getElementById('dashboardEditMode');
    
    if (this.isEditMode) {
      bar.classList.add('active');
      this.container.style.userSelect = 'none';
    } else {
      bar.classList.remove('active');
      this.container.style.userSelect = '';
    }
  }

  /**
   * Save layout to localStorage
   */
  saveLayout() {
    const widgets = this.container.querySelectorAll('.dashboard-widget');
    const layout = Array.from(widgets).map(w => w.dataset.widgetId);
    
    const pageName = this.getPageName();
    localStorage.setItem(`dashboard-layout-${pageName}`, JSON.stringify(layout));
  }

  /**
   * Load layout from localStorage
   */
  loadLayout() {
    const pageName = this.getPageName();
    const saved = localStorage.getItem(`dashboard-layout-${pageName}`);
    
    if (!saved) return;

    try {
      const layout = JSON.parse(saved);
      const widgets = this.container.querySelectorAll('.dashboard-widget');
      const widgetMap = new Map();
      
      widgets.forEach(w => widgetMap.set(w.dataset.widgetId, w));
      
      // Reorder based on saved layout
      layout.forEach(id => {
        const widget = widgetMap.get(id);
        if (widget) {
          this.container.appendChild(widget);
        }
      });
    } catch (e) {
      console.error('Failed to load dashboard layout:', e);
    }
  }

  /**
   * Reset layout
   */
  resetLayout() {
    const pageName = this.getPageName();
    localStorage.removeItem(`dashboard-layout-${pageName}`);
    
    if (window.showToast) {
      showToast('Layout reset to default', 'info');
    }
    
    setTimeout(() => location.reload(), 500);
  }

  /**
   * Get current page name
   */
  getPageName() {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1);
    return page.replace('.html', '') || 'dashboard';
  }
}

// Column Toggle Manager
class ColumnToggleManager {
  constructor(tableSelector) {
    this.table = document.querySelector(tableSelector);
    this.panel = null;
    this.columns = [];
    this.hiddenColumns = new Set();
    
    if (this.table) {
      this.init();
    }
  }

  init() {
    this.extractColumns();
    this.loadHiddenColumns();
    this.createToggleButton();
    this.applyColumnVisibility();
  }

  extractColumns() {
    const headers = this.table.querySelectorAll('thead th');
    this.columns = Array.from(headers).map((th, index) => ({
      index,
      name: th.textContent.trim(),
      key: this.sanitizeColumnName(th.textContent)
    }));
  }

  sanitizeColumnName(name) {
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  createToggleButton() {
    const container = this.table.parentElement;
    const button = document.createElement('button');
    button.className = 'btn btn-sm';
    button.innerHTML = '⚙️ Columns';
    button.onclick = (e) => this.togglePanel(e);
    
    // Find or create toolbar
    let toolbar = container.querySelector('.table-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'table-toolbar';
      toolbar.style.cssText = 'display: flex; justify-content: flex-end; margin-bottom: 12px;';
      container.insertBefore(toolbar, this.table);
    }
    
    toolbar.appendChild(button);
  }

  togglePanel(e) {
    if (this.panel && this.panel.style.display === 'block') {
      this.closePanel();
    } else {
      this.openPanel(e.currentTarget);
    }
  }

  openPanel(button) {
    if (!this.panel) {
      this.createPanel();
    }

    const rect = button.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 8}px`;
    this.panel.style.right = `${window.innerWidth - rect.right}px`;
    this.panel.style.display = 'block';

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler);
    }, 0);
  }

  closePanel() {
    if (this.panel) {
      this.panel.style.display = 'none';
      document.removeEventListener('click', this.outsideClickHandler);
    }
  }

  outsideClickHandler = (e) => {
    if (this.panel && !this.panel.contains(e.target)) {
      this.closePanel();
    }
  }

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'column-toggle-panel';
    this.panel.style.display = 'none';
    
    this.panel.innerHTML = `
      <div class="column-toggle-header">
        <div class="column-toggle-title">Toggle Columns</div>
      </div>
      <div class="column-toggle-list">
        ${this.columns.map(col => `
          <div class="column-toggle-item">
            <input type="checkbox" 
                   id="col-${col.key}" 
                   ${!this.hiddenColumns.has(col.index) ? 'checked' : ''}
                   data-column-index="${col.index}">
            <label for="col-${col.key}">${col.name}</label>
          </div>
        `).join('')}
      </div>
      <div class="column-toggle-footer">
        <button class="column-toggle-apply">Apply</button>
        <button class="column-toggle-reset">Reset</button>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Event listeners
    this.panel.querySelector('.column-toggle-apply').onclick = () => {
      this.applyChanges();
      this.closePanel();
    };

    this.panel.querySelector('.column-toggle-reset').onclick = () => {
      this.resetColumns();
    };

    // Prevent panel click from closing
    this.panel.onclick = (e) => e.stopPropagation();
  }

  applyChanges() {
    this.hiddenColumns.clear();
    
    const checkboxes = this.panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      if (!cb.checked) {
        this.hiddenColumns.add(parseInt(cb.dataset.columnIndex));
      }
    });

    this.saveHiddenColumns();
    this.applyColumnVisibility();
    
    if (window.showToast) {
      showToast('Column visibility updated', 'success');
    }
  }

  applyColumnVisibility() {
    // Headers
    const headers = this.table.querySelectorAll('thead th');
    headers.forEach((th, index) => {
      th.classList.toggle('column-hidden', this.hiddenColumns.has(index));
    });

    // Cells
    const rows = this.table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      cells.forEach((td, index) => {
        td.classList.toggle('column-hidden', this.hiddenColumns.has(index));
      });
    });
  }

  resetColumns() {
    this.hiddenColumns.clear();
    this.saveHiddenColumns();
    
    const checkboxes = this.panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
    
    this.applyColumnVisibility();
    
    if (window.showToast) {
      showToast('Columns reset to default', 'info');
    }
  }

  saveHiddenColumns() {
    const pageName = this.getPageName();
    const tableId = this.table.id || 'default';
    const key = `hidden-columns-${pageName}-${tableId}`;
    localStorage.setItem(key, JSON.stringify([...this.hiddenColumns]));
  }

  loadHiddenColumns() {
    const pageName = this.getPageName();
    const tableId = this.table.id || 'default';
    const key = `hidden-columns-${pageName}-${tableId}`;
    const saved = localStorage.getItem(key);
    
    if (saved) {
      try {
        this.hiddenColumns = new Set(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load hidden columns:', e);
      }
    }
  }

  getPageName() {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1);
    return page.replace('.html', '') || 'dashboard';
  }
}

// Global instances
if (typeof window !== 'undefined') {
  window.DashboardCustomizer = DashboardCustomizer;
  window.ColumnToggleManager = ColumnToggleManager;
}
