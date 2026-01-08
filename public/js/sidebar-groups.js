// Sidebar Navigation Groups - Collapsible Menu
(function() {
  'use strict';
  
  // Initialize sidebar groups
  function initSidebarGroups() {
    const groups = document.querySelectorAll('.nav-group');
    
    groups.forEach(group => {
      const header = group.querySelector('.nav-group-header');
      if (!header) return;
      
      // Load saved state from localStorage
      const groupId = header.dataset.group;
      const savedState = localStorage.getItem(`sidebar-group-${groupId}`);
      
      if (savedState === 'collapsed') {
        group.classList.add('collapsed');
      }
      
      // Toggle on click
      header.addEventListener('click', () => {
        group.classList.toggle('collapsed');
        
        // Save state
        const isCollapsed = group.classList.contains('collapsed');
        localStorage.setItem(`sidebar-group-${groupId}`, isCollapsed ? 'collapsed' : 'expanded');
      });
      
      // Check if any child link is active
      const currentPath = window.location.pathname;
      const links = group.querySelectorAll('.nav-group-items a');
      
      links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
          group.classList.add('has-active');
          group.classList.remove('collapsed'); // Expand if current page is in group
          localStorage.setItem(`sidebar-group-${groupId}`, 'expanded');
        }
      });
    });
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarGroups);
  } else {
    initSidebarGroups();
  }
})();
