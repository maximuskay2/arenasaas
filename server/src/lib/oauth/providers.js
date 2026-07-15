/**
 * Env-gated OAuth providers for game identity linking (Discord / Steam / Riot).
 */

function frontBase() {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function apiPublicBase() {
  return String(process.env.APP_PUBLIC_URL || process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(
    /\/$/,
    ''
  );
}

export function providerConfig(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'discord') {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri =
      process.env.DISCORD_REDIRECT_URI || `${apiPublicBase()}/api/oauth/discord/callback`;
    return clientId && clientSecret
      ? { provider: 'discord', clientId, clientSecret, redirectUri, configured: true }
      : { provider: 'discord', configured: false };
  }
  if (p === 'steam') {
    const apiKey = process.env.STEAM_API_KEY;
    const realm = process.env.STEAM_REALM || apiPublicBase();
    const returnTo = process.env.STEAM_RETURN_TO || `${apiPublicBase()}/api/oauth/steam/callback`;
    return apiKey
      ? { provider: 'steam', apiKey, realm, returnTo, configured: true }
      : { provider: 'steam', configured: false };
  }
  if (p === 'riot') {
    const clientId = process.env.RIOT_CLIENT_ID;
    const clientSecret = process.env.RIOT_CLIENT_SECRET;
    const redirectUri = process.env.RIOT_REDIRECT_URI || `${apiPublicBase()}/api/oauth/riot/callback`;
    return clientId && clientSecret
      ? { provider: 'riot', clientId, clientSecret, redirectUri, configured: true }
      : { provider: 'riot', configured: false };
  }
  return { provider: p, configured: false };
}

export function oauthGloballyEnabled() {
  const v = String(process.env.OAUTH_ENABLED || '').toLowerCase();
  if (v === '0' || v === 'false') return false;
  // Auto-enable when any provider has secrets
  return (
    providerConfig('discord').configured ||
    providerConfig('steam').configured ||
    providerConfig('riot').configured ||
    v === '1' ||
    v === 'true'
  );
}

export function listProviderStatus() {
  return ['discord', 'steam', 'riot'].map((p) => {
    const c = providerConfig(p);
    return { provider: p, configured: Boolean(c.configured) };
  });
}

export function buildAuthorizeUrl(provider, state) {
  const c = providerConfig(provider);
  if (!c.configured) return null;
  if (provider === 'discord') {
    const params = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope: 'identify',
      state,
      prompt: 'consent',
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
  }
  if (provider === 'steam') {
    // OpenID 2.0 (Steam)
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': `${c.returnTo}?state=${encodeURIComponent(state)}`,
      'openid.realm': c.realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return `https://steamcommunity.com/openid/login?${params}`;
  }
  if (provider === 'riot') {
    const params = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope: 'openid',
      state,
    });
    // Generic RSO authorize host — region may vary; override via RIOT_AUTH_URL
    const base = process.env.RIOT_AUTH_URL || 'https://auth.riotgames.com/authorize';
    return `${base}?${params}`;
  }
  return null;
}

/**
 * Exchange code / validate OpenID and return { handleKey, handleValue, meta }.
 */
export async function completeProviderCallback(provider, query, statePayload) {
  const c = providerConfig(provider);
  if (!c.configured) throw Object.assign(new Error('Provider not configured'), { status: 501, code: 'oauth_not_configured' });

  if (provider === 'discord') {
    const code = String(query.code || '');
    if (!code) throw Object.assign(new Error('Missing code'), { status: 400, code: 'missing_code' });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: c.redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      throw Object.assign(new Error(`Discord token failed: ${t.slice(0, 200)}`), { status: 502 });
    }
    const tok = await tokenRes.json();
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!meRes.ok) throw Object.assign(new Error('Discord profile failed'), { status: 502 });
    const me = await meRes.json();
    const username = me.global_name || me.username || me.id;
    const tag = me.discriminator && me.discriminator !== '0' ? `#${me.discriminator}` : '';
    return {
      handleKey: 'Discord',
      handleValue: `${username}${tag}`,
      meta: {
        discord: {
          id: String(me.id),
          username: me.username,
          global_name: me.global_name || null,
          verified_at: new Date().toISOString(),
        },
      },
    };
  }

  if (provider === 'steam') {
    const claimed = String(query['openid.claimed_id'] || query['openid.identity'] || '');
    const m = claimed.match(/\/id\/(\d+)$/) || claimed.match(/\/openid\/id\/(\d+)$/);
    const steamId = m ? m[1] : null;
    if (!steamId) throw Object.assign(new Error('Steam identity missing'), { status: 400, code: 'steam_identity' });

    // Optional verify with Steam OpenID check_authentication
    const verifyParams = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (k.startsWith('openid.')) verifyParams.set(k, String(v));
    }
    verifyParams.set('openid.mode', 'check_authentication');
    try {
      const vRes = await fetch('https://steamcommunity.com/openid/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyParams,
      });
      const vText = await vRes.text();
      if (!/is_valid\s*:\s*true/i.test(vText)) {
        console.warn('[oauth/steam] OpenID not is_valid — continuing with claimed id only');
      }
    } catch (e) {
      console.warn('[oauth/steam] verify', e?.message || e);
    }

    let persona = steamId;
    try {
      const sum = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(c.apiKey)}&steamids=${steamId}`
      );
      if (sum.ok) {
        const j = await sum.json();
        const p = j?.response?.players?.[0];
        if (p?.personaname) persona = p.personaname;
      }
    } catch {
      /* ignore */
    }
    return {
      handleKey: 'Steam',
      handleValue: persona,
      meta: {
        steam: {
          id: steamId,
          persona,
          verified_at: new Date().toISOString(),
        },
      },
    };
  }

  if (provider === 'riot') {
    const code = String(query.code || '');
    if (!code) throw Object.assign(new Error('Missing code'), { status: 400, code: 'missing_code' });
    const tokenUrl = process.env.RIOT_TOKEN_URL || 'https://auth.riotgames.com/token';
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: c.redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      throw Object.assign(new Error(`Riot token failed: ${t.slice(0, 200)}`), { status: 502 });
    }
    const tok = await tokenRes.json();
    // Prefer access_token userinfo if configured
    let gameName = 'Riot';
    let tagLine = '';
    let puuid = '';
    if (tok.access_token && process.env.RIOT_USERINFO_URL) {
      try {
        const u = await fetch(process.env.RIOT_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        if (u.ok) {
          const profile = await u.json();
          puuid = profile.sub || profile.puuid || '';
          gameName = profile.gameName || profile.preferred_username || gameName;
          tagLine = profile.tagLine || '';
        }
      } catch {
        /* ignore */
      }
    }
    const display = tagLine ? `${gameName}#${tagLine}` : gameName;
    return {
      handleKey: 'Riot',
      handleValue: display,
      meta: {
        riot: {
          puuid: puuid || null,
          gameName,
          tagLine: tagLine || null,
          verified_at: new Date().toISOString(),
        },
      },
    };
  }

  throw Object.assign(new Error('Unknown provider'), { status: 400 });
}

export function spaReturnUrl(returnTo, { linked, error, provider }) {
  const base = (returnTo && String(returnTo).startsWith('http') ? returnTo : null) || `${frontBase()}/player/settings`;
  const u = new URL(base, frontBase());
  if (linked) u.searchParams.set('linked', provider);
  if (error) u.searchParams.set('link_error', error);
  return u.toString();
}
