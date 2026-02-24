/**
 * Error Recovery Handler
 * Provides better error messages and recovery options
 */

class ErrorRecovery {
  constructor() {
    this.retryQueue = new Map();
    this.init();
  }

  init() {
    // Add global error handler for fetch
    this.patchFetch();
  }

  /**
   * Patch global fetch to add error handling
   */
  patchFetch() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch.apply(window, args);
        
        if (!response.ok) {
          const errorData = await this.parseErrorResponse(response.clone());
          throw new FetchError(response.status, errorData, args);
        }
        
        return response;
      } catch (error) {
        if (error instanceof FetchError) {
          throw error;
        }
        
        // Network error
        throw new FetchError(0, { message: 'Network error. Please check your connection.' }, args);
      }
    };
  }

  /**
   * Parse error response
   */
  async parseErrorResponse(response) {
    try {
      const data = await response.json();
      return data;
    } catch {
      return { message: response.statusText || 'An error occurred' };
    }
  }

  /**
   * Show error with recovery options
   */
  showError(error, options = {}) {
    const {
      onRetry,
      onDismiss,
      context = 'operation'
    } = options;

    const errorInfo = this.getErrorInfo(error);
    
    // Create error panel
    const panel = document.createElement('div');
    panel.className = 'error-recovery-panel';
    panel.id = `error-panel-${Date.now()}`;
    panel.innerHTML = `
      <div class="error-recovery-overlay"></div>
      <div class="error-recovery-content">
        <div class="error-icon">${errorInfo.icon}</div>
        <h3 class="error-title">${errorInfo.title}</h3>
        <p class="error-message">${this.escapeHtml(errorInfo.message)}</p>
        ${errorInfo.suggestion ? `<p class="error-suggestion">💡 ${this.escapeHtml(errorInfo.suggestion)}</p>` : ''}
        <div class="error-actions">
          ${onRetry ? '<button class="btn-retry">🔄 Try Again</button>' : ''}
          <button class="btn-dismiss">Dismiss</button>
          ${errorInfo.helpUrl ? `<a href="${errorInfo.helpUrl}" target="_blank" class="btn-help">📖 Learn More</a>` : ''}
        </div>
        ${error.details ? `
          <details class="error-details">
            <summary>Technical Details</summary>
            <pre>${this.escapeHtml(JSON.stringify(error.details, null, 2))}</pre>
          </details>
        ` : ''}
      </div>
    `;

    // Add styles if not present
    this.addStyles();

    // Event handlers
    const overlay = panel.querySelector('.error-recovery-overlay');
    const dismissBtn = panel.querySelector('.btn-dismiss');
    const retryBtn = panel.querySelector('.btn-retry');

    const close = () => {
      panel.classList.add('closing');
      setTimeout(() => panel.remove(), 300);
      if (onDismiss) onDismiss();
    };

    overlay.addEventListener('click', close);
    dismissBtn.addEventListener('click', close);
    
    if (retryBtn && onRetry) {
      retryBtn.addEventListener('click', () => {
        close();
        onRetry();
      });
    }

    document.body.appendChild(panel);
    
    // Animate in
    requestAnimationFrame(() => {
      panel.classList.add('visible');
    });

    return panel;
  }

  /**
   * Get user-friendly error information
   */
  getErrorInfo(error) {
    const statusCode = error.status || error.statusCode || 0;
    
    const errorMap = {
      0: {
        icon: '🌐',
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection.',
        suggestion: 'Make sure you\'re connected to the internet and try again.'
      },
      400: {
        icon: '⚠️',
        title: 'Invalid Request',
        message: error.message || 'The data you submitted is invalid.',
        suggestion: 'Please check your input and try again.'
      },
      401: {
        icon: '🔒',
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again.',
        suggestion: 'Click the button below to log in again.'
      },
      403: {
        icon: '🚫',
        title: 'Access Denied',
        message: 'You don\'t have permission to perform this action.',
        suggestion: 'Contact your administrator if you believe this is an error.'
      },
      404: {
        icon: '🔍',
        title: 'Not Found',
        message: 'The requested item could not be found.',
        suggestion: 'It may have been deleted or moved.'
      },
      409: {
        icon: '⚡',
        title: 'Conflict Detected',
        message: 'This item has been modified by another user.',
        suggestion: 'Refresh the page to see the latest changes.'
      },
      422: {
        icon: '📝',
        title: 'Validation Error',
        message: error.message || 'Please check your input data.',
        suggestion: 'Review the highlighted fields and correct any errors.'
      },
      429: {
        icon: '⏱️',
        title: 'Too Many Requests',
        message: 'You\'re doing that too often. Please wait a moment.',
        suggestion: 'Wait a few seconds before trying again.'
      },
      500: {
        icon: '🔧',
        title: 'Server Error',
        message: 'Something went wrong on our end.',
        suggestion: 'Please try again later or contact support if the problem persists.'
      },
      502: {
        icon: '🔌',
        title: 'Bad Gateway',
        message: 'The server is temporarily unavailable.',
        suggestion: 'Please try again in a few minutes.'
      },
      503: {
        icon: '🛠️',
        title: 'Service Unavailable',
        message: 'The service is currently under maintenance.',
        suggestion: 'Please try again later.'
      }
    };

    return errorMap[statusCode] || {
      icon: '❌',
      title: 'Error',
      message: error.message || 'An unexpected error occurred.',
      suggestion: 'Please try again or contact support.'
    };
  }

  /**
   * Handle common operations with retry
   */
  async withRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      context = 'operation',
      showErrorPanel = true
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          break;
        }
        
        if (attempt < maxRetries) {
          await this.delay(retryDelay * attempt);
        }
      }
    }

    // All retries failed
    if (showErrorPanel) {
      return new Promise((resolve, reject) => {
        this.showError(lastError, {
          context,
          onRetry: async () => {
            try {
              const result = await this.withRetry(operation, { ...options, maxRetries: 1 });
              resolve(result);
            } catch (e) {
              reject(e);
            }
          },
          onDismiss: () => reject(lastError)
        });
      });
    }
    
    throw lastError;
  }

  /**
   * Quick toast error for minor issues
   */
  showQuickError(message, options = {}) {
    if (window.toast) {
      window.toast.error(message, options.duration || 5000);
    } else {
      alert(message);
    }
  }

  /**
   * Show inline field error
   */
  showFieldError(field, message) {
    if (typeof field === 'string') {
      field = document.querySelector(field);
    }
    if (!field) return;

    const wrapper = field.closest('.form-field, .form-group') || field.parentElement;
    
    // Remove existing error
    const existing = wrapper.querySelector('.field-error-inline');
    if (existing) existing.remove();

    // Add error
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-inline';
    errorEl.style.cssText = `
      color: #ef4444;
      font-size: 12px;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      animation: fadeIn 0.2s ease;
    `;
    errorEl.innerHTML = `<span>⚠️</span> ${this.escapeHtml(message)}`;
    
    wrapper.appendChild(errorEl);
    field.classList.add('has-error');
    
    // Auto-remove on input
    const handler = () => {
      errorEl.remove();
      field.classList.remove('has-error');
      field.removeEventListener('input', handler);
    };
    field.addEventListener('input', handler);
  }

  addStyles() {
    if (document.getElementById('error-recovery-styles')) return;

    const style = document.createElement('style');
    style.id = 'error-recovery-styles';
    style.textContent = `
      .error-recovery-panel {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10002;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .error-recovery-panel.visible {
        opacity: 1;
      }
      
      .error-recovery-panel.closing {
        opacity: 0;
      }
      
      .error-recovery-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
      }
      
      .error-recovery-content {
        position: relative;
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 32px;
        max-width: 450px;
        width: 90%;
        text-align: center;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
        transform: translateY(20px);
        animation: slideUpFade 0.3s ease forwards;
      }
      
      @keyframes slideUpFade {
        to { transform: translateY(0); }
      }
      
      .error-icon {
        font-size: 64px;
        margin-bottom: 16px;
      }
      
      .error-title {
        margin: 0 0 12px 0;
        color: var(--text-primary, #1f2937);
        font-size: 22px;
        font-weight: 700;
      }
      
      .error-message {
        margin: 0 0 12px 0;
        color: var(--text-secondary, #6b7280);
        font-size: 15px;
        line-height: 1.6;
      }
      
      .error-suggestion {
        margin: 0 0 20px 0;
        padding: 12px 16px;
        background: rgba(59, 130, 246, 0.1);
        border-radius: 8px;
        color: var(--primary, #3b82f6);
        font-size: 14px;
      }
      
      .error-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
      }
      
      .error-actions button,
      .error-actions a {
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      
      .btn-retry {
        background: var(--primary, #3b82f6);
        color: white;
        border: none;
      }
      
      .btn-retry:hover {
        background: #2563eb;
        transform: translateY(-2px);
      }
      
      .btn-dismiss {
        background: var(--bg-alt, #f3f4f6);
        color: var(--text-primary, #1f2937);
        border: 1px solid var(--border-light, #e5e7eb);
      }
      
      .btn-dismiss:hover {
        background: #e5e7eb;
      }
      
      .btn-help {
        background: transparent;
        color: var(--primary, #3b82f6);
        border: 1px solid var(--primary, #3b82f6);
      }
      
      .error-details {
        margin-top: 20px;
        text-align: left;
      }
      
      .error-details summary {
        cursor: pointer;
        color: var(--muted, #6b7280);
        font-size: 13px;
      }
      
      .error-details pre {
        margin-top: 8px;
        padding: 12px;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 8px;
        font-size: 12px;
        overflow-x: auto;
        max-height: 150px;
      }
    `;
    document.head.appendChild(style);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Custom error class for fetch errors
 */
class FetchError extends Error {
  constructor(status, data, requestArgs) {
    super(data.message || data.error || 'Request failed');
    this.name = 'FetchError';
    this.status = status;
    this.statusCode = status;
    this.data = data;
    this.details = data;
    this.requestArgs = requestArgs;
  }
}

// Global instance
window.errorRecovery = new ErrorRecovery();
window.FetchError = FetchError;
