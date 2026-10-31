const mq = window.matchMedia('(prefers-color-scheme: dark)');

export function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : mq.matches;
}
export function toggleTheme(): void {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('scrawl.theme', next); } catch { /* storage blocked */ }
}
export function applySavedTheme(): void {
  try { const t = localStorage.getItem('scrawl.theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* storage blocked */ }
}
