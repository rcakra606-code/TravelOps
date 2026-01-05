/**
 * Saved Filter Presets Manager
 * Allow users to save and load filter combinations
 */

class SavedFilters {
  constructor() {
    this.storageKey = 'travelops_saved_filters';
    this.currentDashboard = this.detectDashboard();
    this.init();
  }

  detectDashboard() {
    const path = window.location.pathname;
    if (path.includes('sales')) return 'sales';
    if (path.includes('tours') || path.includes('my-tours')) return 'tours';
    if (path.includes('documents')) return 'documents';
    if (path.includes('tracking')) return 'tracking';
    if (path.includes('targets')) return 'targets';
    if (path.includes('telecom')) return 'telecom';
    if (path.includes('hotel')) return 'hotel';
    if (path.includes('overtime')) return 'overtime';
    if (path.includes('cruise')) return 'cruise';
    if (path.includes('outstanding')) return 'outstanding';
    return 'general';
  }

  init() {
    this.addStyles();
    this.createUI();
  }

  getSavedFilters() {
    try {
      const all = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      return all[this.currentDashboard] || [];
    } catch {
      return [];
    }
  }

  saveFilter(name, filterData) {
    try {
      const all = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      if (!all[this.currentDashboard]) all[this.currentDashboard] = [];
      
      // Check for duplicate name
      const existing = all[this.currentDashboard].findIndex(f => f.name === name);
      const preset = {
        id: existing >= 0 ? all[this.currentDashboard][existing].id : Date.now(),
        name,
        filters: filterData,
        createdAt: new Date().toISOString()
      };
      
      if (existing >= 0) {
        all[this.currentDashboard][existing] = preset;
      } else {
        all[this.currentDashboard].push(preset);
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(all));
      this.updateUI();
      window.toast?.success(`Filter "${name}" saved`);
      return true;
    } catch (err) {
      console.error('Failed to save filter:', err);
      window.toast?.error('Failed to save filter');
      return false;
    }
  }

  deleteFilter(id) {
    try {
      const all = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      if (all[this.currentDashboard]) {
        all[this.currentDashboard] = all[this.currentDashboard].filter(f => f.id !== id);
        localStorage.setItem(this.storageKey, JSON.stringify(all));
        this.updateUI();
        window.toast?.success('Filter preset deleted');
      }
    } catch (err) {
      console.error('Failed to delete filter:', err);
    }
  }

  loadFilter(id) {
    const presets = this.getSavedFilters();
    const preset = presets.find(f => f.id === id);
    if (preset && this.onLoadCallback) {
      this.onLoadCallback(preset.filters);
      window.toast?.info(`Loaded filter: ${preset.name}`);
    }
  }

  getCurrentFilters() {
    if (this.getFiltersCallback) {
      return this.getFiltersCallback();
    }
    return {};
  }

  onLoad(callback) {
    this.onLoadCallback = callback;
  }

  getFilters(callback) {
    this.getFiltersCallback = callback;
  }

  createUI() {
    // Create floating save button if filter controls exist
    const filterContainer = document.querySelector('.card') || document.querySelector('.filter-section');
    if (!filterContainer) return;

    // Find or create button container
    let btnContainer = document.querySelector('.saved-filters-container');
    if (!btnContainer) {
      btnContainer = document.createElement('div');
      btnContainer.className = 'saved-filters-container';
      
      // Try to insert near filter button
      const filterBtn = document.querySelector('[id*="FilterBtn"], [id*="filterBtn"], #clearFilters');
      if (filterBtn && filterBtn.parentElement) {
        filterBtn.parentElement.appendChild(btnContainer);
      }
    }

    btnContainer.innerHTML = `
      <div class="saved-filters-dropdown">
        <button class="btn saved-filters-btn" id="savedFiltersBtn" title="Saved Filters">
          ⭐ Saved
        </button>
        <div class="saved-filters-menu" id="savedFiltersMenu">
          <div class="saved-filters-header">
            <span>📁 Saved Filters</span>
            <button class="save-current-btn" id="saveCurrentFilterBtn" title="Save current filters">
              + Save Current
            </button>
          </div>
          <div class="saved-filters-list" id="savedFiltersList">
            <!-- Populated dynamically -->
          </div>
        </div>
      </div>
    `;

    this.updateUI();
    this.bindEvents();
  }

