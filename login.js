(() => {
  const password = document.getElementById('password'), toggle = document.getElementById('togglePassword');
  toggle.addEventListener('click', () => { const show = password.type === 'password'; password.type = show ? 'text' : 'password'; toggle.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password'); toggle.setAttribute('aria-pressed', String(show)); });
  document.getElementById('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    const error = document.getElementById('loginError');
    if (document.getElementById('username').value.trim() !== 'petugas' || password.value !== 'petugas123!') { error.textContent = 'Username atau password tidak sesuai.'; password.focus(); return; }
    try { sessionStorage.setItem('radar-demo-session', 'petugas'); } catch { error.textContent = 'Aktifkan penyimpanan browser untuk masuk.'; return; }
    const next = new URLSearchParams(location.search).get('next') || 'index.html';
    const allowed = /^(index|jejak|jejak-ringkas|data|tindak-lanjut|log-harian)\.html(?:\?[^#]*)?$/;
    location.replace(allowed.test(next) ? next : 'index.html');
  });
})();
