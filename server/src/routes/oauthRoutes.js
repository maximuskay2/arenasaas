/**
 * Game OAuth link routes (Discord / Steam / Riot) — env-gated.
 * GET /api/oauth/status — which providers are configured
 * GET /api/oauth/:provider/start — requires Bearer auth; redirects to provider
 * GET /api/oauth/:provider/callback — consumes state, writes users.game_handles
 */
import express from 'express';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { mintOAuthState, consumeOAuthState } from '../lib/oauth/stateStore.js';
import {
  oauthGloballyEnabled,
  listProviderStatus,
  providerConfig,
  buildAuthorizeUrl,
  completeProviderCallback,
  spaReturnUrl,
} from '../lib/oauth/providers.js';

const router = express.Router();
const SUPPORTED = new Set(['discord', 'steam', 'riot']);

function userIdFromReq(req) {
  const u = req.user || {};
  return String(u.sub || u.id || u.user_id || '').trim();
}

router.get('/status', (_req, res) => {
  res.json({
    enabled: oauthGloballyEnabled(),
    providers: listProviderStatus(),
  });
});

router.get('/:provider/start', requireAuth, async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!SUPPORTED.has(provider)) {
    return res.status(400).json({ error: 'Unsupported provider', provider });
  }
  if (!oauthGloballyEnabled()) {
    return res.status(501).json({
      error: 'Game OAuth disabled. Set OAUTH_ENABLED=true and provider secrets.',
      provider,
      providers: listProviderStatus(),
    });
  }
  const cfg = providerConfig(provider);
  if (!cfg.configured) {
    return res.status(501).json({
      error: `OAuth provider "${provider}" is not configured`,
      provider,
      hint:
        provider === 'discord'
          ? 'Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET'
          : provider === 'steam'
            ? 'Set STEAM_API_KEY'
            : 'Set RIOT_CLIENT_ID and RIOT_CLIENT_SECRET',
    });
  }

  const userId = userIdFromReq(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const returnTo = String(req.query.returnTo || req.query.return_to || '').trim();
  try {
    const state = await mintOAuthState({ userId, provider, returnTo });
    const url = buildAuthorizeUrl(provider, state);
    if (!url) return res.status(501).json({ error: 'Could not build authorize URL', provider });
    // Prefer browser redirect; JSON when Accept is application/json (SPA fetch)
    const accept = String(req.headers.accept || '');
    if (accept.includes('application/json') && !req.query.redirect) {
      return res.json({ url, provider, state });
    }
    return res.redirect(302, url);
  } catch (e) {
    console.error('[oauth/start]', e);
    return res.status(500).json({ error: e.message || 'OAuth start failed' });
  }
});

router.get('/:provider/callback', optionalAuth, async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!SUPPORTED.has(provider)) {
    return res.status(400).send('Unsupported provider');
  }
  const state = String(req.query.state || '');
  const stored = await consumeOAuthState(state);
  if (!stored || stored.provider !== provider) {
    return res.redirect(
      spaReturnUrl('', { linked: false, error: 'invalid_state', provider })
    );
  }

  try {
    const identity = await completeProviderCallback(provider, req.query, stored);
    await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const { rows } = await client.query(`SELECT game_handles FROM users WHERE id::text = $1 LIMIT 1`, [
        stored.userId,
      ]);
      if (!rows.length) throw Object.assign(new Error('User not found'), { status: 404 });
      let handles = rows[0].game_handles;
      if (typeof handles === 'string') {
        try {
          handles = JSON.parse(handles);
        } catch {
          handles = {};
        }
      }
      if (!handles || typeof handles !== 'object') handles = {};
      handles[identity.handleKey] = identity.handleValue;
      // Nested verified metadata under `_oauth` without breaking flat join lookups
      const oauthMeta = handles._oauth && typeof handles._oauth === 'object' ? handles._oauth : {};
      Object.assign(oauthMeta, identity.meta || {});
      handles._oauth = oauthMeta;
      await client.query(
        `UPDATE users SET game_handles = $2::jsonb, updated_date = NOW() WHERE id::text = $1`,
        [stored.userId, JSON.stringify(handles)]
      );
    });
    return res.redirect(
      spaReturnUrl(stored.returnTo, { linked: true, error: null, provider })
    );
  } catch (e) {
    console.error('[oauth/callback]', e);
    return res.redirect(
      spaReturnUrl(stored.returnTo, {
        linked: false,
        error: e.code || e.message || 'link_failed',
        provider,
      })
    );
  }
});

export default router;
