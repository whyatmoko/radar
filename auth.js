(() => {
  const key = 'radar-demo-session';
  const loggedIn = () => { try { return sessionStorage.getItem(key) === 'petugas'; } catch { return false; } };
  const guard = () => { if (!loggedIn()) { document.documentElement.style.visibility = 'hidden'; const next = location.pathname.split('/').pop() || 'index.html'; location.replace('login.html?next=' + encodeURIComponent(next + location.search)); } };
  guard();
  window.addEventListener('pageshow', guard);
  window.radarLogout = () => { try { sessionStorage.removeItem(key); } catch {} location.replace('login.html'); };
})();
