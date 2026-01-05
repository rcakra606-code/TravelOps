/**
 * Form Dirty State Manager
 * Warns users before leaving page with unsaved changes
 */

class FormDirtyState {
  constructor() {
    this.dirtyForms = new Set();
    this.originalValues = new Map();
    this.init();
  }

  init() {
    // Listen for beforeunload
    window.addEventListener('beforeunload', (e) => {
      if (this.dirtyForms.size > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    });

    // Auto-track forms with data-track-dirty attribute
    document.addEventListener('DOMContentLoaded', () => {
      this.trackAllForms();
    });

    // Watch for dynamically added forms
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.matches && node.matches('form[data-track-dirty]')) {
              this.track(node);
            }
            const forms = node.querySelectorAll ? node.querySelectorAll('form[data-track-dirty]') : [];
            forms.forEach(form => this.track(form));
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Track all forms with data-track-dirty attribute
   */
  trackAllForms() {
    document.querySelectorAll('form[data-track-dirty]').forEach(form => {
      this.track(form);
    });
  }

  /**
   * Start tracking a form for changes
   */
  track(form) {
    if (!(form instanceof HTMLFormElement)) {
      form = document.querySelector(form);
    }
    if (!form) return;

    const formId = form.id || `form-${Date.now()}`;
    if (!form.id) form.id = formId;

    // Store original values
    this.storeOriginalValues(form);

    // Add change listeners
    const handleChange = () => {
      if (this.hasChanges(form)) {
        this.markDirty(formId);
      } else {
        this.markClean(formId);
      }
    };

    form.addEventListener('input', handleChange);
    form.addEventListener('change', handleChange);

    // Clear dirty state on successful submit
    form.addEventListener('submit', () => {
      this.markClean(formId);
    });

    // Add visual indicator
    this.addDirtyIndicator(form);
  }

  /**
   * Store original form values
   */
  storeOriginalValues(form) {
    const values = {};
    const elements = form.elements;
    
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.name) {
        if (el.type === 'checkbox' || el.type === 'radio') {
          values[el.name] = el.checked;
        } else {
          values[el.name] = el.value;
        }
      }
    }
    
    this.originalValues.set(form.id, values);
  }

  /**
   * Check if form has unsaved changes
   */
  hasChanges(form) {
    const original = this.originalValues.get(form.id);
    if (!original) return false;

    const elements = form.elements;
    
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.name && original.hasOwnProperty(el.name)) {
        let currentValue;
        if (el.type === 'checkbox' || el.type === 'radio') {
          currentValue = el.checked;
        } else {
          currentValue = el.value;
        }
        
        if (currentValue !== original[el.name]) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Mark form as dirty (has unsaved changes)
   */
  markDirty(formId) {
    this.dirtyForms.add(formId);
    this.updateIndicator(formId, true);
  }

  /**
   * Mark form as clean (no unsaved changes)
   */
  markClean(formId) {
    this.dirtyForms.delete(formId);
    this.updateIndicator(formId, false);
  }

  /**
   * Reset form tracking (call after save)
   */
  reset(form) {
    if (typeof form === 'string') {
      form = document.getElementById(form);
    }
    if (!form) return;

    this.markClean(form.id);
    this.storeOriginalValues(form);
  }

  /**
   * Add dirty indicator to form
   */
  addDirtyIndicator(form) {
    // Find form header or create indicator
    let indicator = form.querySelector('.dirty-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'dirty-indicator';
      indicator.style.cssText = `
        display: none;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        border: 1px solid #f59e0b;
        border-radius: 8px;
        font-size: 13px;
        color: #92400e;
        margin-bottom: 16px;
        animation: fadeIn 0.3s ease;
      `;
      indicator.innerHTML = `
        <span style="font-size: 16px;">⚠️</span>
        <span>You have unsaved changes</span>
      `;
      
      // Insert at top of form
      form.insertBefore(indicator, form.firstChild);
    }
  }

  /**
   * Update dirty indicator visibility
   */
  updateIndicator(formId, isDirty) {
    const form = document.getElementById(formId);
    if (!form) return;

    const indicator = form.querySelector('.dirty-indicator');
    if (indicator) {
      indicator.style.display = isDirty ? 'flex' : 'none';
    }
  }

  /**
   * Check if any forms have unsaved changes
   */
  hasUnsavedChanges() {
    return this.dirtyForms.size > 0;
  }

  /**
   * Get list of dirty form IDs
   */
  getDirtyForms() {
    return Array.from(this.dirtyForms);
  }

  /**
   * Show confirmation dialog before navigation
   */
  async confirmNavigation(targetUrl) {
    if (!this.hasUnsavedChanges()) {
      return true;
    }

    return new Promise((resolve) => {
      if (window.confirmDialog) {
        window.confirmDialog.show({
          title: 'Unsaved Changes',
          message: 'You have unsaved changes. Do you want to leave without saving?',
          icon: '⚠️',
          confirmText: 'Leave',
          cancelText: 'Stay',
          confirmColor: '#f59e0b'
        }).then(confirmed => {
          resolve(confirmed);
        });
      } else {
        const confirmed = confirm('You have unsaved changes. Do you want to leave?');
        resolve(confirmed);
      }
    });
  }
}

// Global instance
window.formDirtyState = new FormDirtyState();

// Add styles
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .dirty-indicator {
    animation: fadeIn 0.3s ease;
  }
`;
document.head.appendChild(style);
