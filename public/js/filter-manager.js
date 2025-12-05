/**
 * Filter Enhancement Utilities
 * Provides filter chips, quick dates, saved presets, and more
 */

class FilterManager {
  constructor(options = {}) {
    this.options = options;
    this.activeFilters = new Map();
    this.presets = options.presets || [];
    this.chipContainer = null;
    this.init();
  }

  init() {
    // Create chip container if it doesn't exist
    const existingContainer = document.getElementById('filterChips');
    if (!existingContainer && this.options.chipContainer) {
      this.chipContainer = document.createElement('div');
      this.chipContainer.id = 'filterChips';
      this.chipContainer.className = 'filter-chips';
      
      const target = document.querySelector(this.options.chipContainer);
      if (target) {
        target.insertBefore(this.chipContainer, target.firstChild);
      }
    } else {
      this.chipContainer = existingContainer;
    }

    // Setup quick date buttons if configured
    if (this.options.quickDates) {
      this.setupQuickDates();
    }

    // Setup preset buttons if configured
    if (this.presets.length > 0) {
      this.setupPresets();
    }
  }

  addFilter(key, value, label = null) {
    if (!value || value === 'all' || value === '') return;

    this.activeFilters.set(key, { value, label: label || key });
    this.renderChips();
    this.updateFilterSummary();
    
    if (this.options.onChange) {
      this.options.onChange(this.getActiveFilters());
    }
  }

  removeFilter(key) {
    this.activeFilters.delete(key);
    this.renderChips();
    this.updateFilterSummary();
    
    // Reset the corresponding filter input
    const input = document.querySelector(`[name="${key}"], #${key}`);
    if (input) {
      if (input.type === 'checkbox') {
        input.checked = false;
      } else {
        input.value = input.tagName === 'SELECT' ? 'all' : '';
      }
    }
    
    if (this.options.onChange) {
      this.options.onChange(this.getActiveFilters());
    }
  }

  clearAll() {
    this.activeFilters.clear();
    this.renderChips();
    this.updateFilterSummary();
    
    // Reset all filter inputs
    const filterInputs = document.querySelectorAll('.filter-panel input, .filter-panel select');
    filterInputs.forEach(input => {
      if (input.type === 'checkbox') {
        input.checked = false;
      } else {
        input.value = input.tagName === 'SELECT' ? 'all' : '';
      }
    });
    
    if (this.options.onChange) {
      this.options.onChange(this.getActiveFilters());
    }
  }

  getActiveFilters() {
    const filters = {};
    this.activeFilters.forEach((data, key) => {
      filters[key] = data.value;
    });
    return filters;
  }

  renderChips() {
    if (!this.chipContainer) return;

    this.chipContainer.innerHTML = '';

    this.activeFilters.forEach((data, key) => {
      const chip = document.createElement('div');
      chip.className = 'filter-chip';
      chip.innerHTML = `
        <span class="chip-label">${data.label}:</span>
        <span class="chip-value">${this.formatValue(data.value)}</span>
        <button class="chip-remove" onclick="filterManager.removeFilter('${key}')" aria-label="Remove filter">×</button>
      `;
      this.chipContainer.appendChild(chip);
    });

    // Add clear all button if there are filters
    if (this.activeFilters.size > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-sm btn-outline';
      clearBtn.textContent = 'Clear All';
      clearBtn.style.marginLeft = '8px';
      clearBtn.onclick = () => this.clearAll();
      this.chipContainer.appendChild(clearBtn);
    }
  }

