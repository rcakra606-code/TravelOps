/**
 * Smart Form Defaults
 * Pre-fill forms with sensible defaults based on context
 */

class SmartDefaults {
  constructor() {
    this.defaults = {};
    this.init();
  }

  init() {
    // Listen for modal opens to apply defaults
    document.addEventListener('DOMContentLoaded', () => {
      this.observeModals();
    });
  }

  /**
   * Register default values for a form
   */
  register(formId, defaults) {
    this.defaults[formId] = defaults;
  }

  /**
   * Apply defaults to a form
   */
  apply(form, context = {}) {
    if (typeof form === 'string') {
      form = document.getElementById(form) || document.querySelector(form);
    }
    if (!form) return;

    const formId = form.id;
    const defaults = this.defaults[formId] || {};

    // Apply each default
    Object.entries(defaults).forEach(([fieldName, defaultConfig]) => {
      const field = form.querySelector(`[name="${fieldName}"]`);
      if (!field) return;

      // Skip if field already has a value (editing mode)
      if (field.value && field.value !== '' && context.mode !== 'create') return;

      let value = this.resolveDefault(defaultConfig, context);
      
      if (value !== undefined && value !== null) {
        this.setFieldValue(field, value);
      }
    });

    // Apply common smart defaults
    this.applyCommonDefaults(form, context);
  }

  /**
   * Resolve default value (can be static, function, or special keyword)
   */
  resolveDefault(config, context) {
    // If it's a function, call it
    if (typeof config === 'function') {
      return config(context);
    }

    // If it's a string with special keyword
    if (typeof config === 'string') {
      return this.resolveKeyword(config, context);
    }

    // If it's an object with type
    if (typeof config === 'object' && config.type) {
      return this.resolveTypedDefault(config, context);
    }

    // Static value
    return config;
  }

  /**
   * Resolve special keywords
   */
  resolveKeyword(keyword, context) {
    const keywords = {
      '$today': () => this.formatDate(new Date()),
      '$now': () => this.formatDateTime(new Date()),
      '$currentUser': () => this.getCurrentUsername(),
      '$currentUserId': () => this.getCurrentUserId(),
      '$currentMonth': () => this.getCurrentMonth(),
      '$currentYear': () => new Date().getFullYear(),
      '$nextWeek': () => this.formatDate(this.addDays(new Date(), 7)),
      '$tomorrow': () => this.formatDate(this.addDays(new Date(), 1)),
      '$startOfMonth': () => this.formatDate(this.startOfMonth(new Date())),
      '$endOfMonth': () => this.formatDate(this.endOfMonth(new Date())),
    };

    const resolver = keywords[keyword];
    return resolver ? resolver() : keyword;
  }

  /**
   * Resolve typed default configuration
   */
  resolveTypedDefault(config, context) {
    switch (config.type) {
      case 'date':
        return this.resolveDateDefault(config);
      case 'sequence':
        return this.resolveSequence(config);
      case 'random':
        return this.resolveRandom(config);
      case 'localStorage':
        return localStorage.getItem(config.key);
      case 'context':
        return context[config.key];
      default:
        return config.value;
    }
  }

  /**
   * Resolve date default
   */
  resolveDateDefault(config) {
    let date = new Date();
    
    if (config.offset) {
      date = this.addDays(date, config.offset);
    }
    
    if (config.weekday) {
      date = this.nextWeekday(date, config.weekday);
    }

    return this.formatDate(date);
  }

  /**
   * Resolve sequence (auto-increment)
   */
  resolveSequence(config) {
    const key = `sequence_${config.prefix || 'default'}`;
    let current = parseInt(localStorage.getItem(key) || '0');
    current++;
    localStorage.setItem(key, current.toString());
    
    const prefix = config.prefix || '';
    const padding = config.padding || 4;
    
    return prefix + current.toString().padStart(padding, '0');
  }

  /**
   * Resolve random value
   */
  resolveRandom(config) {
    if (config.options && config.options.length > 0) {
      return config.options[Math.floor(Math.random() * config.options.length)];
    }
    return Math.random().toString(36).substr(2, config.length || 8);
  }

