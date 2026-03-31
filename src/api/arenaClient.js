/**
 * Local API client — legacy-compatible surface for existing pages.
 * Configure Vite proxy to /api or set VITE_API_URL to full API origin (Railway).
 */

import { ARENA_ORGANIZER_PORTAL_SESSION_KEY } from '@/lib/routingLogic';
import { getArenaSocket } from '@/lib/realtimeClient';

const TOKEN_KEY = 'arena_access_token';
const IMPERSONATE_TENANT_KEY = 'impersonate_tenant_id';

/** Decode JWT payload (no verify) — only used to mirror `tenant_id` into `X-Tenant-ID` for RLS. */
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** RLS uses `X-Tenant-ID` when set; JWT also carries `tenant_id`, but this keeps CRUD correct if either path is used. */
function tenantIdForApiHeaders() {
  try {
    const imp = localStorage.getItem(IMPERSONATE_TENANT_KEY);
    if (imp && String(imp).trim()) return String(imp).trim();
  } catch {
    /* ignore */
  }
  const payload = decodeJwtPayload(getToken() || '');
  const tid = payload?.tenant_id;
  if (tid != null && String(tid).trim()) return String(tid).trim();
  return '';
}

function apiUrl(path) {
  const raw = import.meta.env.VITE_API_URL;
  if (raw) return `${String(raw).replace(/\/$/, '')}${path}`;
  return path;
}

function getToken() {
  try {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      localStorage.getItem('maxikay_access_token') ||
      localStorage.getItem('base44_access_token')
    );
  } catch {
    return null;
  }
}

function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('maxikay_access_token');
    localStorage.removeItem('base44_access_token');
  } catch { /* ignore */ }
}

const AUTH_PATHS_NO_SILENT_REFRESH = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/login/mfa',
  '/api/auth/logout',
];

function shouldAttemptSilentRefresh(path) {
  if (!path.startsWith('/api/')) return false;
  return !AUTH_PATHS_NO_SILENT_REFRESH.some((p) => path === p || path.startsWith(`${p}?`));
}

/** Raw fetch so we never recurse through `request()` when the access token is stale. */
async function trySilentRefresh() {
  try {
    const res = await fetch(apiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok || !data?.token) return false;
    setToken(data.token);
    return true;
  } catch {
    return false;
  }
}

