// ============================================
// ENHANCED SEARCH & FILTER SYSTEM v2
// Complete rewrite with advanced features
// ============================================

class EnhancedSearchFilter {
  constructor(options = {}) {
    this.containerId = options.containerId || 'searchFilterContainer';
    this.onFilter = options.onFilter || (() => {});
    this.searchFields = options.searchFields || ['name', 'code', 'notes', 'staff_name'];
    this.debounceMs = options.debounceMs || 300;
    this.entityType = options.entityType || 'records';
    
    this.data = [];
    this.filteredData = [];
    this.activeFilters = {};
    this.searchTerm = '';
    this.sortColumn = null;
    this.sortDirection = 'asc';
    
    this.searchHistory = JSON.parse(localStorage.getItem(`searchHistory_${this.entityType}`) || '[]');
    this.filterPresets = JSON.parse(localStorage.getItem(`filterPresets_${this.entityType}`) || '{}');
    this.debounceTimer = null;
  }

  init(container) {
    this.container = container || document.getElementById(this.containerId);
    if (!this.container) {
      console.warn('EnhancedSearchFilter: Container not found');
      return;
    }
    this.render();
    this.attachEvents();
    this.injectStyles();
  }

  render() {
    this.container.innerHTML = `
      <div class="esf-wrapper">
        <!-- Main Search Bar -->
        <div class="esf-search-row">
          <div class="esf-search-input-wrap">
            <span class="esf-search-icon">🔍</span>
            <input type="text" 
                   id="esfSearchInput" 
                   class="esf-search-input" 
                   placeholder="Search ${this.entityType}..."
                   autocomplete="off">
            <button class="esf-clear-btn" id="esfClearBtn" style="display:none;">✕</button>
            <div class="esf-search-history" id="esfSearchHistory"></div>
          </div>
          
          <button class="esf-filter-btn" id="esfFilterBtn">
            <span>⚙️ Filters</span>
            <span class="esf-filter-badge" id="esfFilterBadge" style="display:none;">0</span>
          </button>
          
          <button class="esf-sort-btn" id="esfSortBtn" title="Sort options">
            <span>↕️ Sort</span>
          </button>
        </div>

        <!-- Filter Panel -->
        <div class="esf-filter-panel" id="esfFilterPanel">
          <div class="esf-filter-header">
            <h4>🔍 Advanced Filters</h4>
            <div class="esf-filter-actions">
              <button class="esf-action-btn" id="esfSavePreset" title="Save filters">💾</button>
              <button class="esf-action-btn" id="esfLoadPreset" title="Load filters">📂</button>
              <button class="esf-action-btn esf-clear-all" id="esfClearAllFilters">✕ Clear</button>
            </div>
          </div>
          <div class="esf-filter-grid" id="esfFilterGrid"></div>
        </div>

        <!-- Sort Panel -->
        <div class="esf-sort-panel" id="esfSortPanel">
          <div class="esf-sort-header">
            <h4>↕️ Sort By</h4>
          </div>
          <div class="esf-sort-options" id="esfSortOptions"></div>
        </div>

        <!-- Active Filter Chips -->
        <div class="esf-chips" id="esfChips"></div>
        
        <!-- Results Summary -->
        <div class="esf-results-summary" id="esfResultsSummary"></div>
      </div>
    `;
  }

