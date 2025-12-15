/* =========================================================
   SIDEBAR ENHANCEMENTS
   Collapsible sidebar with tooltips and quick actions
   ========================================================= */

class SidebarManager {
  constructor() {
    this.sidebar = document.querySelector('.sidebar');
    this.isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    this.init();
  }

  init() {
    if (!this.sidebar) return;
    
    // Add sidebar toggle button
    this.addToggleButton();
    
    // Add user avatar
    this.addUserAvatar();
    
    // Add quick actions
    this.addQuickActions();
    
    // Add tooltips for collapsed mode
    this.addTooltips();
    
    // Apply saved state
    if (this.isCollapsed) {
      this.sidebar.classList.add('collapsed');
    }
    
    // Keyboard shortcut to toggle (Ctrl+B)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  addToggleButton() {
    const toggle = document.createElement('button');
    toggle.className = 'sidebar-toggle';
    toggle.innerHTML = '◀';
    toggle.title = 'Toggle Sidebar (Ctrl+B)';
    toggle.setAttribute('aria-label', 'Toggle sidebar');
    
    toggle.addEventListener('click', () => this.toggle());
    
    this.sidebar.appendChild(toggle);
  }

  addUserAvatar() {
    const userbox = this.sidebar.querySelector('.userbox');
    if (!userbox) return;
    
    const userName = userbox.querySelector('#userName');
    if (!userName) return;
    
    // Wait for username to be populated
    const observer = new MutationObserver(() => {
      const name = userName.textContent || '?';
      if (name !== '—' && !userbox.querySelector('.user-avatar')) {
        const initials = this.getInitials(name);
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = initials;
        avatar.title = name;
        userbox.insertBefore(avatar, userbox.firstChild);
      }
    });
    
    observer.observe(userName, { childList: true, characterData: true, subtree: true });
    
    // Initial check
    const name = userName.textContent;
    if (name && name !== '—') {
      const initials = this.getInitials(name);
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar';
      avatar.textContent = initials;
      avatar.title = name;
      userbox.insertBefore(avatar, userbox.firstChild);
    }
  }

  getInitials(name) {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  addQuickActions() {
    const nav = this.sidebar.querySelector('.nav');
    if (!nav) return;
    
    // Check if quick actions already exist
    if (this.sidebar.querySelector('.quick-actions')) return;
    
    const quickActions = document.createElement('div');
    quickActions.className = 'quick-actions';
    quickActions.innerHTML = `
      <button class="quick-action-btn" onclick="window.location.href='/tours-dashboard.html'" title="Tours">
        🧳
      </button>
      <button class="quick-action-btn" onclick="window.location.href='/sales-dashboard.html'" title="Sales">
        💰
      </button>
      <button class="quick-action-btn" onclick="window.location.href='/single-dashboard.html'" title="Dashboard">
        🏠
      </button>
    `;
    
    // Insert before userbox
    const userbox = this.sidebar.querySelector('.userbox');
    if (userbox) {
      this.sidebar.insertBefore(quickActions, userbox);
    } else {
      this.sidebar.appendChild(quickActions);
    }
  }

  addTooltips() {
    const navItems = this.sidebar.querySelectorAll('.nav a, .nav button');
    
    navItems.forEach(item => {
      // Get text content for tooltip
      const text = item.textContent.trim();
      if (!item.getAttribute('title')) {
        item.setAttribute('title', text);
      }
    });
  }

  toggle() {
    this.isCollapsed = !this.isCollapsed;
    this.sidebar.classList.toggle('collapsed', this.isCollapsed);
    localStorage.setItem('sidebarCollapsed', this.isCollapsed);
    
    // Update toggle button icon
    const toggle = this.sidebar.querySelector('.sidebar-toggle');
    if (toggle) {
      toggle.innerHTML = this.isCollapsed ? '▶' : '◀';
    }
    
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { 
      detail: { collapsed: this.isCollapsed } 
    }));
  }

  collapse() {
    if (!this.isCollapsed) this.toggle();
  }

  expand() {
    if (this.isCollapsed) this.toggle();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.sidebarManager = new SidebarManager();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SidebarManager;
}
