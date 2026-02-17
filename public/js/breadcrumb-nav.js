/**
 * Breadcrumb Navigation Component
 * DISABLED - Causing layout issues with existing UI
 * This file intentionally does nothing to prevent conflicts
 */

(function() {
  'use strict';
  // Breadcrumb navigation disabled to avoid layout conflicts
  // The sidebar already provides clear navigation
  console.debug('[breadcrumb-nav] Disabled - using sidebar navigation');
})();

  class BreadcrumbNav {
    constructor() {
      this.container = null;
      this.history = this.loadHistory();
      this.init();
    }
    
    init() {
      // Wait for DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }
    
    setup() {
      // Find or create breadcrumb container
      this.container = document.querySelector('.breadcrumb-nav');
      
      if (!this.container) {
        // Create container
        this.container = document.createElement('nav');
        this.container.className = 'breadcrumb-nav';
        this.container.setAttribute('aria-label', 'Breadcrumb');
        
        // Insert after header or at start of main content
        const main = document.querySelector('.main, main, .content');
        if (main) {
          main.insertBefore(this.container, main.firstChild);
        }
      }
      
      // Track current page
      this.trackPage();
      
      // Render breadcrumbs
      this.render();
      
      // Add styles
      this.addStyles();
    }
    
    getCurrentPage() {
      const path = window.location.pathname;
      return path.split('/').pop() || 'single-dashboard.html';
    }
    
    getPageInfo(pageName) {
      return pageHierarchy[pageName] || { title: pageName.replace('.html', '').replace(/-/g, ' '), icon: '📄', parent: 'single-dashboard.html' };
    }
    
    getBreadcrumbPath() {
      const currentPage = this.getCurrentPage();
      const path = [];
      let page = currentPage;
      
      // Build path from current page up to root
      while (page) {
        const info = this.getPageInfo(page);
        path.unshift({ page, ...info });
        page = info.parent;
      }
      
      return path;
    }
    
    loadHistory() {
      try {
        return JSON.parse(sessionStorage.getItem('nav-history') || '[]');
      } catch {
        return [];
      }
    }
    
    saveHistory() {
      try {
        // Limit history size
        const history = this.history.slice(-10);
        sessionStorage.setItem('nav-history', JSON.stringify(history));
      } catch {
        // Ignore storage errors
      }
    }
    
    trackPage() {
      const currentPage = this.getCurrentPage();
      const info = this.getPageInfo(currentPage);
      
      // Don't add duplicates
      if (this.history.length === 0 || this.history[this.history.length - 1].page !== currentPage) {
        this.history.push({
          page: currentPage,
          title: info.title,
          timestamp: Date.now()
        });
        this.saveHistory();
      }
    }
    
    render() {
      const path = this.getBreadcrumbPath();
      
      this.container.innerHTML = `
        <ol class="breadcrumb-list">
          ${path.map((item, index) => {
            const isLast = index === path.length - 1;
            return `
              <li class="breadcrumb-item ${isLast ? 'active' : ''}">
                ${isLast 
                  ? `<span class="breadcrumb-current"><span class="breadcrumb-icon">${item.icon}</span> ${item.title}</span>`
                  : `<a href="/${item.page}" class="breadcrumb-link"><span class="breadcrumb-icon">${item.icon}</span> ${item.title}</a>`
                }
                ${!isLast ? '<span class="breadcrumb-separator" aria-hidden="true">›</span>' : ''}
              </li>
            `;
          }).join('')}
        </ol>
        ${this.history.length > 1 ? `
          <button class="breadcrumb-back" onclick="history.back()" title="Go back">
            ← Back
          </button>
        ` : ''}
      `;
    }
    
    addStyles() {
      if (document.getElementById('breadcrumb-styles')) return;
      
      const style = document.createElement('style');
      style.id = 'breadcrumb-styles';
      style.textContent = `
        .breadcrumb-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--gray-200, #e2e8f0);
        }
        
        .breadcrumb-list {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          list-style: none;
          margin: 0;
          padding: 0;
          font-size: 0.875rem;
        }
        
        .breadcrumb-item {
          display: flex;
          align-items: center;
        }
        
        .breadcrumb-link {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--gray-600, #475569);
          text-decoration: none;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.15s ease;
        }
        
        .breadcrumb-link:hover {
          color: var(--primary-600, #2563eb);
          background: var(--primary-50, #eff6ff);
        }
        
        .breadcrumb-current {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--gray-800, #1e293b);
          font-weight: 600;
          padding: 4px 8px;
        }
        
        .breadcrumb-separator {
          color: var(--gray-400, #94a3b8);
          margin: 0 4px;
          font-size: 1.1em;
        }
        
        .breadcrumb-icon {
          font-size: 1rem;
        }
        
        .breadcrumb-back {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--gray-600, #475569);
          background: var(--gray-100, #f1f5f9);
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        
        .breadcrumb-back:hover {
          background: var(--gray-200, #e2e8f0);
          color: var(--gray-800, #1e293b);
        }
        
        /* Dark mode */
        [data-theme="dark"] .breadcrumb-nav {
          border-color: var(--gray-700, #334155);
        }
        
        [data-theme="dark"] .breadcrumb-link {
          color: var(--gray-400, #94a3b8);
        }
        
        [data-theme="dark"] .breadcrumb-link:hover {
          color: var(--primary-400, #60a5fa);
          background: rgba(59, 130, 246, 0.1);
        }
        
        [data-theme="dark"] .breadcrumb-current {
          color: var(--gray-200, #e2e8f0);
        }
        
        [data-theme="dark"] .breadcrumb-back {
          background: var(--gray-700, #334155);
          color: var(--gray-300, #cbd5e1);
        }
        
        [data-theme="dark"] .breadcrumb-back:hover {
          background: var(--gray-600, #475569);
        }
        
        /* Mobile */
        @media (max-width: 640px) {
          .breadcrumb-nav {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          
          .breadcrumb-list {
            font-size: 0.8125rem;
          }
          
          .breadcrumb-icon {
            display: none;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Initialize
  new BreadcrumbNav();
  
  // Expose for external use
  window.BreadcrumbNav = BreadcrumbNav;
})();
