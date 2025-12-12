/**
 * Form Validation Utility
 * Client-side validation with beautiful error messages
 */

class FormValidator {
  constructor(formElement, rules = {}) {
    this.form = formElement;
    this.rules = rules;
    this.errors = {};
  }

  /**
   * Validate entire form
   */
  validate() {
    this.errors = {};
    let isValid = true;

    Object.entries(this.rules).forEach(([fieldName, fieldRules]) => {
      const field = this.form.querySelector(`[name="${fieldName}"]`);
      if (!field) return;

      const value = this.getFieldValue(field);
      const fieldErrors = this.validateField(field, value, fieldRules);

      if (fieldErrors.length > 0) {
        this.errors[fieldName] = fieldErrors;
        isValid = false;
        this.showFieldError(field, fieldErrors[0]);
      } else {
        this.clearFieldError(field);
      }
    });

    return isValid;
  }

  /**
   * Validate single field
   */
  validateField(field, value, rules) {
    const errors = [];

    // Required
    if (rules.required && !value) {
      errors.push(rules.messages?.required || 'This field is required');
    }

    // Skip other validations if empty and not required
    if (!value && !rules.required) return errors;

    // Min length
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(rules.messages?.minLength || `Minimum ${rules.minLength} characters required`);
    }

    // Max length
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(rules.messages?.maxLength || `Maximum ${rules.maxLength} characters allowed`);
    }

    // Min value
    if (rules.min !== undefined && parseFloat(value) < rules.min) {
      errors.push(rules.messages?.min || `Minimum value is ${rules.min}`);
    }

    // Max value
    if (rules.max !== undefined && parseFloat(value) > rules.max) {
      errors.push(rules.messages?.max || `Maximum value is ${rules.max}`);
    }

    // Email
    if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(rules.messages?.email || 'Please enter a valid email address');
    }

    // URL
    if (rules.url && !/^https?:\/\/.+/.test(value)) {
      errors.push(rules.messages?.url || 'Please enter a valid URL');
    }

    // Phone
    if (rules.phone && !/^[\d\s\-\+\(\)]+$/.test(value)) {
      errors.push(rules.messages?.phone || 'Please enter a valid phone number');
    }

    // Pattern
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      errors.push(rules.messages?.pattern || 'Invalid format');
    }

    // Custom validator
    if (rules.validator && typeof rules.validator === 'function') {
      const customError = rules.validator(value, this.form);
      if (customError) errors.push(customError);
    }

    // Match field
    if (rules.matches) {
      const matchField = this.form.querySelector(`[name="${rules.matches}"]`);
      if (matchField && value !== this.getFieldValue(matchField)) {
        errors.push(rules.messages?.matches || 'Fields do not match');
      }
    }

    return errors;
  }

  /**
   * Get field value (handles different input types)
   */
  getFieldValue(field) {
    if (field.type === 'checkbox') {
      return field.checked ? field.value : '';
    } else if (field.type === 'radio') {
      const checked = this.form.querySelector(`[name="${field.name}"]:checked`);
      return checked ? checked.value : '';
    } else {
      return field.value.trim();
    }
  }

  /**
   * Show field error
   */
  showFieldError(field, message) {
    const wrapper = field.closest('.form-field, .form-group');
    if (!wrapper) return;

    wrapper.classList.add('has-error');
    
    let errorEl = wrapper.querySelector('.field-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'field-error';
      wrapper.appendChild(errorEl);
    }
    
    errorEl.textContent = message;
    errorEl.style.display = 'block';

    // Shake animation
    field.style.animation = 'shake 0.3s';
    setTimeout(() => {
      field.style.animation = '';
    }, 300);
  }

  /**
   * Clear field error
   */
  clearFieldError(field) {
    const wrapper = field.closest('.form-field, .form-group');
    if (!wrapper) return;

    wrapper.classList.remove('has-error');
    
    const errorEl = wrapper.querySelector('.field-error');
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
  }

  /**
   * Setup real-time validation
   */
  setupRealtimeValidation() {
    Object.keys(this.rules).forEach(fieldName => {
      const field = this.form.querySelector(`[name="${fieldName}"]`);
      if (!field) return;

      const validateOnBlur = () => {
        const value = this.getFieldValue(field);
        const errors = this.validateField(field, value, this.rules[fieldName]);
        
        if (errors.length > 0) {
          this.showFieldError(field, errors[0]);
        } else {
          this.clearFieldError(field);
        }
      };

      field.addEventListener('blur', validateOnBlur);
      field.addEventListener('change', validateOnBlur);
    });
  }

  /**
   * Get all errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Clear all errors
   */
  clearAllErrors() {
    Object.keys(this.rules).forEach(fieldName => {
      const field = this.form.querySelector(`[name="${fieldName}"]`);
      if (field) this.clearFieldError(field);
    });
    this.errors = {};
  }
}

