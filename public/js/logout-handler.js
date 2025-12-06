/* =========================================================
   STANDARDIZED LOGOUT HANDLER
   Professional logout with confirmation + goodbye overlay
   ========================================================= */

async function handleLogout() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.name || user.username || 'User';
  
  console.log('handleLogout called');
  console.log('window.confirmDialog:', window.confirmDialog);
  console.log('window.confirmDialog.show:', window.confirmDialog?.show);
  
  // Show confirmation dialog
  let confirmed = false;
  if (window.confirmDialog && typeof window.confirmDialog.show === 'function') {
    console.log('Using confirmDialog.show()');
    try {
      confirmed = await window.confirmDialog.show({
        title: 'Logout Confirmation',
        message: `Are you sure you want to logout, ${userName}?`,
        confirmText: 'Yes, Logout',
        cancelText: 'Cancel',
        confirmColor: '#ef4444',
        icon: '👋'
      });
      console.log('confirmDialog result:', confirmed);
    } catch (error) {
      console.error('confirmDialog error:', error);
      confirmed = confirm(`Are you sure you want to logout, ${userName}?`);
    }
  } else {
    console.log('Using native confirm');
    // Fallback to native confirm
    confirmed = confirm(`Are you sure you want to logout, ${userName}?`);
  }
  
  console.log('Logout confirmed:', confirmed);
  
  if (!confirmed) {
    console.log('Logout cancelled');
    return; // User cancelled
  }
  
  // Show goodbye overlay immediately
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
  `;
  
  const message = document.createElement('div');
  message.style.cssText = `
    background: white;
    padding: 40px;
    border-radius: 12px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    animation: slideUp 0.3s ease;
  `;
  message.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">👋</div>
    <h2 style="margin: 0 0 8px 0; color: #111827;">Sampai Jumpa, ${userName}!</h2>
    <p style="margin: 0; color: #6b7280;">Terima kasih telah menggunakan TravelOps</p>
  `;
  
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  
  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  // Clear storage and redirect after animation
  setTimeout(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login.html';
  }, 1500);
}

// Initialize logout handler on any page
function initLogoutHandler() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });
  }
}

// Auto-initialize if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogoutHandler);
} else {
  initLogoutHandler();
}