  updateUI() {
    const list = document.getElementById('savedFiltersList');
    if (!list) return;

    const presets = this.getSavedFilters();
    
    if (presets.length === 0) {
      list.innerHTML = '<div class="no-presets">No saved filters yet</div>';
      return;
    }

    list.innerHTML = presets.map(preset => `
      <div class="saved-filter-item" data-id="${preset.id}">
        <button class="load-filter-btn" data-id="${preset.id}">
          <span class="filter-name">${preset.name}</span>
          <span class="filter-date">${new Date(preset.createdAt).toLocaleDateString()}</span>
        </button>
        <button class="delete-filter-btn" data-id="${preset.id}" title="Delete">🗑️</button>
      </div>
    `).join('');
  }

  bindEvents() {
    // Toggle dropdown
    document.getElementById('savedFiltersBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('savedFiltersMenu');
      menu?.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.saved-filters-dropdown')) {
        document.getElementById('savedFiltersMenu')?.classList.remove('show');
      }
    });

    // Save current filter
    document.getElementById('saveCurrentFilterBtn')?.addEventListener('click', () => {
      const name = prompt('Enter a name for this filter preset:');
      if (name && name.trim()) {
        const filters = this.getCurrentFilters();
        this.saveFilter(name.trim(), filters);
      }
    });

    // Event delegation for load/delete
    document.getElementById('savedFiltersList')?.addEventListener('click', (e) => {
      const loadBtn = e.target.closest('.load-filter-btn');
      const deleteBtn = e.target.closest('.delete-filter-btn');
      
      if (loadBtn) {
        const id = parseInt(loadBtn.dataset.id);
        this.loadFilter(id);
        document.getElementById('savedFiltersMenu')?.classList.remove('show');
      }
      
      if (deleteBtn) {
        e.stopPropagation();
        const id = parseInt(deleteBtn.dataset.id);
        if (confirm('Delete this filter preset?')) {
          this.deleteFilter(id);
        }
      }
    });
  }

  addStyles() {
    if (document.getElementById('savedFiltersStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'savedFiltersStyles';
    style.textContent = `
      .saved-filters-container {
        display: inline-block;
        margin-left: 8px;
      }

      .saved-filters-dropdown {
        position: relative;
        display: inline-block;
      }

      .saved-filters-btn {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s;
      }

      .saved-filters-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
      }

      .saved-filters-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 280px;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        z-index: 1000;
        display: none;
        overflow: hidden;
      }

      .saved-filters-menu.show {
        display: block;
        animation: slideDown 0.2s ease;
      }

      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .saved-filters-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--bg-alt, #f9fafb);
        border-bottom: 1px solid var(--border-light, #e5e7eb);
        font-weight: 600;
        font-size: 14px;
      }

      .save-current-btn {
        background: var(--primary, #3b82f6);
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .save-current-btn:hover {
        background: #2563eb;
      }

      .saved-filters-list {
        max-height: 300px;
        overflow-y: auto;
      }

      .no-presets {
        padding: 24px;
        text-align: center;
        color: var(--text-secondary, #6b7280);
        font-size: 14px;
      }

      .saved-filter-item {
        display: flex;
        align-items: center;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .saved-filter-item:last-child {
        border-bottom: none;
      }

      .load-filter-btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 12px 16px;
        background: none;
        border: none;
        cursor: pointer;
        transition: background 0.2s;
        text-align: left;
      }

      .load-filter-btn:hover {
        background: var(--bg-alt, #f9fafb);
      }

      .filter-name {
        font-weight: 600;
        color: var(--text-primary, #1f2937);
        font-size: 14px;
      }

      .filter-date {
        font-size: 11px;
        color: var(--text-secondary, #6b7280);
        margin-top: 2px;
      }

      .delete-filter-btn {
        padding: 8px 12px;
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.5;
        transition: all 0.2s;
      }

      .delete-filter-btn:hover {
        opacity: 1;
        background: #fee2e2;
        color: #dc2626;
      }

      /* Dark mode */
      [data-theme="dark"] .saved-filters-menu {
        background: var(--card, #1e293b);
        border-color: var(--border-light, #334155);
      }

      [data-theme="dark"] .saved-filters-header {
        background: var(--bg-alt, #0f172a);
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize globally
window.savedFilters = new SavedFilters();