/**
 * Password Strength Indicator
 * Shows visual feedback for password strength
 */
class PasswordStrengthIndicator {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      minLength: 8,
      showText: true,
      ...options
    };
    this.indicator = null;
    this.init();
  }

  init() {
    // Create indicator container
    this.indicator = document.createElement('div');
    this.indicator.className = 'password-strength-indicator';
    this.indicator.innerHTML = `
      <div class="strength-bar-container">
        <div class="strength-bar"></div>
      </div>
      <span class="strength-text"></span>
    `;
    this.input.parentNode.insertBefore(this.indicator, this.input.nextSibling);
    
    // Add styles if not exist
    if (!document.getElementById('password-strength-styles')) {
      const style = document.createElement('style');
      style.id = 'password-strength-styles';
      style.textContent = `
        .password-strength-indicator {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .strength-bar-container {
          flex: 1;
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          overflow: hidden;
        }
        .strength-bar {
          height: 100%;
          width: 0;
          transition: width 0.3s, background 0.3s;
          border-radius: 3px;
        }
        .strength-text {
          font-size: 12px;
          font-weight: 500;
          min-width: 70px;
        }
        .strength-weak { background: #ef4444; }
        .strength-fair { background: #f59e0b; }
        .strength-good { background: #10b981; }
        .strength-strong { background: #059669; }
      `;
      document.head.appendChild(style);
    }

    // Listen for input
    this.input.addEventListener('input', () => this.check());
  }

  check() {
    const password = this.input.value;
    const result = this.evaluate(password);
    
    const bar = this.indicator.querySelector('.strength-bar');
    const text = this.indicator.querySelector('.strength-text');
    
    bar.className = 'strength-bar';
    bar.style.width = `${result.score * 25}%`;
    bar.classList.add(`strength-${result.level}`);
    
    text.textContent = result.label;
    text.style.color = result.color;
  }

  evaluate(password) {
    let score = 0;
    
    if (!password) {
      return { score: 0, level: 'weak', label: '', color: '#6b7280' };
    }
    
    // Length checks
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    
    // Character variety
    if (/[a-z]/.test(password)) score += 0.5;
    if (/[A-Z]/.test(password)) score += 0.5;
    if (/[0-9]/.test(password)) score += 0.5;
    if (/[^a-zA-Z0-9]/.test(password)) score += 0.5;
    
    // Determine level
    let level, label, color;
    if (score <= 1) {
      level = 'weak'; label = 'Weak'; color = '#ef4444';
    } else if (score <= 2) {
      level = 'fair'; label = 'Fair'; color = '#f59e0b';
    } else if (score <= 3) {
      level = 'good'; label = 'Good'; color = '#10b981';
    } else {
      level = 'strong'; label = 'Strong'; color = '#059669';
    }
    
    return { score: Math.min(score, 4), level, label, color };
  }

  destroy() {
    if (this.indicator) {
      this.indicator.remove();
    }
  }
}

// Shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
  }
`;
document.head.appendChild(style);

// Export
if (typeof window !== 'undefined') {
  window.FormValidator = FormValidator;
  window.PasswordStrengthIndicator = PasswordStrengthIndicator;
}
