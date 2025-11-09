(function(){
  const loginForm = document.getElementById('loginForm');
  const errorMsg = document.getElementById('errorMsg');
  const loginContainer = document.querySelector('.login-container');

  // Already logged in redirect
  const token = localStorage.getItem('token');
  if (token) {
    window.location.href = '/single-dashboard.html';
    return;
  }

  async function handleSubmit(e){
    e.preventDefault();
    errorMsg.style.display = 'none';
    loginContainer.classList.add('loading');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    try {
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
      loginContainer.style.transform = 'scale(0.95)';
      loginContainer.style.opacity = '0';
      setTimeout(()=>{ window.location.href = '/single-dashboard.html'; },300);
    } catch(err){
      console.error(err);
      loginContainer.classList.remove('loading');
      errorMsg.style.display = 'block';
      errorMsg.textContent = err.message || 'Username atau password salah.';
      loginContainer.style.animation = 'none';
      setTimeout(()=>{ loginContainer.style.animation=''; },10);
    }
  }

  loginForm.addEventListener('submit', handleSubmit);
  document.getElementById('password').addEventListener('keypress', (e)=>{
    if (e.key === 'Enter') loginForm.dispatchEvent(new Event('submit'));
  });
})();
