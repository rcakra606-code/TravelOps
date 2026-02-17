/**
 * UI Extras - Scroll progress, back-to-top, page transitions
 */

(function() {
  'use strict';

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    createScrollProgress();
    createBackToTop();
    initPageTransition();
    initSkipLink();
  }

  /**
   * Scroll Progress Indicator
   */
  function createScrollProgress() {
    const progress = document.createElement('div');
    progress.className = 'scroll-progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', 'Page scroll progress');
    document.body.appendChild(progress);

    function updateProgress() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progress.style.width = scrollPercent + '%';
      progress.setAttribute('aria-valuenow', Math.round(scrollPercent));
    }

    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  /**
   * Back to Top Button
   */
  function createBackToTop() {
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.innerHTML = '↑';
    btn.setAttribute('aria-label', 'Back to top');
    btn.setAttribute('title', 'Back to top');
    document.body.appendChild(btn);

    function toggleVisibility() {
      if (window.scrollY > 400) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    }

    window.addEventListener('scroll', toggleVisibility, { passive: true });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /**
   * Page Load Transition
   */
  function initPageTransition() {
    const main = document.querySelector('main, .main-content, .content, .dashboard-content');
    if (main) {
      main.classList.add('page-loading');
      requestAnimationFrame(() => {
        main.classList.remove('page-loading');
        main.classList.add('page-loaded');
      });
    }
  }

  /**
   * Skip to Content Link
   */
  function initSkipLink() {
    // Check if skip link already exists
    if (document.querySelector('.skip-link')) return;
    
    const main = document.querySelector('main, .main-content, .content, [role="main"]');
    if (!main) return;

    // Ensure main has an ID
    if (!main.id) main.id = 'main-content';

    const skipLink = document.createElement('a');
    skipLink.className = 'skip-link';
    skipLink.href = '#' + main.id;
    skipLink.textContent = 'Skip to main content';
    
    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  // Expose globally
  window.UIExtras = {
    init,
    createScrollProgress,
    createBackToTop,
    initPageTransition
  };

})();
