/**
 * Mobile Menu Handler
 * Handles mobile sidebar toggle and overlay
 */

(function() {
  'use strict';

  // Add CSS for rotation animation (no inline styles)
  const style = document.createElement('style');
  style.textContent = `
    #mobileMenuBtn {
      transition: transform 0.3s ease;
    }
    #mobileMenuBtn.menu-open {
      transform: rotate(90deg);
    }
  `;
  document.head.appendChild(style);

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobileOverlay');

    if (!menuBtn || !sidebar || !overlay) return;

    // Toggle menu
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('visible');
      
      // Add animation via class (not inline style)
      menuBtn.classList.toggle('menu-open', sidebar.classList.contains('mobile-open'));
    });

    // Close on overlay click
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('visible');
      menuBtn.classList.remove('menu-open');
    });

    // Close on nav link click (mobile)
    if (window.innerWidth <= 768) {
      const navLinks = sidebar.querySelectorAll('a, button[data-section]');
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          setTimeout(() => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('visible');
            menuBtn.classList.remove('menu-open');
          }, 200);
        });
      });
    }

    // Handle resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth > 768) {
          sidebar.classList.remove('mobile-open');
          overlay.classList.remove('visible');
          menuBtn.classList.remove('menu-open');
        }
      }, 250);
    });
  }
})();
