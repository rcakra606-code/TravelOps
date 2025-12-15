/* =========================================================
   KEYBOARD SHORTCUTS HELPER
   Shows available shortcuts when user presses "?"
   ========================================================= */

class KeyboardShortcuts {
  constructor() {
    this.shortcuts = [
      { key: '?', description: 'Show this help dialog' },
      { key: 'Ctrl + B', description: 'Toggle sidebar' },
      { key: 'Alt + N', description: 'Add new record' },
      { key: 'Escape', description: 'Close modal/dialog' },
      { key: '/', description: 'Focus search input' },
      { key: 'Ctrl + S', description: 'Save current form' },
      { key: 'Ctrl + E', description: 'Export table data' },
    ];
    
    this.modal = null;
    this.init();
  }

  init() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger when typing in inputs
      if (e.target.matches('input, textarea, select')) return;
      
      // Show shortcuts modal on "?"
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        this.showModal();
      }
      
      // Focus search on "/"
      if (e.key === '/' && !e.shiftKey) {
        const searchInput = document.querySelector('#searchInput, #search, [type="search"], input[placeholder*="Search"]');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
        }
      }
      
      // Close modal on Escape
      if (e.key === 'Escape' && this.modal) {
        this.hideModal();
      }
      
      // Export shortcut
      if (e.ctrlKey && e.key === 'e') {
        const exportBtn = document.querySelector('.export-btn[data-format="csv"]');
        if (exportBtn) {
          e.preventDefault();
          exportBtn.click();
        }
      }
    });
  }

  showModal() {
    if (this.modal) {
      this.modal.remove();
    }

    this.modal = document.createElement('div');
    this.modal.className = 'shortcuts-modal-overlay';
    this.modal.innerHTML = `
      <div class="shortcuts-modal">
        <div class="shortcuts-header">
          <h3>⌨️ Keyboard Shortcuts</h3>
          <button class="shortcuts-close" aria-label="Close">&times;</button>
        </div>
        <div class="shortcuts-list">
          ${this.shortcuts.map(s => `
            <div class="shortcut-item">
              <kbd>${s.key}</kbd>
              <span>${s.description}</span>
            </div>
          `).join('')}
        </div>
        <div class="shortcuts-footer">
          Press <kbd>Escape</kbd> or click outside to close
        </div>
      </div>
    `;

    // Add styles if not present
    if (!document.getElementById('shortcuts-styles')) {
      const style = document.createElement('style');
      style.id = 'shortcuts-styles';
      style.textContent = `
        .shortcuts-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10001;
          animation: fadeIn 0.2s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .shortcuts-modal {
          background: var(--card, #fff);
          border-radius: 16px;
          padding: 0;
          min-width: 400px;
          max-width: 500px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
          overflow: hidden;
        }
        
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        .shortcuts-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .shortcuts-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }
        
        .shortcuts-close {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        
        .shortcuts-close:hover {
          background: rgba(255,255,255,0.3);
        }
        
        .shortcuts-list {
          padding: 16px 24px;
          max-height: 400px;
          overflow-y: auto;
        }
        
        .shortcut-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid var(--border-light, #e5e7eb);
        }
        
        .shortcut-item:last-child {
          border-bottom: none;
        }
        
        .shortcut-item kbd {
          background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
          padding: 6px 12px;
          border-radius: 6px;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          min-width: 80px;
          text-align: center;
        }
        
        .shortcut-item span {
          color: var(--text-primary, #374151);
          font-size: 14px;
        }
        
        .shortcuts-footer {
          padding: 16px 24px;
          background: var(--bg-alt, #f9fafb);
          text-align: center;
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
        }
        
        .shortcuts-footer kbd {
          background: #e5e7eb;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
        }
        
        /* Dark mode */
        [data-theme="dark"] .shortcuts-modal {
          background: var(--card, #1f2937);
        }
        
        [data-theme="dark"] .shortcut-item kbd {
          background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
          color: #e5e7eb;
        }
        
        [data-theme="dark"] .shortcuts-footer {
          background: #111827;
        }
        
        @media (max-width: 480px) {
          .shortcuts-modal {
            min-width: auto;
            margin: 16px;
            max-height: 80vh;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.modal);

    // Close handlers
    this.modal.querySelector('.shortcuts-close').addEventListener('click', () => this.hideModal());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hideModal();
    });
  }

  hideModal() {
    if (this.modal) {
      this.modal.style.animation = 'fadeIn 0.2s ease reverse';
      setTimeout(() => {
        this.modal.remove();
        this.modal = null;
      }, 200);
    }
  }
}

/* =========================================================
   GLOBAL LOADING INDICATOR
   Shows spinner overlay during API calls
   ========================================================= */

class LoadingIndicator {
  constructor() {
    this.overlay = null;
    this.activeRequests = 0;
    this.init();
  }

  init() {
    // Create overlay element
    this.overlay = document.createElement('div');
    this.overlay.className = 'loading-overlay';
    this.overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading...</div>
      </div>
    `;

    // Add styles if not present
    if (!document.getElementById('loading-styles')) {
      const style = document.createElement('style');
      style.id = 'loading-styles';
      style.textContent = `
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s, visibility 0.2s;
          backdrop-filter: blur(4px);
        }
        
        .loading-overlay.active {
          opacity: 1;
          visibility: visible;
        }
        
        .loading-content {
          text-align: center;
        }
        
        .loading-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .loading-text {
          color: #374151;
          font-size: 14px;
          font-weight: 500;
        }
        
        /* Dark mode */
        [data-theme="dark"] .loading-overlay {
          background: rgba(17, 24, 39, 0.85);
        }
        
        [data-theme="dark"] .loading-spinner {
          border-color: #374151;
          border-top-color: #60a5fa;
        }
        
        [data-theme="dark"] .loading-text {
          color: #e5e7eb;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.overlay);

    // Intercept fetch to show loading automatically
    this.interceptFetch();
  }

  interceptFetch() {
    const originalFetch = window.fetch;
    const self = this;

    window.fetch = function(...args) {
      const url = args[0];
      
      // Only show loading for API calls
      if (typeof url === 'string' && url.includes('/api/')) {
        self.show();
      }

      return originalFetch.apply(this, args)
        .then(response => {
          if (typeof url === 'string' && url.includes('/api/')) {
            self.hide();
          }
          return response;
        })
        .catch(error => {
          if (typeof url === 'string' && url.includes('/api/')) {
            self.hide();
          }
          throw error;
        });
    };
  }

  show(text = 'Loading...') {
    this.activeRequests++;
    this.overlay.querySelector('.loading-text').textContent = text;
    this.overlay.classList.add('active');
  }

  hide() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) {
      this.overlay.classList.remove('active');
    }
  }

  forceHide() {
    this.activeRequests = 0;
    this.overlay.classList.remove('active');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.keyboardShortcuts = new KeyboardShortcuts();
  window.loadingIndicator = new LoadingIndicator();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KeyboardShortcuts, LoadingIndicator };
}
