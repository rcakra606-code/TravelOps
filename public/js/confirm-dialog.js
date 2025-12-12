/* =========================================================
   CUSTOM CONFIRM DIALOG
   Modern replacement for browser confirm()
   ========================================================= */

class ConfirmDialog {
  constructor() {
    this.overlay = null;
  }

  show(options = {}) {
    const {
      title = 'Confirm Action',
      message = 'Are you sure?',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmColor = 'var(--danger)',
      icon = '⚠️'
    } = options;

    return new Promise((resolve) => {
      // Create overlay
      this.overlay = document.createElement('div');
      this.overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeIn 0.2s ease;
      `;

      // Create dialog
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: var(--card, white);
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      `;

      dialog.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">${icon}</div>
          <h3 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 20px;">${title}</h3>
          <p style="margin: 0; color: var(--text-secondary); font-size: 15px; line-height: 1.5;">${message}</p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="confirmCancel" class="btn btn-secondary" style="flex: 1;">
            ${cancelText}
          </button>
          <button id="confirmOk" class="btn btn-danger" style="flex: 1; background: ${confirmColor}; border-color: ${confirmColor};">
            ${confirmText}
          </button>
        </div>
      `;

      // Add animations if not exist
      if (!document.getElementById('confirm-dialog-styles')) {
        const style = document.createElement('style');
        style.id = 'confirm-dialog-styles';
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

      this.overlay.appendChild(dialog);
      document.body.appendChild(this.overlay);

      // Handle buttons - use querySelector on dialog element instead of document
      const confirmBtn = dialog.querySelector('#confirmOk');
      const cancelBtn = dialog.querySelector('#confirmCancel');
      
      const handleClose = (confirmed) => {
        this.overlay.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => {
          if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
          }
          this.overlay = null;
          resolve(confirmed);
        }, 200);
      };

      if (confirmBtn) confirmBtn.onclick = () => handleClose(true);
      if (cancelBtn) cancelBtn.onclick = () => handleClose(false);
      
      // ESC key to cancel
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          handleClose(false);
        }
      };
      document.addEventListener('keydown', escHandler);

      // Click overlay to cancel
      this.overlay.onclick = (e) => {
        if (e.target === this.overlay) {
          handleClose(false);
        }
      };
    });
  }

  delete(itemName = 'this record') {
    return this.show({
      title: 'Delete Confirmation',
      message: `Are you sure you want to delete ${itemName}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: '#dc2626',
      icon: '🗑️'
    });
  }

  logout() {
    return this.show({
      title: 'Logout Confirmation',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Stay',
      confirmColor: '#2563eb',
      icon: '🚪'
    });
  }

  unsavedChanges() {
    return this.show({
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. Do you want to leave without saving?',
      confirmText: 'Leave',
      cancelText: 'Stay',
      confirmColor: '#f59e0b',
      icon: '⚠️'
    });
  }

  // Alias for show() - allows calling confirmDialog.custom()
  custom(options) {
    return this.show(options);
  }
}

// Global instance
window.confirmDialog = new ConfirmDialog();
