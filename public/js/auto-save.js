/* =========================================================
   AUTO-SAVE FUNCTIONALITY
   Automatic form draft saving to localStorage
   ========================================================= */

class AutoSave {
  constructor(formId, storageKey, options = {}) {
    this.formId = formId;
    this.storageKey = storageKey;
    this.saveDelay = options.saveDelay || 2000;
    this.indicator = options.indicator || true;
    this.saveTimer = null;
    this.lastSaved = null;
    
    this.init();
  }

  init() {
    const form = document.getElementById(this.formId);
    if (!form) return;

    // Load saved draft
    this.loadDraft();

    // Auto-save on input
    form.addEventListener('input', () => {
      clearTimeout(this.saveTimer);
      this.showSaving();
      this.saveTimer = setTimeout(() => {
        this.saveDraft();
      }, this.saveDelay);
    });

    // Show indicator if enabled
    if (this.indicator) {
      this.createIndicator();
    }
  }

  createIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'autosave-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--card);
      padding: 8px 16px;
      border-radius: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      font-size: 0.85rem;
      color: var(--text-secondary);
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
      pointer-events: none;
    `;
    document.body.appendChild(indicator);
  }

  showSaving() {
    const indicator = document.getElementById('autosave-indicator');
    if (!indicator) return;
    
    indicator.textContent = '💾 Saving draft...';
    indicator.style.opacity = '1';
  }

  showSaved() {
    const indicator = document.getElementById('autosave-indicator');
    if (!indicator) return;
    
    indicator.textContent = '✓ Draft saved';
    indicator.style.opacity = '1';
    
    setTimeout(() => {
      indicator.style.opacity = '0';
    }, 2000);
  }

  saveDraft() {
    const form = document.getElementById(this.formId);
    if (!form) return;

    const formData = new FormData(form);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }

    localStorage.setItem(this.storageKey, JSON.stringify({
      data: data,
      timestamp: Date.now()
    }));

    this.lastSaved = Date.now();
    this.showSaved();
  }

  loadDraft() {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return;

    try {
      const { data, timestamp } = JSON.parse(saved);
      
      // Don't load drafts older than 24 hours
      if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        this.clearDraft();
        return;
      }

      const form = document.getElementById(this.formId);
      if (!form) return;

      // Ask user if they want to restore
      const restore = confirm('Found a saved draft from ' + new Date(timestamp).toLocaleString() + '. Restore it?');
      if (!restore) {
        this.clearDraft();
        return;
      }

      // Populate form
      Object.keys(data).forEach(key => {
        const field = form.elements[key];
        if (field) {
          field.value = data[key];
        }
      });

      window.toast?.success('Draft restored');
    } catch (err) {
      console.error('Failed to load draft:', err);
    }
  }

  clearDraft() {
    localStorage.removeItem(this.storageKey);
  }
}

window.AutoSave = AutoSave;
