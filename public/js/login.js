document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorMsg = document.getElementById('errorMsg');
  const loginContainer = document.querySelector('.login-container');
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const rememberMeEl = document.getElementById('rememberMe');

  if (!loginForm || !errorMsg || !loginContainer || !usernameEl || !passwordEl) {
    console.error('Login elements not found on the page');
    return;
  }

  // Check for remembered credentials
  try {
    const remembered = JSON.parse(localStorage.getItem('remembered_user') || '{}');
    if (remembered.username && remembered.expires > Date.now()) {
      usernameEl.value = remembered.username;
      if (rememberMeEl) rememberMeEl.checked = true;
    } else {
      localStorage.removeItem('remembered_user');
    }
  } catch {}

  // Already logged in redirect
  try {
    const token = localStorage.getItem('token');
    if (token) {
      window.location.href = '/single-dashboard.html';
      return;
    }
  } catch {}

  async function handleSubmit(e){
    e.preventDefault();
    errorMsg.style.display = 'none';
    loginContainer.classList.add('loading');
    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();
    const rememberMe = rememberMeEl?.checked || false;
    
    try {
      console.debug('Submitting /api/login');
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const error = await res.json().catch(()=>({ error: 'Login gagal' }));
        throw new Error(error.error || 'Login gagal');
      }
      const user = await res.json();
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', user.token);
      
      // Handle Remember Me
      if (rememberMe) {
        const remembered = {
          username: username,
          expires: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
        };
        localStorage.setItem('remembered_user', JSON.stringify(remembered));
      } else {
        localStorage.removeItem('remembered_user');
      }
      
      // Show success toast
      if (window.toast) {
        window.toast.success(`Welcome back, ${user.name || user.username}! 👋`);
      }
      
      loginContainer.style.transform = 'scale(0.95)';
      loginContainer.style.opacity = '0';
      setTimeout(()=>{ window.location.href = '/single-dashboard.html'; },300);
    } catch(err){
      console.error('Login error:', err);
      loginContainer.classList.remove('loading');
      
      // Show error toast
      if (window.toast) {
        window.toast.error(err?.message || 'Username atau password salah.');
      }
      
      errorMsg.style.display = 'block';
      errorMsg.textContent = err?.message || 'Username atau password salah.';
      loginContainer.style.animation = 'none';
      setTimeout(()=>{ loginContainer.style.animation=''; },10);
    }
  }

  loginForm.addEventListener('submit', handleSubmit);
  passwordEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (typeof loginForm.requestSubmit === 'function') loginForm.requestSubmit();
      else loginForm.dispatchEvent(new Event('submit'));
    }
  });
});
