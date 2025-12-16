// ============================================
// GLOBAL SEARCH MODULE
// Search across all modules with recent history
// ============================================

class GlobalSearch {
  constructor() {
    this.searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    this.savedFilters = JSON.parse(localStorage.getItem('savedFilters') || '[]');
    this.isOpen = false;
    this.searchResults = [];
    this.selectedIndex = -1;
    
    this.init();
  }
  
  init() {
    this.createSearchModal();
    this.bindEvents();
  }
  
  createSearchModal() {
    // Remove existing if any
    const existing = document.getElementById('globalSearchModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'globalSearchModal';
    modal.innerHTML = `
      <div class="global-search-overlay"></div>
      <div class="global-search-container">
        <div class="global-search-header">
          <div class="global-search-input-wrap">
            <span class="global-search-icon">🔍</span>
            <input type="text" id="globalSearchInput" placeholder="Search tours, sales, documents, staff..." autocomplete="off">
            <span class="global-search-shortcut">ESC to close</span>
          </div>
        </div>
        <div class="global-search-body">
          <div id="globalSearchHistory" class="global-search-section">
            <div class="global-search-section-title">📜 Recent Searches</div>
            <div id="globalSearchHistoryList"></div>
          </div>
          <div id="globalSearchSaved" class="global-search-section">
            <div class="global-search-section-title">⭐ Saved Filters</div>
            <div id="globalSearchSavedList"></div>
          </div>
          <div id="globalSearchResults" class="global-search-section" style="display:none;">
            <div class="global-search-section-title">🔎 Results</div>
            <div id="globalSearchResultsList"></div>
          </div>
          <div id="globalSearchLoading" class="global-search-loading" style="display:none;">
            <div class="spinner"></div>
            <span>Searching...</span>
          </div>
          <div id="globalSearchEmpty" class="global-search-empty" style="display:none;">
            <span style="font-size:48px;">🔍</span>
            <p>No results found</p>
          </div>
        </div>
        <div class="global-search-footer">
          <div class="global-search-tips">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>Enter</kbd> Select</span>
            <span><kbd>ESC</kbd> Close</span>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.addStyles();
  }
  
  addStyles() {
    if (document.getElementById('globalSearchStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'globalSearchStyles';
    style.textContent = `
      #globalSearchModal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 99999;
      }
      #globalSearchModal.active {
        display: block;
      }
      .global-search-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(4px);
      }
      .global-search-container {
        position: absolute;
        top: 10%;
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 700px;
        background: var(--card, #fff);
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
        overflow: hidden;
        animation: searchSlideIn 0.2s ease;
      }
      @keyframes searchSlideIn {
        from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      .global-search-header {
        padding: 20px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }
      .global-search-input-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
        padding: 12px 16px;
        border: 2px solid transparent;
        transition: all 0.2s;
      }
      .global-search-input-wrap:focus-within {
        border-color: var(--primary, #3b82f6);
        background: var(--card, #fff);
      }
      .global-search-icon {
        font-size: 20px;
      }
      #globalSearchInput {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 16px;
        outline: none;
        color: var(--text-primary, #111827);
      }
      .global-search-shortcut {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
        background: var(--bg-alt, #f3f4f6);
        padding: 4px 8px;
        border-radius: 4px;
      }
      .global-search-body {
        max-height: 400px;
        overflow-y: auto;
        padding: 16px 20px;
      }
      .global-search-section {
        margin-bottom: 20px;
      }
      .global-search-section:last-child {
        margin-bottom: 0;
      }
      .global-search-section-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-secondary, #6b7280);
        margin-bottom: 12px;
      }
      .global-search-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .global-search-item:hover,
      .global-search-item.selected {
        background: var(--bg-alt, #f3f4f6);
      }
      .global-search-item.selected {
        background: var(--primary, #3b82f6);
        color: white;
      }
      .global-search-item-icon {
        font-size: 24px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 8px;
      }
      .global-search-item.selected .global-search-item-icon {
        background: rgba(255,255,255,0.2);
      }
      .global-search-item-content {
        flex: 1;
        min-width: 0;
      }
      .global-search-item-title {
        font-weight: 500;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .global-search-item-subtitle {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .global-search-item.selected .global-search-item-subtitle {
        color: rgba(255,255,255,0.8);
      }
      .global-search-item-badge {
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 4px;
        background: var(--primary, #3b82f6);
        color: white;
        font-weight: 500;
      }
      .global-search-footer {
        padding: 12px 20px;
        background: var(--bg-alt, #f9fafb);
        border-top: 1px solid var(--border-light, #e5e7eb);
      }
      .global-search-tips {
        display: flex;
        gap: 20px;
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }
      .global-search-tips kbd {
        background: var(--card, #fff);
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid var(--border-light, #e5e7eb);
        font-family: inherit;
        margin-right: 4px;
      }
      .global-search-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 40px;
        color: var(--text-secondary, #6b7280);
      }
      .global-search-loading .spinner {
        width: 24px;
        height: 24px;
        border: 3px solid var(--border-light, #e5e7eb);
        border-top-color: var(--primary, #3b82f6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .global-search-empty {
        text-align: center;
        padding: 40px;
        color: var(--text-secondary, #6b7280);
      }
      .global-search-empty p {
        margin: 12px 0 0 0;
      }
      
      /* Dark mode */
      body.dark-mode .global-search-container {
        background: #1f2937;
      }
      body.dark-mode #globalSearchInput {
        color: #f9fafb;
      }
      body.dark-mode .global-search-input-wrap {
        background: #374151;
      }
      body.dark-mode .global-search-item:hover,
      body.dark-mode .global-search-item.selected:not(.selected) {
        background: #374151;
      }
      body.dark-mode .global-search-item-icon {
        background: #374151;
      }
      body.dark-mode .global-search-footer {
        background: #111827;
      }
    `;
    document.head.appendChild(style);
  }
  
  bindEvents() {
    // Ctrl+K or Cmd+K to open
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
    
    // Click overlay to close
    document.querySelector('.global-search-overlay')?.addEventListener('click', () => this.close());
    
    // Input handling
    const input = document.getElementById('globalSearchInput');
    if (input) {
      input.addEventListener('input', this.debounce(() => this.search(input.value), 300));
      input.addEventListener('keydown', (e) => this.handleKeyNav(e));
    }
  }
  
  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  
  open() {
    const modal = document.getElementById('globalSearchModal');
    if (modal) {
      modal.classList.add('active');
      this.isOpen = true;
      this.renderHistory();
      this.renderSavedFilters();
      document.getElementById('globalSearchInput')?.focus();
    }
  }
  
  close() {
    const modal = document.getElementById('globalSearchModal');
    if (modal) {
      modal.classList.remove('active');
      this.isOpen = false;
      document.getElementById('globalSearchInput').value = '';
      document.getElementById('globalSearchResults').style.display = 'none';
      document.getElementById('globalSearchHistory').style.display = 'block';
      document.getElementById('globalSearchSaved').style.display = 'block';
    }
  }
  
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
  
  renderHistory() {
    const container = document.getElementById('globalSearchHistoryList');
    if (!container) return;
    
    if (this.searchHistory.length === 0) {
      container.innerHTML = '<div style="padding: 12px; color: var(--text-secondary); font-size: 14px;">No recent searches</div>';
      return;
    }
    
    container.innerHTML = this.searchHistory.slice(0, 5).map((item, i) => `
      <div class="global-search-item" data-action="search" data-query="${item.query}">
        <div class="global-search-item-icon">🕐</div>
        <div class="global-search-item-content">
          <div class="global-search-item-title">${item.query}</div>
          <div class="global-search-item-subtitle">${item.module || 'All'} • ${this.timeAgo(item.timestamp)}</div>
        </div>
        <button class="global-search-item-badge" onclick="event.stopPropagation(); globalSearch.removeHistory(${i})">×</button>
      </div>
    `).join('');
    
    container.querySelectorAll('.global-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const query = item.dataset.query;
        document.getElementById('globalSearchInput').value = query;
        this.search(query);
      });
    });
  }
  
  renderSavedFilters() {
    const container = document.getElementById('globalSearchSavedList');
    if (!container) return;
    
    if (this.savedFilters.length === 0) {
      container.innerHTML = '<div style="padding: 12px; color: var(--text-secondary); font-size: 14px;">No saved filters</div>';
      return;
    }
    
    container.innerHTML = this.savedFilters.map((filter, i) => `
      <div class="global-search-item" data-action="filter" data-index="${i}">
        <div class="global-search-item-icon">⭐</div>
        <div class="global-search-item-content">
          <div class="global-search-item-title">${filter.name}</div>
          <div class="global-search-item-subtitle">${filter.module} • ${Object.keys(filter.filters).length} filters</div>
        </div>
        <button class="global-search-item-badge" onclick="event.stopPropagation(); globalSearch.removeSavedFilter(${i})">×</button>
      </div>
    `).join('');
  }
  
  async search(query) {
    if (!query || query.length < 2) {
      document.getElementById('globalSearchResults').style.display = 'none';
      document.getElementById('globalSearchHistory').style.display = 'block';
      document.getElementById('globalSearchSaved').style.display = 'block';
      document.getElementById('globalSearchEmpty').style.display = 'none';
      return;
    }
    
    document.getElementById('globalSearchHistory').style.display = 'none';
    document.getElementById('globalSearchSaved').style.display = 'none';
    document.getElementById('globalSearchLoading').style.display = 'flex';
    document.getElementById('globalSearchResults').style.display = 'none';
    document.getElementById('globalSearchEmpty').style.display = 'none';
    
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Search multiple endpoints
      const [tours, sales, documents] = await Promise.all([
        fetch(`/api/tours?search=${encodeURIComponent(query)}`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`/api/sales?search=${encodeURIComponent(query)}`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`/api/documents?search=${encodeURIComponent(query)}`, { headers }).then(r => r.json()).catch(() => [])
      ]);
      
      this.searchResults = [];
      
      // Format tours results
      (tours || []).slice(0, 5).forEach(t => {
        this.searchResults.push({
          type: 'tour',
          icon: '🧳',
          title: t.tour_code || t.booking_code || 'Tour',
          subtitle: `${t.lead_passenger || 'N/A'} • ${t.departure_date || 'N/A'}`,
          url: `/tours-dashboard.html?highlight=${t.id}`,
          data: t
        });
      });
      
      // Format sales results
      (sales || []).slice(0, 5).forEach(s => {
        this.searchResults.push({
          type: 'sale',
          icon: '💰',
          title: s.invoice_no || 'Sale',
          subtitle: `${s.staff_name || 'N/A'} • Rp ${(s.sales_amount || 0).toLocaleString()}`,
          url: `/sales-dashboard.html?highlight=${s.id}`,
          data: s
        });
      });
      
      // Format documents results
      (documents || []).slice(0, 5).forEach(d => {
        this.searchResults.push({
          type: 'document',
          icon: '📄',
          title: d.guest_name || d.booking_code || 'Document',
          subtitle: `${d.process_type || 'N/A'} • ${d.receive_date || 'N/A'}`,
          url: `/documents-dashboard.html?highlight=${d.id}`,
          data: d
        });
      });
      
      this.renderResults();
      this.addToHistory(query);
      
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      document.getElementById('globalSearchLoading').style.display = 'none';
    }
  }
  
  renderResults() {
    const container = document.getElementById('globalSearchResultsList');
    const resultsSection = document.getElementById('globalSearchResults');
    const emptySection = document.getElementById('globalSearchEmpty');
    
    if (this.searchResults.length === 0) {
      resultsSection.style.display = 'none';
      emptySection.style.display = 'block';
      return;
    }
    
    emptySection.style.display = 'none';
    resultsSection.style.display = 'block';
    this.selectedIndex = -1;
    
    container.innerHTML = this.searchResults.map((result, i) => `
      <div class="global-search-item" data-index="${i}" data-url="${result.url}">
        <div class="global-search-item-icon">${result.icon}</div>
        <div class="global-search-item-content">
          <div class="global-search-item-title">${result.title}</div>
          <div class="global-search-item-subtitle">${result.subtitle}</div>
        </div>
        <span class="global-search-item-badge">${result.type}</span>
      </div>
    `).join('');
    
    container.querySelectorAll('.global-search-item').forEach(item => {
      item.addEventListener('click', () => {
        window.location.href = item.dataset.url;
      });
    });
  }
  
  handleKeyNav(e) {
    const items = document.querySelectorAll('#globalSearchResultsList .global-search-item');
    if (items.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
      this.updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.updateSelection(items);
    } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
      e.preventDefault();
      const selected = items[this.selectedIndex];
      if (selected) window.location.href = selected.dataset.url;
    }
  }
  
  updateSelection(items) {
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === this.selectedIndex);
    });
  }
  
  addToHistory(query) {
    this.searchHistory = this.searchHistory.filter(h => h.query !== query);
    this.searchHistory.unshift({ query, timestamp: Date.now() });
    this.searchHistory = this.searchHistory.slice(0, 10);
    localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
  }
  
  removeHistory(index) {
    this.searchHistory.splice(index, 1);
    localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
    this.renderHistory();
  }
  
  saveFilter(name, module, filters) {
    this.savedFilters.push({ name, module, filters, timestamp: Date.now() });
    localStorage.setItem('savedFilters', JSON.stringify(this.savedFilters));
  }
  
  removeSavedFilter(index) {
    this.savedFilters.splice(index, 1);
    localStorage.setItem('savedFilters', JSON.stringify(this.savedFilters));
    this.renderSavedFilters();
  }
  
  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

// Initialize global search
const globalSearch = new GlobalSearch();

// Export for keyboard shortcuts integration
window.globalSearch = globalSearch;
