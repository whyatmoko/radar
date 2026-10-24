document.querySelectorAll('.nav-group').forEach(group => {
  group.addEventListener('toggle', () => {
    if (group.open) document.querySelectorAll('.nav-group').forEach(other => { if (other !== group) other.open = false; });
  });
});
document.addEventListener('click', event => {
  document.querySelectorAll('.nav-group[open]').forEach(group => { if (!group.contains(event.target)) group.open = false; });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.nav-group[open]').forEach(group => { group.open = false; group.querySelector('summary').focus(); });
});

document.querySelectorAll("[data-logout]").forEach(button => button.addEventListener("click", () => window.radarLogout()));
