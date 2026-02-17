/**
 * Security Utilities
 * Shared security functions for XSS prevention and input sanitization
 */

const SecurityUtils = {
  /**
   * Escape HTML special characters to prevent XSS attacks
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text safe for innerHTML
   */
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') text = String(text);
    
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };
    
    return text.replace(/[&<>"'`=\/]/g, char => htmlEscapes[char]);
  },

  /**
   * Sanitize a string for use in HTML attributes
   * @param {string} text - Text to sanitize
   * @returns {string} - Sanitized text safe for attributes
   */
  escapeAttribute(text) {
    return this.escapeHtml(text).replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
  },

  /**
   * Sanitize an object's string values recursively
   * @param {object} obj - Object to sanitize
   * @returns {object} - Sanitized object
   */
  sanitizeObject(obj) {
    if (typeof obj === 'string') return this.escapeHtml(obj);
    if (Array.isArray(obj)) return obj.map(item => this.sanitizeObject(item));
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.sanitizeObject(obj[key]);
      }
      return result;
    }
    return obj;
  },

  /**
   * Create a safe HTML string from template literal with auto-escaping
   * Usage: SecurityUtils.html`<div>${userInput}</div>`
   * @param {TemplateStringsArray} strings - Template strings
   * @param {...any} values - Values to escape
   * @returns {string} - Safe HTML string
   */
  html(strings, ...values) {
    return strings.reduce((result, string, i) => {
      const value = values[i - 1];
      const escapedValue = typeof value === 'string' ? this.escapeHtml(value) : (value ?? '');
      return result + escapedValue + string;
    });
  },

  /**
   * Validate URL to prevent javascript: and data: protocol injections
   * @param {string} url - URL to validate
   * @returns {boolean} - True if URL is safe
   */
  isSafeUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },

  /**
   * Sanitize URL, returning safe URL or empty string
   * @param {string} url - URL to sanitize
   * @returns {string} - Safe URL or empty string
   */
  sanitizeUrl(url) {
    return this.isSafeUrl(url) ? url : '';
  }
};

// Make escapeHtml globally available for convenience
window.escapeHtml = SecurityUtils.escapeHtml.bind(SecurityUtils);

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityUtils;
}
