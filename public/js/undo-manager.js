/**
 * Undo Manager
 * Provides soft delete with undo capability
 */

class UndoManager {
  constructor() {
    this.undoStack = [];
    this.undoTimeout = 5000; // 5 seconds to undo
    this.timers = new Map();
  }

  /**
   * Register a deletable action with undo capability
   * @param {string} id - Unique identifier for the action
   * @param {object} options - Configuration options
   * @param {string} options.type - Entity type (sales, tours, etc.)
   * @param {object} options.data - The deleted data to restore
   * @param {function} options.onUndo - Callback when undo is triggered
   * @param {function} options.onConfirm - Callback when delete is confirmed (timeout)
   * @param {string} options.message - Toast message to display
   */
  registerDelete(id, options) {
    const {
      type,
      data,
      onUndo,
      onConfirm,
      message = 'Item deleted'
    } = options;

    // Store in undo stack
    const action = {
      id,
      type,
      data,
      onUndo,
      onConfirm,
      timestamp: Date.now()
    };
    
    this.undoStack.push(action);

    // Show toast with undo button
    this.showUndoToast(id, message);

    // Set timer for permanent deletion
    const timer = setTimeout(() => {
      this.confirmDelete(id);
    }, this.undoTimeout);

    this.timers.set(id, timer);

    return id;
  }

  /**
   * Show toast notification with undo button
   */
  showUndoToast(actionId, message) {
    // Create toast container if needed
    let container = document.getElementById('undo-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'undo-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10001;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.id = `undo-toast-${actionId}`;
    toast.className = 'undo-toast';
    toast.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      background: #1f2937;
      color: white;
      padding: 14px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      animation: slideInUp 0.3s ease;
      min-width: 300px;
    `;

    toast.innerHTML = `
      <span style="flex: 1; font-size: 14px;">${this.escapeHtml(message)}</span>
      <div class="undo-progress" style="
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: #3b82f6;
        border-radius: 0 0 12px 12px;
        animation: undoProgress ${this.undoTimeout}ms linear forwards;
      "></div>
      <button class="undo-btn" style="
        background: #3b82f6;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
        font-size: 14px;
      ">Undo</button>
    `;

    // Add animation keyframes if not present
    if (!document.getElementById('undo-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'undo-toast-styles';
      style.textContent = `
        @keyframes slideInUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideOutDown {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(20px); opacity: 0; }
        }
        @keyframes undoProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
        .undo-btn:hover {
          background: #2563eb !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Undo button click handler
    const undoBtn = toast.querySelector('.undo-btn');
    undoBtn.addEventListener('click', () => {
      this.undo(actionId);
    });

    container.appendChild(toast);
  }

  /**
   * Perform undo action
   */
  undo(actionId) {
    const actionIndex = this.undoStack.findIndex(a => a.id === actionId);
    if (actionIndex === -1) return;

    const action = this.undoStack[actionIndex];

    // Clear the timer
    const timer = this.timers.get(actionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(actionId);
    }

    // Remove from stack
    this.undoStack.splice(actionIndex, 1);

    // Hide toast
    this.hideToast(actionId);

    // Execute undo callback
    if (action.onUndo) {
      action.onUndo(action.data);
    }

    // Show success message
    if (window.toast) {
      window.toast.success('Action undone successfully');
    }
  }

  /**
   * Confirm delete (called after timeout)
   */
  confirmDelete(actionId) {
    const actionIndex = this.undoStack.findIndex(a => a.id === actionId);
    if (actionIndex === -1) return;

    const action = this.undoStack[actionIndex];

    // Remove from stack
    this.undoStack.splice(actionIndex, 1);
    this.timers.delete(actionId);

    // Hide toast
    this.hideToast(actionId);

    // Execute confirm callback (permanent delete)
    if (action.onConfirm) {
      action.onConfirm(action.data);
    }
  }

  /**
   * Hide toast with animation
   */
  hideToast(actionId) {
    const toast = document.getElementById(`undo-toast-${actionId}`);
    if (toast) {
      toast.style.animation = 'slideOutDown 0.3s ease forwards';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  }

  /**
   * Cancel all pending deletes
   */
  cancelAll() {
    this.undoStack.forEach(action => {
      this.undo(action.id);
    });
  }

  /**
   * Generate unique action ID
   */
  generateId() {
    return `undo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Global instance
window.undoManager = new UndoManager();
