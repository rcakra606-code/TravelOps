/**
 * Global Filter Bar - Inline filters inspired by my-tours page
 * Provides consistent search/filter UI across all CRUD dashboards
 */

class GlobalFilterBar {
  constructor(options = {}) {
    this.containerId = options.containerId || 'filterBar';
    this.entityType = options.entityType || 'records';
    this.searchFields = options.searchFields || ['name', 'code'];
    this.filters = options.filters || [];
    this.data = [];
    this.filteredData = [];
    this.onFilter = options.onFilter || (() => {});
    this.debounceMs = options.debounceMs || 300;
    this.debounceTimer = null;
    
    // Filter state
    this.filterState = {
      search: '',
      year: '',
      month: '',
      staff: ''
    };
    
    // Populate additional filter states from options
    this.filters.forEach(f => {
      if (f.name && !(f.name in this.filterState)) {
        this.filterState[f.name] = f.defaultValue || '';
      }
    });
  }

  /**
   * Initialize and render the filter bar
   */
  init(container) {
    this.container = container || document.getElementById(this.containerId);
    if (!this.container) {
      console.warn('GlobalFilterBar: Container not found');
      return this;
    }
    
    this.render();
    this.attachEvents();
    this.injectStyles();
    return this;
  }

  /**
   * Render the filter bar HTML
   */
  render() {
    const yearOptions = this.generateYearOptions();
    const monthOptions = this.generateMonthOptions();
    
    let filterHTML = `
      <div class="gfb-wrapper">
        <div class="gfb-search-row">
          <!-- Search Input -->
          <div class="gfb-search-wrap">
            <input type="text" 
                   class="gfb-search-input" 
                   id="gfbSearch" 
                   placeholder="🔍 Search ${this.entityType}..."
                   value="${this.filterState.search || ''}">
          </div>
    `;
    
    // Add custom filters from options
    this.filters.forEach(filter => {
      if (filter.type === 'select') {
        filterHTML += `
          <select class="gfb-filter-select" id="gfb_${filter.name}" data-filter="${filter.name}">
            <option value="">${filter.placeholder || `All ${filter.label}`}</option>
            ${filter.options ? filter.options.map(opt => 
              `<option value="${opt.value}" ${this.filterState[filter.name] === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('') : ''}
          </select>
        `;
      } else if (filter.type === 'year') {
        filterHTML += `
          <select class="gfb-filter-select" id="gfb_year" data-filter="year">
            <option value="">All Years</option>
            ${yearOptions}
          </select>
        `;
      } else if (filter.type === 'month') {
        filterHTML += `
          <select class="gfb-filter-select" id="gfb_month" data-filter="month">
            <option value="">All Months</option>
            ${monthOptions}
          </select>
        `;
      } else if (filter.type === 'dateRange') {
        filterHTML += `
          <input type="date" class="gfb-date-input" id="gfb_startDate" data-filter="startDate" 
                 value="${this.filterState.startDate || ''}" title="Start Date">
          <span class="gfb-date-separator">to</span>
          <input type="date" class="gfb-date-input" id="gfb_endDate" data-filter="endDate"
                 value="${this.filterState.endDate || ''}" title="End Date">
        `;
      }
    });
    
    // Add reset button
    filterHTML += `
          <button class="gfb-reset-btn" id="gfbReset" title="Reset all filters">
            🔄 Reset
          </button>
        </div>
        
        <!-- Active Filters Summary -->
        <div class="gfb-active-filters" id="gfbActiveFilters"></div>
      </div>
    `;
    
    this.container.innerHTML = filterHTML;
    this.updateActiveFiltersDisplay();
  }

  /**
   * Generate year dropdown options (from current year back 5 years, forward 2 years)
   */
  generateYearOptions() {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear + 2; y >= currentYear - 5; y--) {
      years.push(`<option value="${y}" ${this.filterState.year == y ? 'selected' : ''}>${y}</option>`);
    }
    return years.join('');
  }

  /**
   * Generate month dropdown options
   */
  generateMonthOptions() {
    const months = [
      { value: '01', label: 'January' },
      { value: '02', label: 'February' },
      { value: '03', label: 'March' },
      { value: '04', label: 'April' },
      { value: '05', label: 'May' },
      { value: '06', label: 'June' },
      { value: '07', label: 'July' },
      { value: '08', label: 'August' },
      { value: '09', label: 'September' },
      { value: '10', label: 'October' },
      { value: '11', label: 'November' },
      { value: '12', label: 'December' }
    ];
    return months.map(m => 
      `<option value="${m.value}" ${this.filterState.month === m.value ? 'selected' : ''}>${m.label}</option>`
    ).join('');
  }

  /**
   * Attach event listeners
   */
  attachEvents() {
    // Search input with debounce
    const searchInput = document.getElementById('gfbSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterState.search = e.target.value;
        this.debouncedFilter();
      });
    }
    
    // All filter dropdowns and inputs
    this.container.querySelectorAll('[data-filter]').forEach(el => {
      el.addEventListener('change', (e) => {
        const filterName = e.target.dataset.filter;
        this.filterState[filterName] = e.target.value;
        this.applyFilters();
      });
    });
    
    // Reset button
    const resetBtn = document.getElementById('gfbReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetFilters());
    }
  }

  /**
   * Debounced filter application
   */
  debouncedFilter() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.applyFilters();
    }, this.debounceMs);
  }

  /**
   * Apply all filters and notify callback
   */
  applyFilters() {
    this.updateActiveFiltersDisplay();
    
    if (this.onFilter) {
      this.onFilter(this.filterState, this.getFilteredData(this.data));
    }
  }

  /**
   * Filter data based on current filter state
   */
  getFilteredData(data) {
    if (!data || !Array.isArray(data)) return [];
    
    let filtered = [...data];
    
    // Search filter
    if (this.filterState.search) {
      const searchTerm = this.filterState.search.toLowerCase().trim();
      filtered = filtered.filter(item => {
        return this.searchFields.some(field => {
          const value = item[field];
          return value && String(value).toLowerCase().includes(searchTerm);
        });
      });
    }
    
    // Year filter (supports departure_date, created_at, date fields)
    if (this.filterState.year) {
      filtered = filtered.filter(item => {
        const dateField = item.departure_date || item.registration_date || 
                          item.receive_date || item.check_in || item.sailing_start ||
                          item.tanggal_mulai || item.event_date || item.created_at;
        if (!dateField) return false;
        return dateField.substring(0, 4) === this.filterState.year;
      });
    }
    
    // Month filter
    if (this.filterState.month) {
      filtered = filtered.filter(item => {
        const dateField = item.departure_date || item.registration_date || 
                          item.receive_date || item.check_in || item.sailing_start ||
                          item.tanggal_mulai || item.event_date || item.created_at;
        if (!dateField) return false;
        return dateField.substring(5, 7) === this.filterState.month;
      });
    }
    
    // Date range filter
    if (this.filterState.startDate) {
      filtered = filtered.filter(item => {
        const dateField = item.departure_date || item.check_in || item.sailing_start ||
                          item.tanggal_mulai || item.event_date || item.receive_date;
        return !dateField || dateField >= this.filterState.startDate;
      });
    }
    
    if (this.filterState.endDate) {
      filtered = filtered.filter(item => {
        const dateField = item.departure_date || item.check_out || item.sailing_end ||
                          item.tanggal_selesai || item.event_date || item.receive_date;
        return !dateField || dateField <= this.filterState.endDate;
      });
    }
    
    // Custom field filters
    this.filters.forEach(filter => {
      if (filter.type === 'select' && this.filterState[filter.name]) {
        filtered = filtered.filter(item => {
          const value = item[filter.field || filter.name];
          return value === this.filterState[filter.name];
        });
      }
    });
    
    this.filteredData = filtered;
    return filtered;
  }

  /**
   * Set data source for filtering
   */
  setData(data) {
    this.data = data || [];
    return this;
  }

  /**
   * Update a filter dropdown options dynamically
   */
  updateFilterOptions(filterName, options) {
    const select = document.getElementById(`gfb_${filterName}`);
    if (!select) return this;
    
    const filter = this.filters.find(f => f.name === filterName);
    const placeholder = filter?.placeholder || `All ${filter?.label || filterName}`;
    
    select.innerHTML = `<option value="">${placeholder}</option>` +
      options.map(opt => 
        `<option value="${opt.value}" ${this.filterState[filterName] === opt.value ? 'selected' : ''}>${opt.label}</option>`
      ).join('');
    
    return this;
  }

  /**
   * Populate year filter from data
   */
  populateYearsFromData(data, dateField = 'departure_date') {
    const years = [...new Set(
      data.map(item => {
        const date = item[dateField];
        return date ? date.substring(0, 4) : null;
      }).filter(Boolean)
    )].sort((a, b) => b - a);
    
    const select = document.getElementById('gfb_year');
    if (select) {
      select.innerHTML = '<option value="">All Years</option>' +
        years.map(y => `<option value="${y}" ${this.filterState.year === y ? 'selected' : ''}>${y}</option>`).join('');
    }
    
    return this;
  }

  /**
   * Update active filters display
   */
  updateActiveFiltersDisplay() {
    const container = document.getElementById('gfbActiveFilters');
    if (!container) return;
    
    const activeFilters = [];
    
    if (this.filterState.search) {
      activeFilters.push({ label: 'Search', value: `"${this.filterState.search}"` });
    }
    if (this.filterState.year) {
      activeFilters.push({ label: 'Year', value: this.filterState.year });
    }
    if (this.filterState.month) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      activeFilters.push({ label: 'Month', value: monthNames[parseInt(this.filterState.month) - 1] });
    }
    if (this.filterState.startDate || this.filterState.endDate) {
      const range = `${this.filterState.startDate || '...'} - ${this.filterState.endDate || '...'}`;
      activeFilters.push({ label: 'Date Range', value: range });
    }
    
    // Check custom filters
    this.filters.forEach(filter => {
      if (filter.type === 'select' && this.filterState[filter.name]) {
        const option = filter.options?.find(o => o.value === this.filterState[filter.name]);
        activeFilters.push({ 
          label: filter.label || filter.name, 
          value: option?.label || this.filterState[filter.name] 
        });
      }
    });
    
    if (activeFilters.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    container.innerHTML = `
      <span class="gfb-active-label">Active filters:</span>
      ${activeFilters.map(f => `
        <span class="gfb-filter-chip">
          <span class="gfb-chip-label">${f.label}:</span>
          <span class="gfb-chip-value">${f.value}</span>
        </span>
      `).join('')}
    `;
  }

  /**
   * Reset all filters
   */
  resetFilters() {
    // Reset state
    Object.keys(this.filterState).forEach(key => {
      this.filterState[key] = '';
    });
    
    // Reset UI elements
    const searchInput = document.getElementById('gfbSearch');
    if (searchInput) searchInput.value = '';
    
    this.container.querySelectorAll('[data-filter]').forEach(el => {
      el.value = '';
    });
    
    this.applyFilters();
  }

  /**
   * Check if any filters are active
   */
  hasActiveFilters() {
    return Object.values(this.filterState).some(v => v && v !== '');
  }

  /**
   * Get current filter state
   */
  getState() {
    return { ...this.filterState };
  }

  /**
   * Set filter state programmatically
   */
  setState(newState) {
    Object.assign(this.filterState, newState);
    this.render();
    this.attachEvents();
    return this;
  }

  /**
   * Inject styles for the filter bar
   */
  injectStyles() {
    if (document.getElementById('gfb-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'gfb-styles';
    style.textContent = `
      .gfb-wrapper {
        margin-bottom: 20px;
      }
      
      .gfb-search-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }
      
      .gfb-search-wrap {
        flex: 1;
        min-width: 200px;
      }
      
      .gfb-search-input {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 14px;
        background: var(--card, #fff);
        color: var(--text-primary, #111);
        transition: all 0.2s;
      }
      
      .gfb-search-input:focus {
        outline: none;
        border-color: var(--primary, #3b82f6);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      
      .gfb-filter-select {
        padding: 10px 14px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 14px;
        background: var(--card, #fff);
        color: var(--text-primary, #111);
        min-width: 140px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .gfb-filter-select:focus {
        outline: none;
        border-color: var(--primary, #3b82f6);
      }
      
      .gfb-date-input {
        padding: 10px 12px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 14px;
        background: var(--card, #fff);
        color: var(--text-primary, #111);
        cursor: pointer;
      }
      
      .gfb-date-separator {
        color: var(--text-secondary, #6b7280);
        font-size: 13px;
      }
      
      .gfb-reset-btn {
        padding: 10px 16px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 14px;
        background: var(--bg-alt, #f9fafb);
        color: var(--text-secondary, #6b7280);
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .gfb-reset-btn:hover {
        background: var(--card, #fff);
        color: var(--text-primary, #111);
        border-color: var(--primary, #3b82f6);
      }
      
      .gfb-active-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        align-items: center;
      }
      
      .gfb-active-label {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
        margin-right: 4px;
      }
      
      .gfb-filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: var(--primary-light, #eff6ff);
        border-radius: 16px;
        font-size: 12px;
      }
      
      .gfb-chip-label {
        color: var(--primary, #3b82f6);
        font-weight: 500;
      }
      
      .gfb-chip-value {
        color: var(--primary-dark, #1e40af);
      }
      
      /* Dark mode */
      [data-theme="dark"] .gfb-search-input,
      [data-theme="dark"] .gfb-filter-select,
      [data-theme="dark"] .gfb-date-input {
        background: var(--card, #1f2937);
        border-color: var(--border-light, #374151);
        color: var(--text-primary, #f9fafb);
      }
      
      [data-theme="dark"] .gfb-reset-btn {
        background: var(--bg-alt, #374151);
        border-color: var(--border-light, #4b5563);
      }
      
      [data-theme="dark"] .gfb-filter-chip {
        background: rgba(59, 130, 246, 0.2);
      }
      
      /* Responsive */
      @media (max-width: 768px) {
        .gfb-search-row {
          flex-direction: column;
        }
        
        .gfb-search-wrap,
        .gfb-filter-select,
        .gfb-reset-btn {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Export to window for global access
window.GlobalFilterBar = GlobalFilterBar;
