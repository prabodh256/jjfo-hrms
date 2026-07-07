// Applies user interface preferences (theme, font family, font size) to the
// document root so the whole app — including the [data-theme] palette in
// index.css — reacts immediately.

const FONT_SIZES = { small: '14px', medium: '16px', large: '18px' };

export function parsePrefs(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); }
  catch { return {}; }
}

export function applyPreferences(prefs = {}) {
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme === 'light' ? 'light' : 'dark');
  root.style.setProperty('--app-font-size', FONT_SIZES[prefs.fontSize] || '16px');
  if (prefs.font) {
    root.style.setProperty('--font-body', `'${prefs.font}', sans-serif`);
    root.style.setProperty('--font-heading', `'${prefs.font}', sans-serif`);
  }
}

export const DEFAULT_PREFS = { theme: 'dark', font: 'Outfit', fontSize: 'medium' };
