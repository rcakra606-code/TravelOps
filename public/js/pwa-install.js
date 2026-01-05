/**
 * PWA Install Prompt Manager
 * Show install prompt to users who haven't installed the app
 */

class PWAInstallPrompt {
  constructor() {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.dismissedKey = 'travelops_pwa_dismissed';
    this.init();
  }

  init() {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true;
      return;
    }

    // Listen for beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      
      // Show install button after a delay if not dismissed recently
      if (!this.wasDismissedRecently()) {
        setTimeout(() => this.showInstallPrompt(), 3000);
      }
    });

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.hideInstallPrompt();
      window.toast?.success('🎉 TravelOps installed successfully!');
    });

    this.addStyles();
  }

  wasDismissedRecently() {
    const dismissed = localStorage.getItem(this.dismissedKey);
    if (!dismissed) return false;
    
    const dismissedDate = new Date(parseInt(dismissed));
    const daysSince = (Date.now() - dismissedDate) / (1000 * 60 * 60 * 24);
    return daysSince < 7; // Don't show for 7 days after dismiss
  }

  showInstallPrompt() {
    if (this.isInstalled || !this.deferredPrompt) return;
    if (document.getElementById('pwaInstallBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwaInstallBanner';
    banner.className = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-install-content">
        <div class="pwa-install-icon">🚀</div>
        <div class="pwa-install-text">
          <strong>Install TravelOps</strong>
          <span>Get quick access from your home screen</span>
        </div>
        <div class="pwa-install-actions">
          <button class="pwa-install-btn" id="pwaInstallBtn">Install</button>
          <button class="pwa-dismiss-btn" id="pwaDismissBtn">Not now</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Animate in
    requestAnimationFrame(() => {
      banner.classList.add('show');
    });

    // Bind events
    document.getElementById('pwaInstallBtn')?.addEventListener('click', () => this.install());
    document.getElementById('pwaDismissBtn')?.addEventListener('click', () => this.dismiss());
  }

  hideInstallPrompt() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 300);
    }
  }

  async install() {
    if (!this.deferredPrompt) return;

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted PWA install');
    } else {
      this.dismiss();
    }
    
    this.deferredPrompt = null;
    this.hideInstallPrompt();
  }

  dismiss() {
    localStorage.setItem(this.dismissedKey, Date.now().toString());
    this.hideInstallPrompt();
  }

  addStyles() {
    if (document.getElementById('pwaInstallStyles')) return;

    const style = document.createElement('style');
    style.id = 'pwaInstallStyles';
    style.textContent = `
      .pwa-install-banner {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        z-index: 10000;
        opacity: 0;
        transition: all 0.3s ease;
      }

      .pwa-install-banner.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }

      .pwa-install-content {
        display: flex;
        align-items: center;
        gap: 16px;
        background: linear-gradient(135deg, #1e293b, #0f172a);
        color: white;
        padding: 16px 24px;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        max-width: 500px;
      }

      .pwa-install-icon {
        font-size: 40px;
        flex-shrink: 0;
      }

      .pwa-install-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .pwa-install-text strong {
        font-size: 16px;
        font-weight: 700;
      }

      .pwa-install-text span {
        font-size: 13px;
        opacity: 0.8;
      }

      .pwa-install-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }

      .pwa-install-btn {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .pwa-install-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }

      .pwa-dismiss-btn {
        background: transparent;
        color: rgba(255,255,255,0.7);
        border: 1px solid rgba(255,255,255,0.3);
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .pwa-dismiss-btn:hover {
        background: rgba(255,255,255,0.1);
        color: white;
      }

      @media (max-width: 600px) {
        .pwa-install-banner {
          left: 16px;
          right: 16px;
          transform: translateX(0) translateY(100px);
        }

        .pwa-install-banner.show {
          transform: translateX(0) translateY(0);
        }

        .pwa-install-content {
          flex-wrap: wrap;
          padding: 16px;
        }

        .pwa-install-text {
          flex: 1;
          min-width: 150px;
        }

        .pwa-install-actions {
          width: 100%;
          justify-content: stretch;
        }

        .pwa-install-btn,
        .pwa-dismiss-btn {
          flex: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.pwaInstallPrompt = new PWAInstallPrompt();
