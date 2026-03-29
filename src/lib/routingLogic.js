/**
 * Multi-tenant routing: public marketing, tenant portal, tenant public site, platform admin.
 *
 * Production patterns:
 * - www / apex → Public landing (marketing)
 * - app → Organizer dashboard (tenant portal)
 * - {tenant} → White-label public site for that org
 * - admin → Platform super-admin (not linked from marketing)
 *
 * Local dev:
 * - VITE_DEV_PORTAL=true → localhost uses organizer dashboard only after login (session flag); `/` is marketing until then
 * - VITE_DEV_PORTAL=false → localhost shows marketing unless session flag is set
 * - VITE_SIMULATE_ENTRY=admin → localhost can open Central Station at /central-station (admin.* behavior),
 *   but / stays the marketing site so you are not forced to /login with returnUrl=/central-station.
 */

export function getSubdomain() {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  if (hostname === 'localhost' || hostname.startsWith('127.')) return null;

  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (subdomain !== 'www') return subdomain;
  }

  return null;
}

export function isSystemAdmin() {
  if (import.meta.env.VITE_SIMULATE_ENTRY === 'admin') {
    const h = window.location.hostname;
    if (h === 'localhost' || h.startsWith('127.')) return true;
  }
  return getSubdomain() === 'admin';
}

/** Localhost + VITE_SIMULATE_ENTRY=admin — real admin.* host still sends / → /central-station only in App.jsx */
export function isSimulatedSystemAdminLocalhost() {
  if (import.meta.env.VITE_SIMULATE_ENTRY !== 'admin') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h.startsWith('127.');
}

export function isTenantPortal() {
  return getSubdomain() === 'app';
}

export function isPublicTenantSite() {
  const subdomain = getSubdomain();
  return !!subdomain && !['www', 'app', 'admin'].includes(subdomain);
}

export function getTenantSlug() {
  const subdomain = getSubdomain();
  if (subdomain && !['www', 'app', 'admin'].includes(subdomain)) {
    return subdomain;
  }
  return null;
}

export const ARENA_ORGANIZER_PORTAL_SESSION_KEY = 'arena_organizer_portal';

/** After login/register on the marketing host (same origin as www), use dashboard until logout. */
export function activateOrganizerPortalSession() {
  try {
    sessionStorage.setItem(ARENA_ORGANIZER_PORTAL_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearOrganizerPortalSession() {
  try {
    sessionStorage.removeItem(ARENA_ORGANIZER_PORTAL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function hasOrganizerPortalSession() {
  try {
    return sessionStorage.getItem(ARENA_ORGANIZER_PORTAL_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Organizer dashboard entry: app.* subdomain, or explicit session (post-login / “use dashboard” on marketing host).
 * On localhost with VITE_DEV_PORTAL, we do NOT treat the whole origin as the portal until the session flag is set —
 * otherwise unauthenticated visitors never see PublicLanding (only /login and /register).
 */
export function isOrganizerPortalEntry() {
  if (isTenantPortal()) return true;
  if (import.meta.env.VITE_DEV_PORTAL === 'true') {
    const h = window.location.hostname;
    if (h === 'localhost' || h.startsWith('127.')) {
      return hasOrganizerPortalSession();
    }
  }
  if (hasOrganizerPortalSession()) return true;
  if (isSystemAdmin()) return false;
  return false;
}

/**
 * Public marketing site (www / apex / preview), not app, not tenant site, not platform admin.
 */
export function isPublicLanding() {
  if (isSystemAdmin()) return false;
  if (isOrganizerPortalEntry()) return false;
  return !isTenantPortal() && !isPublicTenantSite();
}

/**
 * Full origin for organizer login + post-register redirect (app subdomain in production).
 */
export function getOrganizerPortalOrigin() {
  const explicit = import.meta.env.VITE_APP_PORTAL_ORIGIN;
  if (explicit) return String(explicit).replace(/\/$/, '');

  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';

  if (hostname === 'localhost' || hostname.startsWith('127.')) {
    return `${protocol}//${hostname}${portPart}`;
  }

  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const sub = parts[0];
    const rest = parts.slice(1).join('.');
    if (sub === 'app') {
      return `${protocol}//${hostname}${portPart}`;
    }
    if (sub === 'admin') {
      return `${protocol}//app.${rest}${portPart}`;
    }
    if (sub !== 'www') {
      return `${protocol}//app.${rest}${portPart}`;
    }
    return `${protocol}//app.${rest}${portPart}`;
  }

  if (parts.length === 2) {
    return `${protocol}//app.${hostname}${portPart}`;
  }

  return `${protocol}//${hostname}${portPart}`;
}

/** Marketing site origin (for "Register" from app.* login page). */
export function getMarketingSiteOrigin() {
  const explicit = import.meta.env.VITE_MARKETING_SITE_ORIGIN;
  if (explicit) return String(explicit).replace(/\/$/, '');

  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';

  if (hostname === 'localhost' || hostname.startsWith('127.')) {
    return `${protocol}//${hostname}${portPart}`;
  }

  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[0] === 'app') {
    const rest = parts.slice(1).join('.');
    return `${protocol}//www.${rest}${portPart}`;
  }

  return `${protocol}//${hostname}${portPart}`;
}

/** Persisted choice: default home after login — league organizer vs global player hub. */
export const ARENA_HUB_PREFERENCE_KEY = 'arena_hub_preference';

/** user_tenants roles that can run league operations (create tournaments, org settings, etc.). */
export const LEAGUE_HOST_ROLES = ['organizer', 'admin', 'staff'];

/**
 * League hosts: org owners / paid subscribers / staff with tournament rights.
 * Plain "member" accounts (players only) are false — they always get the player hub.
 */
export function isLeagueHostUser(user) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const memberships = user.tenant_memberships;
  if (!Array.isArray(memberships) || memberships.length === 0) return false;
  return memberships.some((m) => m?.role_in_tenant && LEAGUE_HOST_ROLES.includes(m.role_in_tenant));
}

/**
 * Sidebar + default home: hosts use organizer nav unless they explicitly switched to player hub;
 * non-hosts always use player hub (ignores stale localStorage "organizer").
 */
export function getEffectiveHubMode(user) {
  const stored = getHubPreference();
  if (isLeagueHostUser(user)) {
    return stored === 'player' ? 'player' : 'organizer';
  }
  return 'player';
}

export function getHubPreference() {
  try {
    const v = localStorage.getItem(ARENA_HUB_PREFERENCE_KEY);
    if (v === 'player' || v === 'organizer') return v;
  } catch {
    /* ignore */
  }
  return 'organizer';
}

export function setHubPreference(pref) {
  try {
    if (pref === 'player' || pref === 'organizer') {
      localStorage.setItem(ARENA_HUB_PREFERENCE_KEY, pref);
    }
  } catch {
    /* ignore */
  }
}