async function request(method, path, { body, headers = {}, _retryAfterRefresh = false } = {}) {
  const token = getToken();
  const h = { ...headers };
  if (body !== undefined && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
  }
  if (token) h.Authorization = `Bearer ${token}`;
  if (!h['X-Tenant-ID'] && !h['x-tenant-id'] && path.startsWith('/api/')) {
    const tid = tenantIdForApiHeaders();
    if (tid) h['X-Tenant-ID'] = tid;
  }

  const res = await fetch(apiUrl(path), {
    method,
    headers: h,
    credentials: 'include',
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (
    res.status === 401 &&
    !_retryAfterRefresh &&
    shouldAttemptSilentRefresh(path) &&
    (await trySilentRefresh())
  ) {
    return request(method, path, { body, headers, _retryAfterRefresh: true });
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function buildEntity(name) {
  const entityName = name;
  return {
    async filter(where = {}, sort, limit) {
      const params = new URLSearchParams();
      Object.entries(where).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
      if (sort) params.set('order', sort);
      if (limit != null) params.set('limit', String(limit));
      const q = params.toString();
      return request('GET', `/api/v1/${name}${q ? `?${q}` : ''}`);
    },
    async list(sort, limit) {
      return this.filter({}, sort, limit);
    },
    async create(data) {
      return request('POST', `/api/v1/${name}`, { body: data });
    },
    async update(id, data) {
      return request('PATCH', `/api/v1/${name}/${id}`, { body: data });
    },
    async delete(id) {
      return request('DELETE', `/api/v1/${name}/${id}`);
    },
    async bulkCreate(items) {
      return request('POST', `/api/v1/${name}/bulk`, { body: { items } });
    },
    subscribe(cb) {
      if (entityName !== 'Match' || typeof cb !== 'function') return () => {};
      const s = getArenaSocket();
      const handler = (payload) => {
        const m = payload?.match;
        if (m?.id) cb({ id: m.id, match: m });
      };
      s.on('match:updated', handler);
      return () => s.off('match:updated', handler);
    },
  };
}

const ENTITY_NAMES = [
  'Tournament',
  'Match',
  'Team',
  'Tenant',
  'TenantConfig',
  'TenantEntitlement',
  'TenantWallet',
  'WithdrawalRequest',
  'PaymentLedger',
  'GameTemplate',
  'PlayerStat',
  'FreeAgent',
  'Sponsor',
  'MerchandiseItem',
  'MerchandiseOrder',
  'Notification',
  'AuditLog',
  'OTPRecord',
  'PrizePayment',
  'MatchReport',
  'MatchHighlight',
  'FanVote',
  'FeedPost',
  'FeedComment',
  'ChatMessage',
  'RescheduleRequest',
  'DevTodo',
];

const entities = {};
for (const n of ENTITY_NAMES) {
  entities[n] = buildEntity(n);
}

entities.PlatformConfig = {
  async list() {
    const rows = await request('GET', '/api/v1/platform-config');
    return Array.isArray(rows) ? rows : [rows];
  },
  async create(data) {
    return request('POST', '/api/v1/platform-config', { body: data });
  },
  async update(id, data) {
    return request('PATCH', `/api/v1/platform-config/${id}`, { body: data });
  },
};

export const arena = {
  entities,

  auth: {
    async register(body) {
      const data = await request('POST', '/api/auth/register', { body });
      if (data?.token) setToken(data.token);
      return data;
    },
    async login(body) {
      const data = await request('POST', '/api/auth/login', { body });
      if (data?.token) setToken(data.token);
      return data;
    },
    async loginMfa(body) {
      const data = await request('POST', '/api/auth/login/mfa', { body });
      if (data?.token) setToken(data.token);
      return data;
    },
    async mfaSetupInit() {
      return request('POST', '/api/auth/mfa/setup-init', { body: {} });
    },
    async mfaSetupVerify(body) {
      return request('POST', '/api/auth/mfa/setup-verify', { body });
    },
    async mfaDisable(body) {
      return request('POST', '/api/auth/mfa/disable', { body });
    },
    /** No network call when logged out — avoids 401 + refresh noise in the console. */
    async me() {
      if (!getToken()) return null;
      return request('GET', '/api/auth/me');
    },
    /** Internal player wallet rows: [{ currency, balance, updated_date }, ...] */
    async meWallet() {
      return request('GET', '/api/auth/me/wallet');
    },
    async meAccolades() {
      return request('GET', '/api/auth/me/accolades');
    },
    async mePrizePayoutKyc() {
      return request('GET', '/api/auth/me/prize-payout-kyc');
    },
    /** Player vault withdrawal (requires X-Tenant-ID; KYC gate may apply). */
    async meWithdrawalRequest(body, opts = {}) {
      const headers = opts.tenantId ? { 'X-Tenant-ID': String(opts.tenantId) } : {};
      return request('POST', '/api/auth/me/withdrawal-request', { body, headers });
    },
    async updateMe(data) {
      return request('PATCH', '/api/auth/me', { body: data });
    },
    async refresh() {
      const data = await request('POST', '/api/auth/refresh', { body: {} });
      if (data?.token) setToken(data.token);
      return data;
    },
    redirectToLogin(returnUrl) {
      const q = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
      window.location.assign(`/login${q}`);
    },
    async logout(redirectUrl) {
      try {
        const t = getToken();
        if (t) {
          await fetch(apiUrl('/api/auth/logout'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            credentials: 'include',
          });
        }
      } catch {
        /* ignore */
      }
      setToken(null);
      try {
        sessionStorage.removeItem(ARENA_ORGANIZER_PORTAL_SESSION_KEY);
      } catch {
        /* ignore */
      }
      if (redirectUrl) window.location.replace(redirectUrl);
    },
    async inviteUser() {
      return Promise.resolve();
    },
  },

  /** Community / war-room feed (auth required; namespace via scope + optional X-Tenant-ID). */
  community: {
    listPosts: (params = {}, opts = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      });
      const q = qs.toString();
      return request('GET', `/api/community/posts${q ? `?${q}` : ''}`, { headers: opts.headers || {} });
    },
    createPost: (body, opts = {}) => request('POST', '/api/community/posts', { body, headers: opts.headers || {} }),
    deletePost: (id) => request('DELETE', `/api/community/posts/${encodeURIComponent(id)}`),
    pinPost: (id, pinned) => request('PATCH', `/api/community/posts/${encodeURIComponent(id)}/pin`, { body: { pinned } }),
    likePost: (id) => request('POST', `/api/community/posts/${encodeURIComponent(id)}/like`),
    unlikePost: (id) => request('DELETE', `/api/community/posts/${encodeURIComponent(id)}/like`),
    listComments: (postId) => request('GET', `/api/community/posts/${encodeURIComponent(postId)}/comments`),
    createComment: (postId, body) =>
      request('POST', `/api/community/posts/${encodeURIComponent(postId)}/comments`, { body }),
    deleteComment: (id) => request('DELETE', `/api/community/comments/${encodeURIComponent(id)}`),
    shadowban: (body) => request('POST', '/api/community/admin/shadowban', { body }),
    unshadowban: (body) => request('DELETE', '/api/community/admin/shadowban', { body }),
  },

  /** Self-serve organizer org creation (server uses platform RLS + user_tenants + entitlements). */
  tenantRegistration: {
    async complete(body) {
      const data = await request('POST', '/api/tenant-registration', { body });
      if (data?.token) setToken(data.token);
      return data;
    },
  },

  functions: {
    sendOtp: (body) => request('POST', '/api/functions/send-otp', { body }),
    verifyOtp: (body) => request('POST', '/api/functions/verify-otp', { body }),
    setupStripe: (body) => request('POST', '/api/functions/setup-stripe', { body }),
  },

  /** Unauthenticated / public */
  public: {
    platformStatus: () => request('GET', '/api/public/status'),
    /** SaaS subscription vs one-tournament amounts (USD/NGN) from platform_config. */
    pricing: () => request('GET', '/api/public/pricing'),
    /** Stripe / Paystack / Flutterwave availability + optional `recommended_order` for tournament currency (e.g. NGN). */
    paymentRails: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.currency) qs.set('currency', String(params.currency));
      const q = qs.toString();
      return request('GET', `/api/public/payment-rails${q ? `?${q}` : ''}`);
    },
    /** One tournament with organizer + roster_size (same rules as discovery catalog). */
    tournamentById: (id) => request('GET', `/api/public/tournament/${encodeURIComponent(id)}`),
    /** Teams for a catalog-visible tournament (anonymous-friendly). */
    tournamentTeams: (id) => request('GET', `/api/public/tournament/${encodeURIComponent(id)}/teams`),
    /** Matches for a catalog-visible tournament (anonymous-friendly). */
    tournamentMatches: (id) => request('GET', `/api/public/tournament/${encodeURIComponent(id)}/matches`),

    /** Community feed read-only (anonymous-friendly). */
    communityPosts: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      });
      const q = qs.toString();
      return request("GET", `/api/public/community/posts${q ? `?${q}` : ""}`);
    },
    communityComments: (postId) =>
      request("GET", `/api/public/community/posts/${encodeURIComponent(postId)}/comments`),
    /** Standings + player_stats slice for Performance tab. */
    tournamentPerformance: (id) => request('GET', `/api/public/tournament/${encodeURIComponent(id)}/performance`),
    tournamentLeagueStandings: (id) =>
      request('GET', `/api/public/tournament/${encodeURIComponent(id)}/league-standings`),

    gameTaxonomyPlatforms: () => request('GET', '/api/public/game-taxonomy/platforms'),
    gameTaxonomyGenreTemplates: () => request('GET', '/api/public/game-taxonomy/genre-templates'),
    gameTaxonomyGenres: (platformId) => {
      const qs = platformId ? `?platform_id=${encodeURIComponent(platformId)}` : '';
      return request('GET', `/api/public/game-taxonomy/genres${qs}`);
    },
    gameTaxonomyTitles: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      });
      const q = qs.toString();
      return request('GET', `/api/public/game-taxonomy/titles${q ? `?${q}` : ''}`);
    },
    gameTaxonomyDefaults: (titleId) =>
      request('GET', `/api/public/game-taxonomy/defaults/${encodeURIComponent(titleId)}`),
    /** Team landing page (roster KDA, tag appearances, prize totals). */
    teamProfile: (id) => request('GET', `/api/public/team/${encodeURIComponent(id)}`),
    tenantByHost: (host) => request('GET', `/api/public/tenant-by-host?host=${encodeURIComponent(host)}`),
    /** Paginated discovery catalog (transaction layer). */
    discoveryTournaments: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      });
      const q = qs.toString();
      return request('GET', `/api/public/tournaments-catalog${q ? `?${q}` : ''}`);
    },
    /** Alias of tournaments-catalog (same query params). */
    discoveryTournamentsAlt: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      });
      const q = qs.toString();
      return request('GET', `/api/public/tournaments${q ? `?${q}` : ''}`);
    },
    /** Stats strip + recent / upcoming / live + top orgs, teams, games (catalog visibility). */
    discoveryDashboard: () => request('GET', '/api/public/discovery/dashboard'),
    matchWatchMeta: (matchId) =>
      request('GET', `/api/public/match/${encodeURIComponent(matchId)}/watch`),
    powerRankings: (params = {}) => {
      const q = new URLSearchParams();
      if (params.limit != null) q.set('limit', String(params.limit));
      const s = q.toString();
      return request('GET', `/api/public/power-rankings${s ? `?${s}` : ''}`);
    },
    playerCareer: (email) =>
      request('GET', `/api/public/player-career?email=${encodeURIComponent(email)}`),
  },

  /** Atomic join + transaction endpoints */
  tournaments: {
    join: (tournamentId, body, opts = {}) => {
      const headers = { ...(opts.headers || {}) };
      if (opts.idempotencyKey) headers['Idempotency-Key'] = String(opts.idempotencyKey);
      return request('POST', `/api/tournaments/${encodeURIComponent(tournamentId)}/join`, { body, headers });
    },
  },

  engine: {
    forfeitApply: (body) => request('POST', '/api/engine/forfeit', { body }),
  },

  /** Match reporting, dispute resolution, tournament finalize + prize worker enqueue */
  matchEngine: {
    listDisputes: () => request('GET', '/api/match-engine/disputes'),
    uploadMatchEvidence: (matchId, files) => {
      const fd = new FormData();
      for (const f of files.slice(0, 8)) fd.append('screenshots', f);
      return request('POST', `/api/match-engine/matches/${encodeURIComponent(matchId)}/evidence`, { body: fd });
    },
    reportResult: (matchId, body) =>
      request('POST', `/api/match-engine/matches/${encodeURIComponent(matchId)}/report-result`, { body }),
    listReports: (matchId) => request('GET', `/api/match-engine/matches/${encodeURIComponent(matchId)}/reports`),
    resolveDispute: (matchId, body) =>
      request('PATCH', `/api/match-engine/matches/${encodeURIComponent(matchId)}/resolve-dispute`, { body }),
    finalizeTournament: (tournamentId, body = {}) =>
      request('POST', `/api/match-engine/tournaments/${encodeURIComponent(tournamentId)}/finalize`, {
        body: Object.keys(body).length ? body : {},
      }),
    finalizeStatus: (tournamentId) =>
      request('GET', `/api/match-engine/tournaments/${encodeURIComponent(tournamentId)}/finalize-status`),
    getPickem: (tournamentId, opts = {}) => {
      const tid = opts.tenantId != null && String(opts.tenantId).trim() ? String(opts.tenantId).trim() : '';
      const headers = tid ? { 'X-Tenant-ID': tid } : {};
      return request('GET', `/api/match-engine/tournaments/${encodeURIComponent(tournamentId)}/pickem`, { headers });
    },
    putPickem: (tournamentId, body, opts = {}) => {
      const tid = opts.tenantId != null && String(opts.tenantId).trim() ? String(opts.tenantId).trim() : '';
      const headers = tid ? { 'X-Tenant-ID': tid } : {};
      return request('PUT', `/api/match-engine/tournaments/${encodeURIComponent(tournamentId)}/pickem`, {
        body,
        headers,
      });
    },
  },

  payments: {
    /** Verify Stripe cs_/pi_, Paystack reference, or Flutterwave tx_ref and record payment_ledger for join. */
    verifyEntryReference: (body) => request('POST', '/api/payments/verify-entry-reference', { body }),
    createCheckoutSession: (body) => request('POST', '/api/payments/create-checkout-session', { body }),
    createSubscriptionSession: (body) => request('POST', '/api/payments/create-subscription-session', { body }),
    /** Stripe redirect URL, or Paystack/Flutterwave self-service billing metadata. */
    createPortalSession: (body) => request('POST', '/api/payments/create-portal-session', { body }),
    subscriptionCancelAtPeriodEnd: (body) =>
      request('POST', '/api/payments/subscription-cancel-at-period-end', { body }),
    releasePayout: (body) => request('POST', '/api/payments/release-payout', { body }),
    /** Stripe Connect capabilities for current tenant (requires STRIPE_SECRET_KEY on API). */
    stripeConnectStatus: () => request('GET', '/api/payments/stripe-connect-status'),
  },

  notifications: {
    registerFcm: (body) => request('POST', '/api/notifications/fcm/register', { body }),
  },

  paystack: {
    initialize: (body) => request('POST', '/api/paystack/initialize', { body }),
  },

  flutterwave: {
    initialize: (body) => request('POST', '/api/flutterwave/initialize', { body }),
  },

  gameTaxonomy: {
    createCustom: (body) => request('POST', '/api/v1/game-taxonomy/custom-titles', { body }),
  },

  /** Platform admin (`role: admin`) — bypasses API maintenance gate */
  system: {
    emailStatus: () => request('GET', '/api/system/email-status'),
    testEmail: (body) => request('POST', '/api/system/test-email', { body }),
    pulseReadonly: () => request('GET', '/api/system/pulse-readonly'),
    stripeEscrow: () => request('GET', '/api/system/stripe-escrow'),
    platformSecretsList: () => request('GET', '/api/system/platform-secrets'),
    platformSecretPut: (key, value) => request('PUT', `/api/system/platform-secrets/${encodeURIComponent(key)}`, { body: { value } }),
    platformSecretDelete: (key) => request('DELETE', `/api/system/platform-secrets/${encodeURIComponent(key)}`),
    hwidBansList: () => request('GET', '/api/system/hwid-bans'),
    hwidBanCreate: (body) => request('POST', '/api/system/hwid-bans', { body }),
    hwidBanDelete: (id) => request('DELETE', `/api/system/hwid-bans/${encodeURIComponent(id)}`),
    bracketJobEnqueue: (body) => request('POST', '/api/system/bracket-jobs', { body }),
    bracketJobDepth: () => request('GET', '/api/system/bracket-jobs/depth'),
    bracketJobDrain: (body) => request('POST', '/api/system/bracket-jobs/drain', { body }),
    fcmNotificationEnqueue: (body) => request('POST', '/api/system/notification-jobs/fcm', { body }),
    fcmNotificationDepth: () => request('GET', '/api/system/notification-jobs/fcm/depth'),
    fcmNotificationDrain: (body) => request('POST', '/api/system/notification-jobs/fcm/drain', { body }),
    customGameTitlesPending: () => request('GET', '/api/system/custom-game-titles'),
    verifyCustomGameTitle: (id, body) =>
      request('PATCH', `/api/system/custom-game-titles/${encodeURIComponent(id)}/verify`, { body }),
    gameGenreTemplatesAdmin: () => request('GET', '/api/system/game-genre-templates'),
    gameGenreTemplateCreate: (body) => request('POST', '/api/system/game-genre-templates', { body }),
    gameGenreTemplatePatch: (id, body) =>
      request('PATCH', `/api/system/game-genre-templates/${encodeURIComponent(id)}`, { body }),
  },

  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const doUpload = () => {
          const fd = new FormData();
          fd.append('file', file);
          const t = getToken();
          return fetch(apiUrl('/api/integrations/upload'), {
            method: 'POST',
            headers: t ? { Authorization: `Bearer ${t}` } : {},
            credentials: 'include',
            body: fd,
          });
        };
        let res = await doUpload();
        if (res.status === 401 && (await trySilentRefresh())) {
          res = await doUpload();
        }
        const text = await res.text();
        let data;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        if (!res.ok) {
          const msg = (data && data.error) || text || 'Upload failed';
          throw new Error(msg);
        }
        return data || {};
      },
      SendEmail: (body) => request('POST', '/api/integrations/send-email', { body }),
    },
  },
};

/** Persist token after login / register */
arena.setAuthToken = (token) => setToken(token);

export const maxikay = arena;