  injectStyles() {
    if (document.getElementById('esfStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'esfStyles';
    style.textContent = `
      .esf-wrapper { margin-bottom: 20px; }
      
      .esf-search-row {
        display: flex;
        gap: 10px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      
      .esf-search-input-wrap {
        flex: 1;
        min-width: 250px;
        position: relative;
      }
      
      .esf-search-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 16px;
        opacity: 0.5;
        pointer-events: none;
      }
      
      .esf-search-input {
        width: 100%;
        padding: 12px 40px 12px 44px;
        border: 2px solid var(--border-light, #e5e7eb);
        border-radius: 10px;
        font-size: 15px;
        background: var(--card, #fff);
        color: var(--text-primary, #111);
        transition: all 0.2s;
      }
      
      .esf-search-input:focus {
        outline: none;
        border-color: var(--primary, #3b82f6);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      
      .esf-clear-btn {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: var(--bg-alt, #f3f4f6);
        border: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .esf-clear-btn:hover { background: #e5e7eb; }
      
      .esf-search-history {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 10px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        z-index: 100;
        display: none;
        max-height: 200px;
        overflow-y: auto;
      }
      
      .esf-search-history.active { display: block; }
      
      .esf-history-item {
        padding: 10px 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid var(--border-light, #f3f4f6);
        transition: background 0.15s;
      }
      
      .esf-history-item:hover { background: var(--bg-alt, #f8fafc); }
      .esf-history-item:last-child { border-bottom: none; }
      
      .esf-history-icon { opacity: 0.4; font-size: 14px; }
      
      .esf-history-remove {
        margin-left: auto;
        opacity: 0;
        font-size: 12px;
        padding: 2px 6px;
        cursor: pointer;
      }
      
      .esf-history-item:hover .esf-history-remove { opacity: 0.6; }
      
      .esf-filter-btn, .esf-sort-btn {
        padding: 12px 18px;
        background: var(--card, #fff);
        border: 2px solid var(--border-light, #e5e7eb);
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s;
        white-space: nowrap;
      }
      
      .esf-filter-btn:hover, .esf-sort-btn:hover {
        border-color: var(--primary, #3b82f6);
        background: var(--bg-alt, #f8fafc);
      }
      
      .esf-filter-btn.active, .esf-sort-btn.active {
        background: var(--primary, #3b82f6);
        color: white;
        border-color: var(--primary, #3b82f6);
      }
      
      .esf-filter-badge {
        background: #ef4444;
        color: white;
        font-size: 11px;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 5px;
      }
      
      .esf-filter-panel, .esf-sort-panel {
        display: none;
        background: var(--card, #fff);
        border: 2px solid var(--border-light, #e5e7eb);
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 12px;
        animation: esfSlideDown 0.2s ease;
      }
      
      .esf-filter-panel.active, .esf-sort-panel.active { display: block; }
      
      @keyframes esfSlideDown {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .esf-filter-header, .esf-sort-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }
      
      .esf-filter-header h4, .esf-sort-header h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }
      
      .esf-filter-actions { display: flex; gap: 6px; }
      
      .esf-action-btn {
        padding: 6px 10px;
        background: var(--bg-alt, #f3f4f6);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s;
      }
      
      .esf-action-btn:hover { background: #e5e7eb; }
      .esf-action-btn.esf-clear-all { color: #ef4444; }
      
      .esf-filter-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 14px;
      }
      
      .esf-filter-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      
      .esf-filter-group label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary, #6b7280);
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      
      .esf-filter-group select,
      .esf-filter-group input {
        padding: 9px 11px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 7px;
        font-size: 13px;
        background: var(--bg, #fff);
        color: var(--text-primary, #111);
      }
      
      .esf-filter-group select:focus,
      .esf-filter-group input:focus {
        outline: none;
        border-color: var(--primary, #3b82f6);
      }
      
      .esf-date-range {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      
      .esf-date-range input { flex: 1; min-width: 0; }
      .esf-date-range span { color: var(--text-secondary); font-size: 12px; }
      
      .esf-date-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 5px;
      }
      
      .esf-date-preset {
        padding: 3px 7px;
        font-size: 10px;
        background: var(--bg-alt, #f3f4f6);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .esf-date-preset:hover {
        background: var(--primary, #3b82f6);
        color: white;
        border-color: var(--primary, #3b82f6);
      }
      
      .esf-sort-options {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .esf-sort-option {
        padding: 8px 14px;
        background: var(--bg-alt, #f3f4f6);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s;
      }
      
      .esf-sort-option:hover { border-color: var(--primary, #3b82f6); }
      
      .esf-sort-option.active {
        background: var(--primary, #3b82f6);
        color: white;
        border-color: var(--primary, #3b82f6);
      }
      
      .esf-sort-dir { font-size: 11px; }
      
      .esf-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }
      
      .esf-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
        animation: esfChipIn 0.2s ease;
      }
      
      @keyframes esfChipIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      
      .esf-chip-remove {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgba(255,255,255,0.25);
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        transition: background 0.15s;
      }
      
      .esf-chip-remove:hover { background: rgba(255,255,255,0.4); }
      
      .esf-results-summary {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
        padding: 8px 0;
      }
      
      .esf-results-summary strong { color: var(--primary, #3b82f6); }
      
      .search-highlight {
        background: #fef08a;
        padding: 1px 3px;
        border-radius: 2px;
        font-weight: 500;
      }
      
      /* Modal styles */
      .esf-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: esfFadeIn 0.15s ease;
      }
      
      @keyframes esfFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      .esf-modal-content {
        background: var(--card, #fff);
        border-radius: 12px;
        padding: 22px;
        width: 360px;
        max-width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        animation: esfSlideUp 0.2s ease;
      }
      
      @keyframes esfSlideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      .esf-modal h3 { margin: 0 0 14px 0; font-size: 16px; }
      
      .esf-modal input[type="text"] {
        width: 100%;
        padding: 10px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 14px;
        margin-bottom: 14px;
      }
      
      .esf-modal-btns {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      
      .esf-modal-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid var(--border-light, #e5e7eb);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.15s;
      }
      
      .esf-modal-btn.primary {
        background: var(--primary, #3b82f6);
        color: white;
        border-color: var(--primary, #3b82f6);
      }
      
      .esf-modal-btn.primary:hover { background: #2563eb; }
      
      .esf-preset-list { margin: 12px 0; }
      
      .esf-preset-item {
        padding: 10px 12px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 7px;
        margin-bottom: 6px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: all 0.15s;
      }
      
      .esf-preset-item:hover {
        border-color: var(--primary, #3b82f6);
        background: var(--bg-alt, #f8fafc);
      }
      
      .esf-preset-delete {
        color: #ef4444;
        padding: 4px 8px;
        font-size: 14px;
      }
      
      @media (max-width: 640px) {
        .esf-search-row { flex-direction: column; }
        .esf-filter-btn, .esf-sort-btn { width: 100%; justify-content: center; }
        .esf-filter-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  attachEvents() {
    const searchInput = document.getElementById('esfSearchInput');
    const clearBtn = document.getElementById('esfClearBtn');
    const filterBtn = document.getElementById('esfFilterBtn');
    const sortBtn = document.getElementById('esfSortBtn');
    const filterPanel = document.getElementById('esfFilterPanel');
    const sortPanel = document.getElementById('esfSortPanel');
    const clearAllBtn = document.getElementById('esfClearAllFilters');
    const savePresetBtn = document.getElementById('esfSavePreset');
    const loadPresetBtn = document.getElementById('esfLoadPreset');
    const historyDropdown = document.getElementById('esfSearchHistory');

    // Search input
    searchInput?.addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      clearBtn.style.display = this.searchTerm ? 'flex' : 'none';
      
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.applyAll(), this.debounceMs);
    });

    searchInput?.addEventListener('focus', () => this.showHistory());
    
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.searchTerm.trim()) {
        this.saveToHistory(this.searchTerm.trim());
        historyDropdown.classList.remove('active');
        this.applyAll();
      }
      if (e.key === 'Escape') {
        historyDropdown.classList.remove('active');
      }
    });

    // Clear search
    clearBtn?.addEventListener('click', () => {
      searchInput.value = '';
      this.searchTerm = '';
      clearBtn.style.display = 'none';
      this.applyAll();
    });

    // Filter toggle
    filterBtn?.addEventListener('click', () => {
      filterPanel.classList.toggle('active');
      sortPanel.classList.remove('active');
      filterBtn.classList.toggle('active', filterPanel.classList.contains('active'));
      sortBtn.classList.remove('active');
    });

    // Sort toggle
    sortBtn?.addEventListener('click', () => {
      sortPanel.classList.toggle('active');
      filterPanel.classList.remove('active');
      sortBtn.classList.toggle('active', sortPanel.classList.contains('active'));
      filterBtn.classList.remove('active');
    });

    // Clear all
    clearAllBtn?.addEventListener('click', () => this.clearAllFilters());

    // Save preset
    savePresetBtn?.addEventListener('click', () => this.showSaveModal());

    // Load preset
    loadPresetBtn?.addEventListener('click', () => this.showLoadModal());

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.esf-search-input-wrap')) {
        historyDropdown?.classList.remove('active');
      }
    });
  }

  setData(data) {
    this.data = data || [];
    this.filteredData = [...this.data];
    this.updateResultsSummary();
  }

  setupFilters(config) {
    const grid = document.getElementById('esfFilterGrid');
    if (!grid) return;

    this.filterConfig = config;
    grid.innerHTML = config.map(f => this.renderFilter(f)).join('');
    this.attachFilterEvents();
  }

  renderFilter(f) {
    switch (f.type) {
      case 'select':
        return `
          <div class="esf-filter-group">
            <label>${f.label}</label>
            <select data-filter="${f.id}">
              <option value="">All</option>
              ${f.options.map(o => {
                const val = typeof o === 'object' ? o.value : o;
                const lbl = typeof o === 'object' ? o.label : o;
                return `<option value="${val}">${lbl}</option>`;
              }).join('')}
            </select>
          </div>
        `;
        
      case 'daterange':
        return `
          <div class="esf-filter-group" style="grid-column: span 2;">
            <label>${f.label}</label>
            <div class="esf-date-range">
              <input type="date" data-filter="${f.id}_from">
              <span>to</span>
              <input type="date" data-filter="${f.id}_to">
            </div>
            <div class="esf-date-presets">
              <button class="esf-date-preset" data-preset="today" data-range="${f.id}">Today</button>
              <button class="esf-date-preset" data-preset="week" data-range="${f.id}">Week</button>
              <button class="esf-date-preset" data-preset="month" data-range="${f.id}">Month</button>
              <button class="esf-date-preset" data-preset="quarter" data-range="${f.id}">Quarter</button>
              <button class="esf-date-preset" data-preset="year" data-range="${f.id}">Year</button>
            </div>
          </div>
        `;
        
      case 'text':
        return `
          <div class="esf-filter-group">
            <label>${f.label}</label>
            <input type="text" data-filter="${f.id}" placeholder="Filter...">
          </div>
        `;
        
      case 'status':
        return `
          <div class="esf-filter-group">
            <label>${f.label}</label>
            <select data-filter="${f.id}">
              <option value="">All Status</option>
              ${(f.options || ['Pending', 'Completed', 'Cancelled']).map(s => 
                `<option value="${s}">${s}</option>`
              ).join('')}
            </select>
          </div>
        `;
        
      default:
        return '';
    }
  }

  attachFilterEvents() {
    // Selects and inputs
    document.querySelectorAll('#esfFilterGrid [data-filter]').forEach(el => {
      el.addEventListener('change', () => this.collectFilters());
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.addEventListener('input', () => {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => this.collectFilters(), this.debounceMs);
        });
      }
    });

    // Date presets
    document.querySelectorAll('.esf-date-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyDatePreset(btn.dataset.preset, btn.dataset.range);
      });
    });
  }

  setupSorting(columns) {
    const container = document.getElementById('esfSortOptions');
    if (!container) return;

    this.sortColumns = columns;
    container.innerHTML = columns.map(col => `
      <button class="esf-sort-option" data-sort="${col.id}">
        ${col.label}
        <span class="esf-sort-dir"></span>
      </button>
    `).join('');

    container.querySelectorAll('.esf-sort-option').forEach(btn => {
      btn.addEventListener('click', () => this.toggleSort(btn.dataset.sort));
    });
  }

  toggleSort(columnId) {
    if (this.sortColumn === columnId) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = columnId;
      this.sortDirection = 'asc';
    }
    
    // Update UI
    document.querySelectorAll('.esf-sort-option').forEach(btn => {
      const isActive = btn.dataset.sort === this.sortColumn;
      btn.classList.toggle('active', isActive);
      btn.querySelector('.esf-sort-dir').textContent = isActive 
        ? (this.sortDirection === 'asc' ? '↑' : '↓') 
        : '';
    });
    
    this.applyAll();
  }

  applyDatePreset(preset, rangeId) {
    const today = new Date();
    let from, to;

    switch (preset) {
      case 'today':
        from = to = today;
        break;
      case 'week':
        from = new Date(today);
        from.setDate(today.getDate() - today.getDay());
        to = today;
        break;
      case 'month':
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        to = today;
        break;
      case 'quarter':
        const q = Math.floor(today.getMonth() / 3);
        from = new Date(today.getFullYear(), q * 3, 1);
        to = today;
        break;
      case 'year':
        from = new Date(today.getFullYear(), 0, 1);
        to = today;
        break;
    }

    const fromEl = document.querySelector(`[data-filter="${rangeId}_from"]`);
    const toEl = document.querySelector(`[data-filter="${rangeId}_to"]`);
    
    if (fromEl) fromEl.value = from.toISOString().split('T')[0];
    if (toEl) toEl.value = to.toISOString().split('T')[0];
    
    this.collectFilters();
  }

  collectFilters() {
    this.activeFilters = {};
    
    document.querySelectorAll('#esfFilterGrid [data-filter]').forEach(el => {
      if (el.value) {
        this.activeFilters[el.dataset.filter] = el.value;
      }
    });

    this.updateChips();
    this.updateBadge();
    this.applyAll();
  }

  updateChips() {
    const container = document.getElementById('esfChips');
    if (!container) return;

    const chips = [];
    
    // Add search chip
    if (this.searchTerm) {
      chips.push(`
        <span class="esf-chip">
          🔍 "${this.searchTerm}"
          <button class="esf-chip-remove" data-action="clear-search">✕</button>
        </span>
      `);
    }
    
    // Add filter chips
    Object.entries(this.activeFilters).forEach(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      chips.push(`
        <span class="esf-chip">
          ${label}: ${value}
          <button class="esf-chip-remove" data-filter="${key}">✕</button>
        </span>
      `);
    });

    container.innerHTML = chips.join('');

    // Attach remove events
    container.querySelectorAll('.esf-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'clear-search') {
          document.getElementById('esfSearchInput').value = '';
          this.searchTerm = '';
          document.getElementById('esfClearBtn').style.display = 'none';
        } else {
          const el = document.querySelector(`[data-filter="${btn.dataset.filter}"]`);
          if (el) el.value = '';
          delete this.activeFilters[btn.dataset.filter];
        }
        this.updateChips();
        this.updateBadge();
        this.applyAll();
      });
    });
  }

  updateBadge() {
    const badge = document.getElementById('esfFilterBadge');
    const count = Object.keys(this.activeFilters).length;
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  clearAllFilters() {
    document.querySelectorAll('#esfFilterGrid [data-filter]').forEach(el => {
      el.value = '';
    });
    this.activeFilters = {};
    this.updateChips();
    this.updateBadge();
    this.applyAll();
  }

  applyAll() {
    const searchLower = this.searchTerm.toLowerCase().trim();
    
    // Filter
    this.filteredData = this.data.filter(item => {
      // Search
      if (searchLower) {
        const matches = this.searchFields.some(field => {
          const val = item[field];
          return val && String(val).toLowerCase().includes(searchLower);
        });
        if (!matches) return false;
      }

      // Filters
      for (const [key, value] of Object.entries(this.activeFilters)) {
        if (key.endsWith('_from')) {
          const base = key.replace('_from', '');
          if (item[base] && item[base] < value) return false;
        } else if (key.endsWith('_to')) {
          const base = key.replace('_to', '');
          if (item[base] && item[base] > value) return false;
        } else {
          if (String(item[key]).toLowerCase() !== value.toLowerCase()) return false;
        }
      }

      return true;
    });

    // Sort
    if (this.sortColumn) {
      this.filteredData.sort((a, b) => {
        let aVal = a[this.sortColumn];
        let bVal = b[this.sortColumn];
        
        // Handle numbers
        if (!isNaN(aVal) && !isNaN(bVal)) {
          aVal = parseFloat(aVal) || 0;
          bVal = parseFloat(bVal) || 0;
        } else {
          aVal = String(aVal || '').toLowerCase();
          bVal = String(bVal || '').toLowerCase();
        }

        if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    this.updateResultsSummary();
    this.onFilter(this.filteredData, this.activeFilters, this.searchTerm);
  }

  updateResultsSummary() {
    const el = document.getElementById('esfResultsSummary');
    if (!el) return;
    
    const total = this.data.length;
    const filtered = this.filteredData.length;
    
    if (total === filtered) {
      el.innerHTML = `Showing <strong>${total}</strong> ${this.entityType}`;
    } else {
      el.innerHTML = `Showing <strong>${filtered}</strong> of <strong>${total}</strong> ${this.entityType}`;
    }
  }

  // Search history
  showHistory() {
    const dropdown = document.getElementById('esfSearchHistory');
    if (!dropdown || this.searchHistory.length === 0) return;

    dropdown.innerHTML = this.searchHistory.slice(0, 6).map(term => `
      <div class="esf-history-item" data-term="${term}">
        <span class="esf-history-icon">🕒</span>
        <span>${term}</span>
        <span class="esf-history-remove" data-term="${term}">✕</span>
      </div>
    `).join('');

    dropdown.classList.add('active');

    dropdown.querySelectorAll('.esf-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('esf-history-remove')) {
          this.removeFromHistory(e.target.dataset.term);
          e.stopPropagation();
          return;
        }
        document.getElementById('esfSearchInput').value = item.dataset.term;
        this.searchTerm = item.dataset.term;
        document.getElementById('esfClearBtn').style.display = 'flex';
        dropdown.classList.remove('active');
        this.applyAll();
      });
    });
  }

  saveToHistory(term) {
    this.searchHistory = this.searchHistory.filter(t => t !== term);
    this.searchHistory.unshift(term);
    this.searchHistory = this.searchHistory.slice(0, 15);
    localStorage.setItem(`searchHistory_${this.entityType}`, JSON.stringify(this.searchHistory));
  }

  removeFromHistory(term) {
    this.searchHistory = this.searchHistory.filter(t => t !== term);
    localStorage.setItem(`searchHistory_${this.entityType}`, JSON.stringify(this.searchHistory));
    this.showHistory();
  }

  // Presets
  showSaveModal() {
    const modal = document.createElement('div');
    modal.className = 'esf-modal';
    modal.innerHTML = `
      <div class="esf-modal-content">
        <h3>💾 Save Filter Preset</h3>
        <input type="text" id="esfPresetName" placeholder="Preset name...">
        <div class="esf-modal-btns">
          <button class="esf-modal-btn" onclick="this.closest('.esf-modal').remove()">Cancel</button>
          <button class="esf-modal-btn primary" id="esfConfirmSave">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('esfConfirmSave').addEventListener('click', () => {
      const name = document.getElementById('esfPresetName').value.trim();
      if (name) {
        this.filterPresets[name] = { 
          filters: { ...this.activeFilters }, 
          search: this.searchTerm,
          sort: { column: this.sortColumn, direction: this.sortDirection }
        };
        localStorage.setItem(`filterPresets_${this.entityType}`, JSON.stringify(this.filterPresets));
        modal.remove();
        this.notify('Preset saved!', 'success');
      }
    });
  }

  showLoadModal() {
    const presets = Object.keys(this.filterPresets);
    
    const modal = document.createElement('div');
    modal.className = 'esf-modal';
    modal.innerHTML = `
      <div class="esf-modal-content">
        <h3>📂 Load Preset</h3>
        <div class="esf-preset-list">
          ${presets.length === 0 ? '<p style="text-align:center; color: #6b7280;">No saved presets</p>' : ''}
          ${presets.map(name => `
            <div class="esf-preset-item" data-preset="${name}">
              <span>${name}</span>
              <span class="esf-preset-delete" data-preset="${name}">🗑️</span>
            </div>
          `).join('')}
        </div>
        <div class="esf-modal-btns">
          <button class="esf-modal-btn" onclick="this.closest('.esf-modal').remove()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.esf-preset-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('esf-preset-delete')) {
          delete this.filterPresets[e.target.dataset.preset];
          localStorage.setItem(`filterPresets_${this.entityType}`, JSON.stringify(this.filterPresets));
          item.remove();
          e.stopPropagation();
          return;
        }
        this.loadPreset(item.dataset.preset);
        modal.remove();
      });
    });
  }

  loadPreset(name) {
    const preset = this.filterPresets[name];
    if (!preset) return;

    // Clear first
    this.clearAllFilters();

    // Apply filters
    if (preset.filters) {
      Object.entries(preset.filters).forEach(([key, value]) => {
        const el = document.querySelector(`[data-filter="${key}"]`);
        if (el) el.value = value;
      });
      this.activeFilters = { ...preset.filters };
    }

    // Apply search
    if (preset.search) {
      document.getElementById('esfSearchInput').value = preset.search;
      this.searchTerm = preset.search;
      document.getElementById('esfClearBtn').style.display = 'flex';
    }

    // Apply sort
    if (preset.sort?.column) {
      this.sortColumn = preset.sort.column;
      this.sortDirection = preset.sort.direction || 'asc';
      document.querySelectorAll('.esf-sort-option').forEach(btn => {
        const isActive = btn.dataset.sort === this.sortColumn;
        btn.classList.toggle('active', isActive);
        btn.querySelector('.esf-sort-dir').textContent = isActive 
          ? (this.sortDirection === 'asc' ? '↑' : '↓') 
          : '';
      });
    }

    this.updateChips();
    this.updateBadge();
    this.applyAll();
    this.notify(`Loaded: ${name}`, 'success');
  }

  notify(msg, type = 'info') {
    if (typeof showNotification === 'function') {
      showNotification(msg, type);
    }
  }

  // Utility: highlight search term in text
  static highlight(text, term) {
    if (!term || !text) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return String(text).replace(regex, '<span class="search-highlight">$1</span>');
  }

  getResults() { return this.filteredData; }
  getFilters() { return this.activeFilters; }
  getSearch() { return this.searchTerm; }
}

// Export
window.EnhancedSearchFilter = EnhancedSearchFilter;
