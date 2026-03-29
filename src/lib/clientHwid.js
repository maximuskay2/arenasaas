const STORAGE_KEY = 'arena_client_hwid';

/** Stable per-browser id for platform HWID ban checks (replace with real anti-cheat HWID when integrated). */
export function getClientHwid() {
  try {
    let v = localStorage.getItem(STORAGE_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}
