/**
 * Quick View Panel
 * Side panel for viewing details without opening modal
 */

class QuickViewPanel {
  constructor() {
    this.panel = null;
    this.isOpen = false;
    this.init();
  }

  init() {
    // Create panel if it doesn't exist
    if (document.getElementById('quickViewPanel')) {
      this.panel = document.getElementById('quickViewPanel');
      return;
    }

    this.panel = document.createElement('div');
    this.panel.id = 'quickViewPanel';
    this.panel.className = 'quick-view-panel';
    this.panel.innerHTML = `
      <div class="quick-view-overlay"></div>
      <div class="quick-view-content">
        <div class="quick-view-header">
          <h3 class="quick-view-title">Quick View</h3>
          <button class="quick-view-close" aria-label="Close">&times;</button>
        </div>
        <div class="quick-view-body">
          <!-- Content will be inserted here -->
        </div>
      </div>
    `;
    
    document.body.appendChild(this.panel);

    // Add styles
    this.addStyles();

    // Event listeners
    const closeBtn = this.panel.querySelector('.quick-view-close');
    const overlay = this.panel.querySelector('.quick-view-overlay');
    
    closeBtn.addEventListener('click', () => this.close());
    overlay.addEventListener('click', () => this.close());
    
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  addStyles() {
    if (document.getElementById('quickViewStyles')) return;

    const style = document.createElement('style');
    style.id = 'quickViewStyles';
    style.textContent = `
      .quick-view-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 9999;
        pointer-events: none;
        transition: all 0.3s ease;
      }

      .quick-view-panel.visible {
        pointer-events: all;
      }

      .quick-view-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .quick-view-panel.visible .quick-view-overlay {
        opacity: 1;
      }

      .quick-view-content {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-width: 500px;
        background: var(--card, #fff);
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        display: flex;
        flex-direction: column;
      }

      .quick-view-panel.visible .quick-view-content {
        transform: translateX(0);
      }

      .quick-view-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
        flex-shrink: 0;
      }

      .quick-view-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary, #111827);
        margin: 0;
      }

      .quick-view-close {
        background: none;
        border: none;
        font-size: 2rem;
        line-height: 1;
        color: var(--muted, #6b7280);
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .quick-view-close:hover {
        background: var(--bg-alt, #f3f4f6);
        color: var(--text-primary, #111827);
      }

      .quick-view-body {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }

      .quick-view-section {
        margin-bottom: 24px;
      }

      .quick-view-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--muted, #6b7280);
        margin-bottom: 12px;
      }

      .quick-view-field {
        display: flex;
        justify-content: space-between;
        align-items: start;
        padding: 12px 0;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }

      .quick-view-field:last-child {
        border-bottom: none;
      }

      .quick-view-field-label {
        font-weight: 500;
        color: var(--text-secondary, #4b5563);
        flex-shrink: 0;
        margin-right: 16px;
      }

      .quick-view-field-value {
        font-weight: 600;
        color: var(--text-primary, #111827);
        text-align: right;
        word-break: break-word;
      }

      @media (max-width: 768px) {
        .quick-view-content {
          max-width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  open(data, title = 'Quick View') {
    if (!this.panel) this.init();

    const titleEl = this.panel.querySelector('.quick-view-title');
    const bodyEl = this.panel.querySelector('.quick-view-body');

    titleEl.textContent = title;
    bodyEl.innerHTML = this.renderContent(data);

    this.panel.classList.add('visible');
    this.isOpen = true;

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (!this.panel) return;

    this.panel.classList.remove('visible');
    this.isOpen = false;

    // Restore body scroll
    document.body.style.overflow = '';
  }

  renderContent(data) {
    if (Array.isArray(data)) {
      // Render array of sections
      return data.map(section => `
        <div class="quick-view-section">
          ${section.title ? `<div class="quick-view-section-title">${section.title}</div>` : ''}
          ${this.renderFields(section.fields || section)}
        </div>
      `).join('');
    } else {
      // Render single object
      return this.renderFields(data);
    }
  }

  renderFields(fields) {
    return Object.entries(fields)
      .filter(([key]) => !key.startsWith('_')) // Skip internal fields
      .map(([key, value]) => {
        const label = this.formatLabel(key);
        const displayValue = this.formatValue(value);
        
        return `
          <div class="quick-view-field">
            <div class="quick-view-field-label">${label}</div>
            <div class="quick-view-field-value">${displayValue}</div>
          </div>
        `;
      }).join('');
  }

  formatLabel(key) {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  formatValue(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object' && value.toString) return value.toString();
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return new Date(value).toLocaleDateString();
    }
    return String(value);
  }
}

// Global instance
const quickView = new QuickViewPanel();

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.QuickViewPanel = QuickViewPanel;
  window.quickView = quickView;
}
