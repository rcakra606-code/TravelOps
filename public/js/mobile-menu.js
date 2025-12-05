/**
 * Mobile Menu Handler
 * Handles mobile sidebar toggle and overlay
 */

(function() {
  'use strict';

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
      
      // Add animation
      menuBtn.style.transform = sidebar.classList.contains('mobile-open') 
        ? 'rotate(90deg)' 
        : 'rotate(0deg)';
    });

    // Close on overlay click
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('visible');
      menuBtn.style.transform = 'rotate(0deg)';
    });

    // Close on nav link click (mobile)
    if (window.innerWidth <= 768) {
      const navLinks = sidebar.querySelectorAll('a, button[data-section]');
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          setTimeout(() => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('visible');
            menuBtn.style.transform = 'rotate(0deg)';
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
          menuBtn.style.transform = 'rotate(0deg)';
        }
      }, 250);
    });
  }
})();
