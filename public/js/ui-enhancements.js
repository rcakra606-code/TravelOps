/**
 * UI Enhancements Utility
 * Helper functions for micro-interactions and UI polish
 */

class UIEnhancements {
  constructor() {
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.initSkipLink();
      this.initTooltips();
      this.initNumberAnimations();
      this.initTableEnhancements();
    });
  }

  /**
   * Add skip to main content link for accessibility
   */
  initSkipLink() {
    if (document.querySelector('.skip-link')) return;
    
    const skipLink = document.createElement('a');
    skipLink.className = 'skip-link';
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content';
    document.body.insertBefore(skipLink, document.body.firstChild);

    // Add id to main content if not present
    const main = document.querySelector('main, .main, [role="main"]');
    if (main && !main.id) {
      main.id = 'main-content';
    }
  }

  /**
   * Initialize custom tooltips
   */
  initTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(el => {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', el.dataset.tooltip);
    });
  }

  /**
   * Animate numbers counting up
   */
  initNumberAnimations() {
    const animateValue = (element, start, end, duration) => {
      const range = end - start;
      const startTime = performance.now();
      
      const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(start + range * easeOut);
        
        element.textContent = this.formatNumber(current);
        
        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };
      
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const value = parseInt(el.textContent.replace(/[^\d]/g, ''), 10);
          if (!isNaN(value) && value > 0) {
            animateValue(el, 0, value, 1000);
          }
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('.count-animate, .stat-value, .metric-value, .big-number').forEach(el => {
      if (!el.dataset.animated) {
        el.dataset.animated = 'true';
        observer.observe(el);
      }
    });
  }

  /**
   * Initialize table enhancements
   */
  initTableEnhancements() {
    // Make tables sortable if they have the class
    document.querySelectorAll('.table-sortable th').forEach(th => {
      if (!th.classList.contains('no-sort')) {
        th.classList.add('sortable-header');
        th.addEventListener('click', () => this.handleSort(th));
      }
    });
  }

  /**
   * Handle table sorting
   */
  handleSort(th) {
    const table = th.closest('table');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const columnIndex = Array.from(th.parentNode.children).indexOf(th);
    const isAsc = th.classList.contains('sort-asc');
    
    // Remove sort classes from all headers
    th.parentNode.querySelectorAll('th').forEach(header => {
      header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Set new sort direction
    th.classList.add(isAsc ? 'sort-desc' : 'sort-asc');
    
    // Sort rows
    rows.sort((a, b) => {
      const aVal = a.children[columnIndex]?.textContent.trim() || '';
      const bVal = b.children[columnIndex]?.textContent.trim() || '';
      
      // Try numeric sort first
      const aNum = parseFloat(aVal.replace(/[^\d.-]/g, ''));
      const bNum = parseFloat(bVal.replace(/[^\d.-]/g, ''));
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return isAsc ? bNum - aNum : aNum - bNum;
      }
      
      // Fall back to string sort
      return isAsc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
  }

  /**
   * Format numbers with locale
   */
  formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  }

  /**
   * Add row highlight animation when adding new data
   */
  highlightNewRow(row) {
    row.classList.add('row-added');
    row.addEventListener('animationend', () => {
      row.classList.remove('row-added');
    }, { once: true });
  }

  /**
   * Animate row removal
   */
  animateRowRemoval(row, callback) {
    row.classList.add('row-removing');
    row.addEventListener('animationend', () => {
      if (callback) callback();
      row.remove();
    }, { once: true });
  }

  /**
   * Flash success on element
   */
  flashSuccess(element) {
    element.classList.add('success-flash');
    element.addEventListener('animationend', () => {
      element.classList.remove('success-flash');
    }, { once: true });
  }

  /**
   * Flash error on element
   */
  flashError(element) {
    element.classList.add('error-flash');
    element.addEventListener('animationend', () => {
      element.classList.remove('error-flash');
    }, { once: true });
  }

  /**
   * Create filter chips from active filters
   */
  createFilterChips(filters, container, onRemove) {
    container.innerHTML = '';
    
    const hasFilters = Object.values(filters).some(v => v && v !== 'all' && v !== '');
    if (!hasFilters) return;

    Object.entries(filters).forEach(([key, value]) => {
      if (!value || value === 'all' || value === '') return;
      
      const chip = document.createElement('div');
      chip.className = 'filter-chip';
      chip.innerHTML = `
        <span class="filter-chip-label">${this.formatLabel(key)}:</span>
        <span class="filter-chip-value">${value}</span>
        <span class="filter-chip-remove" data-filter="${key}">×</span>
      `;
      
      chip.querySelector('.filter-chip-remove').addEventListener('click', () => {
        onRemove(key);
      });
      
      container.appendChild(chip);
    });

    // Add clear all button
    if (container.children.length > 1) {
      const clearAll = document.createElement('div');
      clearAll.className = 'filter-chip filter-chip-clear-all';
      clearAll.textContent = 'Clear All';
      clearAll.addEventListener('click', () => {
        Object.keys(filters).forEach(key => onRemove(key));
      });
      container.appendChild(clearAll);
    }
  }

  /**
   * Format label for display
   */
  formatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  /**
   * Create progress bar
   */
  createProgressBar(container, percent, text = '') {
    container.innerHTML = `
      <div class="upload-progress">
        <div class="upload-progress-bar" style="width: ${percent}%"></div>
      </div>
      <div class="upload-progress-text">
        <span>${text}</span>
        <span>${percent}%</span>
      </div>
    `;
  }

  /**
   * Update progress bar
   */
  updateProgressBar(container, percent, text = '') {
    const bar = container.querySelector('.upload-progress-bar');
    const textEl = container.querySelector('.upload-progress-text');
    if (bar) bar.style.width = `${percent}%`;
    if (textEl) {
      textEl.innerHTML = `<span>${text}</span><span>${percent}%</span>`;
    }
  }

  /**
   * Show typing indicator
   */
  showTypingIndicator(container) {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(indicator);
    return indicator;
  }

  /**
   * Create confetti effect (for celebrations)
   */
  createConfetti(count = 50) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    
    for (let i = 0; i < count; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = `${Math.random() * 100}vw`;
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = `${Math.random() * 2}s`;
      confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(confetti);
      
      setTimeout(() => confetti.remove(), 3000);
    }
  }

  /**
   * Add trend indicator to stat
   */
  addTrendIndicator(element, value, previousValue) {
    const existingTrend = element.querySelector('.stat-trend');
    if (existingTrend) existingTrend.remove();
    
    const trend = document.createElement('span');
    trend.className = 'stat-trend';
    
    if (value > previousValue) {
      const percent = ((value - previousValue) / previousValue * 100).toFixed(1);
      trend.classList.add('up');
      trend.textContent = `${percent}%`;
    } else if (value < previousValue) {
      const percent = ((previousValue - value) / previousValue * 100).toFixed(1);
      trend.classList.add('down');
      trend.textContent = `${percent}%`;
    } else {
      trend.classList.add('neutral');
      trend.textContent = '0%';
    }
    
    element.appendChild(trend);
  }
}

// Initialize global instance
window.uiEnhancements = new UIEnhancements();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIEnhancements;
}