  /**
   * Apply common smart defaults
   */
  applyCommonDefaults(form, context) {
    // Date fields - default to today
    form.querySelectorAll('input[type="date"]:not([data-no-default])').forEach(input => {
      if (!input.value && !input.dataset.skipDefault) {
        // Check if field name suggests a future date
        const name = input.name.toLowerCase();
        if (name.includes('departure') || name.includes('check_in') || name.includes('start')) {
          input.value = this.formatDate(this.addDays(new Date(), 7));
        } else if (name.includes('return') || name.includes('check_out') || name.includes('end')) {
          input.value = this.formatDate(this.addDays(new Date(), 14));
        } else {
          input.value = this.formatDate(new Date());
        }
      }
    });

    // User select fields - default to current user
    form.querySelectorAll('select[name*="user"], select[name*="staff"], select[name*="pic"]').forEach(select => {
      if (!select.value && !select.dataset.skipDefault) {
        const currentUserId = this.getCurrentUserId();
        if (currentUserId) {
          const option = select.querySelector(`option[value="${currentUserId}"]`);
          if (option) {
            select.value = currentUserId;
          }
        }
      }
    });

    // Status fields - default to first or "active"
    form.querySelectorAll('select[name*="status"]').forEach(select => {
      if (!select.value && !select.dataset.skipDefault) {
        const activeOption = select.querySelector('option[value="active"], option[value="pending"], option[value="new"]');
        if (activeOption) {
          select.value = activeOption.value;
        } else if (select.options.length > 1) {
          select.value = select.options[1].value;
        }
      }
    });

    // Currency fields - default to IDR
    form.querySelectorAll('select[name*="currency"]').forEach(select => {
      if (!select.value && !select.dataset.skipDefault) {
        const idrOption = select.querySelector('option[value="IDR"]');
        if (idrOption) {
          select.value = 'IDR';
        }
      }
    });

    // Quantity fields - default to 1
    form.querySelectorAll('input[name*="qty"], input[name*="quantity"], input[name*="pax"]').forEach(input => {
      if (!input.value && !input.dataset.skipDefault) {
        input.value = '1';
      }
    });
  }

  /**
   * Set field value handling different input types
   */
  setFieldValue(field, value) {
    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else if (field.type === 'radio') {
      const radio = field.form.querySelector(`input[name="${field.name}"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else {
      field.value = value;
    }

    // Trigger change event
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Observe modal opens to apply defaults
   */
  observeModals() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // Check if it's a modal with a form
            const form = node.querySelector ? node.querySelector('form[data-smart-defaults]') : null;
            if (form) {
              this.apply(form, { mode: 'create' });
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Utility methods
  formatDate(date) {
    return date.toISOString().slice(0, 10);
  }

  formatDateTime(date) {
    return date.toISOString().slice(0, 16);
  }

  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  nextWeekday(date, weekday) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(weekday.toLowerCase());
    if (targetDay === -1) return date;
    
    const result = new Date(date);
    const currentDay = result.getDay();
    const diff = (targetDay - currentDay + 7) % 7 || 7;
    result.setDate(result.getDate() + diff);
    return result;
  }

  getCurrentMonth() {
    return new Date().toLocaleString('default', { month: 'long' });
  }

  getCurrentUsername() {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.username || user.name || '';
    } catch {
      return '';
    }
  }

  getCurrentUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.id || user.user_id || '';
    } catch {
      return '';
    }
  }
}

// Global instance
window.smartDefaults = new SmartDefaults();

// Register common form defaults
window.smartDefaults.register('salesForm', {
  transaction_date: '$today',
  currency: 'IDR',
  region: () => localStorage.getItem('lastSelectedRegion') || ''
});

window.smartDefaults.register('toursForm', {
  registration_date: '$today',
  departure_date: { type: 'date', offset: 14 },
  status: 'pending'
});

window.smartDefaults.register('documentsForm', {
  receive_date: '$today',
  status: 'received'
});

window.smartDefaults.register('hotelForm', {
  check_in: { type: 'date', offset: 7 },
  check_out: { type: 'date', offset: 8 },
  currency: 'IDR'
});
