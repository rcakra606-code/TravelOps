/* =========================================================
   TOAST NOTIFICATION SYSTEM
   Modern, non-blocking notifications
   ========================================================= */

class ToastManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    const createContainer = () => {
      // Create toast container if it doesn't exist
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
        `;
        document.body.appendChild(this.container);
      }
    };

    // Create immediately if body exists, otherwise wait for DOM ready
    if (document.body) {
      createContainer();
    } else {
      document.addEventListener('DOMContentLoaded', createContainer);
    }
  }

  show(message, type = 'info', duration = 4000) {
    // Ensure container exists
    if (!this.container) {
      this.init();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const colors = {
      success: { bg: '#10b981', border: '#059669', shadow: 'rgba(16, 185, 129, 0.4)' },
      error: { bg: '#ef4444', border: '#dc2626', shadow: 'rgba(239, 68, 68, 0.4)' },
      warning: { bg: '#f59e0b', border: '#d97706', shadow: 'rgba(245, 158, 11, 0.4)' },
      info: { bg: '#3b82f6', border: '#2563eb', shadow: 'rgba(59, 130, 246, 0.4)' }
    };

    const color = colors[type] || colors.info;

    toast.style.cssText = `
      background: ${color.bg};
      color: white;
      padding: 14px 20px;
      border-radius: 10px;
      box-shadow: 0 4px 12px ${color.shadow}, 0 2px 4px rgba(0,0,0,0.1);
      border-left: 4px solid ${color.border};
      min-width: 280px;
      max-width: 400px;
      font-size: 0.95rem;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      cursor: pointer;
      animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transition: all 0.2s ease;
    `;

    toast.innerHTML = `
      <span style="font-size: 1.2rem; font-weight: bold; flex-shrink: 0;">${icons[type]}</span>
      <span style="flex: 1; line-height: 1.4;">${message}</span>
    `;

    // Add CSS animation if not already added
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }
        .toast:hover {
          transform: translateX(-4px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.15);
        }
      `;
      document.head.appendChild(style);
    }

    // Click to dismiss
    toast.addEventListener('click', () => this.dismiss(toast));

    this.container.appendChild(toast);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  }

  dismiss(toast) {
    toast.style.animation = 'slideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Global instance
window.toast = new ToastManager();