  formatValue(value) {
    // Format dates
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    // Format date strings
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(value).toLocaleDateString();
    }
    // Truncate long strings
    if (typeof value === 'string' && value.length > 30) {
      return value.substring(0, 27) + '...';
    }
    return value;
  }

  setupQuickDates() {
    const container = document.querySelector(this.options.quickDates);
    if (!container) return;

    const quickDatesDiv = document.createElement('div');
    quickDatesDiv.className = 'quick-dates';
    quickDatesDiv.innerHTML = `
      <button class="quick-date-btn" data-range="today">Today</button>
      <button class="quick-date-btn" data-range="yesterday">Yesterday</button>
      <button class="quick-date-btn" data-range="thisWeek">This Week</button>
      <button class="quick-date-btn" data-range="lastWeek">Last Week</button>
      <button class="quick-date-btn" data-range="thisMonth">This Month</button>
      <button class="quick-date-btn" data-range="lastMonth">Last Month</button>
      <button class="quick-date-btn" data-range="last30Days">Last 30 Days</button>
      <button class="quick-date-btn" data-range="last90Days">Last 90 Days</button>
    `;

    container.insertBefore(quickDatesDiv, container.firstChild);

    // Add click handlers
    quickDatesDiv.addEventListener('click', (e) => {
      if (e.target.classList.contains('quick-date-btn')) {
        const range = e.target.dataset.range;
        const dates = this.getDateRange(range);
        
        // Update active button
        quickDatesDiv.querySelectorAll('.quick-date-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        e.target.classList.add('active');
        
        // Update date inputs
        const startInput = document.querySelector(this.options.startDateInput);
        const endInput = document.querySelector(this.options.endDateInput);
        
        if (startInput) startInput.value = dates.start;
        if (endInput) endInput.value = dates.end;
        
        // Add filters
        this.addFilter('dateRange', range, 'Date Range');
        this.addFilter('startDate', dates.start, 'From');
        this.addFilter('endDate', dates.end, 'To');
      }
    });
  }

  getDateRange(range) {
    const today = new Date();
    const formatDate = (date) => date.toISOString().split('T')[0];
    
    let start, end;

    switch (range) {
      case 'today':
        start = end = today;
        break;
      case 'yesterday':
        start = end = new Date(today.setDate(today.getDate() - 1));
        break;
      case 'thisWeek':
        const dayOfWeek = today.getDay();
        start = new Date(today.setDate(today.getDate() - dayOfWeek));
        end = new Date();
        break;
      case 'lastWeek':
        const lastWeekEnd = new Date(today.setDate(today.getDate() - today.getDay()));
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
        start = lastWeekStart;
        end = lastWeekEnd;
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date();
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last30Days':
        start = new Date(today.setDate(today.getDate() - 30));
        end = new Date();
        break;
      case 'last90Days':
        start = new Date(today.setDate(today.getDate() - 90));
        end = new Date();
        break;
      default:
        start = end = today;
    }

    return {
      start: formatDate(start),
      end: formatDate(end)
    };
  }

  setupPresets() {
    const container = document.querySelector(this.options.presetContainer);
    if (!container) return;

    const presetsDiv = document.createElement('div');
    presetsDiv.className = 'filter-presets';

    this.presets.forEach((preset, index) => {
      const btn = document.createElement('button');
      btn.className = 'filter-preset-btn';
      btn.dataset.presetId = index;
      btn.innerHTML = `
        <span class="preset-icon">${preset.icon || '📌'}</span>
        <span>${preset.name}</span>
      `;
      btn.onclick = () => this.applyPreset(preset);
      presetsDiv.appendChild(btn);
    });

    container.insertBefore(presetsDiv, container.firstChild);
  }

  applyPreset(preset) {
    this.clearAll();
    
    Object.entries(preset.filters).forEach(([key, value]) => {
      const input = document.querySelector(`[name="${key}"], #${key}`);
      if (input) {
        input.value = value;
      }
      this.addFilter(key, value, preset.labels?.[key] || key);
    });

    toast.success(`Applied preset: ${preset.name}`);
  }

  savePreset(name, icon = '📌') {
    const filters = this.getActiveFilters();
    if (Object.keys(filters).length === 0) {
      toast.warning('No filters to save');
      return;
    }

    const preset = {
      name,
      icon,
      filters,
      createdAt: new Date().toISOString()
    };

    // Save to localStorage
    const saved = JSON.parse(localStorage.getItem('filterPresets') || '[]');
    saved.push(preset);
    localStorage.setItem('filterPresets', JSON.stringify(saved));

    toast.success(`Saved preset: ${name}`);
  }

  loadSavedPresets() {
    const saved = JSON.parse(localStorage.getItem('filterPresets') || '[]');
    this.presets = [...this.presets, ...saved];
    
    if (this.options.presetContainer) {
      this.setupPresets();
    }
  }

  updateFilterSummary() {
    const summaryEl = document.getElementById('filterSummary');
    if (!summaryEl) return;

    const count = this.activeFilters.size;
    
    if (count === 0) {
      summaryEl.style.display = 'none';
    } else {
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        <span class="filter-summary-icon">🔍</span>
        <span class="filter-summary-text">
          Showing results filtered by <span class="filter-summary-count">${count}</span> ${count === 1 ? 'filter' : 'filters'}
        </span>
      `;
    }
  }

  highlightSearchTerms(text, searchTerm) {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
  }
}

// Global instance
let filterManager;

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.FilterManager = FilterManager;
}
