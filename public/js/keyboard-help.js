/**
 * Keyboard Shortcuts Help Modal
 * Press ? to show all available keyboard shortcuts
 */

class KeyboardShortcutsHelp {
  constructor() {
    this.shortcuts = [
      { category: 'Navigation', items: [
        { keys: ['Alt', 'H'], description: 'Go to Home Dashboard' },
        { keys: ['Alt', 'S'], description: 'Go to Sales' },
        { keys: ['Alt', 'T'], description: 'Go to Tours' },
        { keys: ['Alt', 'D'], description: 'Go to Documents' },
        { keys: ['Alt', 'R'], description: 'Open Recent Items' },
      ]},
      { category: 'Actions', items: [
        { keys: ['Ctrl', 'N'], description: 'Create New Record' },
        { keys: ['Ctrl', 'F'], description: 'Focus Search' },
        { keys: ['Ctrl', 'E'], description: 'Export Data' },
        { keys: ['Ctrl', 'Z'], description: 'Undo Last Delete' },
        { keys: ['Escape'], description: 'Close Modal / Cancel' },
      ]},
      { category: 'Table Navigation', items: [
        { keys: ['↑', '↓'], description: 'Navigate Rows' },
        { keys: ['Enter'], description: 'Open Selected Record' },
        { keys: ['Delete'], description: 'Delete Selected' },
        { keys: ['Ctrl', 'A'], description: 'Select All (in bulk mode)' },
      ]},
      { category: 'General', items: [
        { keys: ['?'], description: 'Show This Help' },
        { keys: ['Ctrl', '/'], description: 'Toggle Sidebar' },
      ]}
    ];
    
    this.init();
  }

  init() {
    this.addStyles();
    this.bindEvents();
  }

  bindEvents() {
    document.addEventListener('keydown', (e) => {
      // Show help on ? key (Shift + /)
      if (e.key === '?' && !e.target.matches('input, textarea, select')) {
        e.preventDefault();
        this.show();
      }

      // Close on Escape
      if (e.key === 'Escape') {
        this.hide();
      }

      // Navigation shortcuts
      if (e.altKey && !e.target.matches('input, textarea, select')) {
        switch(e.key.toLowerCase()) {
          case 'h':
            e.preventDefault();
            window.location.href = '/single-dashboard.html';
            break;
          case 's':
            e.preventDefault();
            window.location.href = '/sales-targets-dashboard.html';
            break;
          case 't':
            e.preventDefault();
            window.location.href = '/tours-dashboard.html';
            break;
          case 'd':
            e.preventDefault();
            window.location.href = '/documents-dashboard.html';
            break;
        }
      }

      // Action shortcuts
      if (e.ctrlKey && !e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 'n':
            if (!e.target.matches('input, textarea, select')) {
              e.preventDefault();
              // Find and click add button
              const addBtn = document.querySelector('[id*="addBtn"], [id*="AddBtn"], .btn-primary:contains("Add")');
              if (addBtn) addBtn.click();
            }
            break;
          case 'f':
            e.preventDefault();
            const searchInput = document.querySelector('input[type="search"], input[id*="search"], input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
            break;
          case 'e':
            if (!e.target.matches('input, textarea, select')) {
              e.preventDefault();
              const exportBtn = document.querySelector('[id*="export"], [id*="Export"]');
              if (exportBtn) exportBtn.click();
            }
            break;
        }
      }

      // Toggle sidebar
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
          sidebar.classList.toggle('collapsed');
        }
      }
    });
  }

  show() {
    if (document.getElementById('shortcutsHelpModal')) {
      document.getElementById('shortcutsHelpModal').classList.add('show');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'shortcutsHelpModal';
    modal.className = 'shortcuts-help-modal';
    modal.innerHTML = `
      <div class="shortcuts-help-content">
        <div class="shortcuts-help-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button class="shortcuts-close-btn" id="closeShortcutsHelp">&times;</button>
        </div>
        <div class="shortcuts-help-body">
          ${this.shortcuts.map(cat => `
            <div class="shortcuts-category">
              <h3>${cat.category}</h3>
              <div class="shortcuts-list">
                ${cat.items.map(item => `
                  <div class="shortcut-item">
                    <div class="shortcut-keys">
                      ${item.keys.map(k => `<kbd>${k}</kbd>`).join('<span class="key-plus">+</span>')}
                    </div>
                    <div class="shortcut-desc">${item.description}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="shortcuts-help-footer">
          Press <kbd>?</kbd> anytime to show this help
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    document.getElementById('closeShortcutsHelp')?.addEventListener('click', () => this.hide());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hide();
    });
  }

  hide() {
    const modal = document.getElementById('shortcutsHelpModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  addStyles() {
    if (document.getElementById('shortcutsHelpStyles')) return;

    const style = document.createElement('style');
    style.id = 'shortcutsHelpStyles';
    style.textContent = `
      .shortcuts-help-modal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s;
        backdrop-filter: blur(4px);
      }

      .shortcuts-help-modal.show {
        opacity: 1;
        visibility: visible;
      }

      .shortcuts-help-content {
        background: var(--card, #fff);
        border-radius: 16px;
        width: 90%;
        max-width: 700px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        transform: scale(0.9);
        transition: transform 0.2s;
      }

      .shortcuts-help-modal.show .shortcuts-help-content {
        transform: scale(1);
      }

      .shortcuts-help-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 24px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
        background: var(--bg-alt, #f9fafb);
      }

      .shortcuts-help-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--text-primary, #1f2937);
      }

      .shortcuts-close-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: var(--card, #fff);
        border-radius: 8px;
        font-size: 24px;
        cursor: pointer;
        color: var(--text-secondary, #6b7280);
        transition: all 0.2s;
      }

      .shortcuts-close-btn:hover {
        background: #fee2e2;
        color: #dc2626;
      }

      .shortcuts-help-body {
        padding: 24px;
        overflow-y: auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 24px;
      }

      .shortcuts-category h3 {
        font-size: 14px;
        font-weight: 600;
        color: var(--primary, #3b82f6);
        margin: 0 0 12px 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .shortcut-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 8px;
      }

      .shortcut-keys {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .shortcut-keys kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 8px;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 6px;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-primary, #1f2937);
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }

      .key-plus {
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }

      .shortcut-desc {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }

      .shortcuts-help-footer {
        padding: 16px 24px;
        border-top: 1px solid var(--border-light, #e5e7eb);
        background: var(--bg-alt, #f9fafb);
        text-align: center;
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }

      .shortcuts-help-footer kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        padding: 0 6px;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 4px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        font-weight: 600;
        margin: 0 4px;
      }

    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.keyboardShortcutsHelp = new KeyboardShortcutsHelp();
