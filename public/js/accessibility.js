/* =========================================================
   ACCESSIBILITY UTILITIES
   WCAG 2.1 AA compliance helpers
   ========================================================= */

const a11yUtils = {
  // Add skip to main content link
  addSkipLink() {
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.className = 'skip-link';
    skipLink.textContent = 'Skip to main content';
    skipLink.style.cssText = `
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--primary);
      color: white;
      padding: 8px 16px;
      text-decoration: none;
      z-index: 10000;
      border-radius: 0 0 4px 0;
    `;
    
    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '0';
    });
    
    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-40px';
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
  },

  // Announce to screen readers
  announce(message, priority = 'polite') {
    let announcer = document.getElementById('aria-announcer');
    
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'aria-announcer';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', priority);
      announcer.setAttribute('aria-atomic', 'true');
      announcer.style.cssText = `
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      `;
      document.body.appendChild(announcer);
    }
    
    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);
  },

  // Check contrast ratio
  getContrastRatio(color1, color2) {
    const getLuminance = (color) => {
      const rgb = color.match(/\d+/g).map(Number);
      const [r, g, b] = rgb.map(val => {
        val = val / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const l1 = getLuminance(color1);
    const l2 = getLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    return (lighter + 0.05) / (darker + 0.05);
  },

  // Add focus visible class for keyboard navigation
  enhanceFocusVisible() {
    let isUsingKeyboard = false;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        isUsingKeyboard = true;
        document.body.classList.add('using-keyboard');
      }
    });

    document.addEventListener('mousedown', () => {
      isUsingKeyboard = false;
      document.body.classList.remove('using-keyboard');
    });

    // Add CSS for focus-visible
    if (!document.getElementById('a11y-focus-styles')) {
      const style = document.createElement('style');
      style.id = 'a11y-focus-styles';
      style.textContent = `
        body:not(.using-keyboard) *:focus {
          outline: none;
        }
        body.using-keyboard *:focus {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
      `;
      document.head.appendChild(style);
    }
  },

  // Add aria labels to icon buttons
  labelIconButtons() {
    document.querySelectorAll('button:not([aria-label])').forEach(btn => {
      const text = btn.textContent.trim();
      if (text.length <= 2 || /[\u{1F300}-\u{1F9FF}]/u.test(text)) {
        // Button has only emoji or very short text
        const label = btn.getAttribute('title') || 'Button';
        btn.setAttribute('aria-label', label);
      }
    });
  },

  // Initialize all a11y features
  init() {
    this.addSkipLink();
    this.enhanceFocusVisible();
    this.labelIconButtons();
    
    console.log('✓ Accessibility features initialized');
  }
};

window.a11yUtils = a11yUtils;

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => a11yUtils.init());
} else {
  a11yUtils.init();
}
