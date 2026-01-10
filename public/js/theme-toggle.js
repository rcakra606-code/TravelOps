/* =========================================================
   DARK MODE TOGGLE
   Handles theme switching with localStorage persistence
   ========================================================= */

(function() {
  'use strict';

  const STORAGE_KEY = 'travelops-theme';

  // Initialize theme from localStorage or system preference
  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  // Toggle theme
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    
    updateToggleIcon();
  }

  // Update toggle button icon
  function updateToggleIcon() {
    // Check for existing button in HTML (darkModeToggle) first, then themeToggle
    const toggle = document.getElementById('darkModeToggle') || document.getElementById('themeToggle');
    if (!toggle) return;
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    toggle.innerHTML = isDark ? '☀️' : '🌙';
    toggle.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }

  // Initialize toggle button (use existing or create new)
  function initToggleButton() {
    // Don't add on login/logout pages
    if (window.location.pathname.includes('/login.html') || window.location.pathname.includes('/logout.html')) return;
    
    // Check if darkModeToggle already exists in HTML
    const existingToggle = document.getElementById('darkModeToggle');
    if (existingToggle) {
      existingToggle.onclick = toggleTheme;
      updateToggleIcon();
      return;
    }
    
    // Only create new button if none exists
    if (!document.getElementById('themeToggle')) {
      const toggle = document.createElement('button');
      toggle.id = 'themeToggle';
      toggle.className = 'dark-mode-toggle';
      toggle.setAttribute('aria-label', 'Toggle dark mode');
      toggle.onclick = toggleTheme;
      document.body.appendChild(toggle);
    }
    updateToggleIcon();
  }

  // Initialize on load
  initTheme();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToggleButton);
  } else {
    initToggleButton();
  }

  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        updateToggleIcon();
      }
    });
  }

  // Export for external use
  window.themeToggle = {
    toggle: toggleTheme,
    setTheme: (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE_KEY, theme);
      updateToggleIcon();
    },
    getTheme: () => document.documentElement.getAttribute('data-theme') || 'light'
  };
})();
