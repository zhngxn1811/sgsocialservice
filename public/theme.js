(() => {
  const key = 'sg-social-services-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* The toggle still works when browser storage is unavailable. */ }

  function apply() {
    const dark = (preference || (system.matches ? 'dark' : 'light')) === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelectorAll('.theme-toggle').forEach(button => {
      const label = dark ? 'Light mode' : 'Dark mode';
      button.querySelector('span').textContent = label;
      button.setAttribute('aria-label', label);
      button.removeAttribute('aria-pressed');
      button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    });
  }

  // Apply before the page is painted to avoid a flash of the wrong theme.
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.hidden = false;
      button.addEventListener('click', () => {
        preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(key, preference); } catch {}
        apply();
      });
    });
    apply();
  });
  system.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : undefined;
    apply();
  });
})();
