/**
 * Smooth-scroll to a landing-page section by element id.
 * Accounts for sticky header (scroll-mt on sections) via scrollIntoView block:start.
 */
export function scrollToSection(id, { behavior = "smooth" } = {}) {
  if (!id || typeof document === "undefined") return false;
  const el = document.getElementById(String(id).replace(/^#/, ""));
  if (!el) return false;
  el.scrollIntoView({ behavior, block: "start" });
  try {
    const hash = `#${el.id}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    }
  } catch {
    /* ignore */
  }
  return true;
}

/** Delay scroll until after route paint / layout (hash navigation from another page). */
export function scrollToSectionWhenReady(id, { attempts = 20, delayMs = 50 } = {}) {
  if (!id) return;
  let n = 0;
  const tick = () => {
    if (scrollToSection(id, { behavior: n === 0 ? "auto" : "smooth" })) return;
    n += 1;
    if (n < attempts) setTimeout(tick, delayMs);
  };
  // Double rAF so DOM from React has painted
  requestAnimationFrame(() => requestAnimationFrame(tick));
}
