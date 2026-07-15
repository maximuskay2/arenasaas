/**
 * Competitive integrity gates for tournament join.
 * Regions are normalized to lowercase tokens: global, us, eu, asia, africa, latam, na, oce, af, me.
 */

const REGION_ALIASES = {
  us: 'us',
  na: 'us',
  eu: 'eu',
  asia: 'asia',
  oce: 'asia',
  africa: 'africa',
  af: 'africa',
  latam: 'latam',
  me: 'me',
  global: 'global',
  any: 'global',
  world: 'global',
};

export function normalizeRegion(raw) {
  const k = String(raw || 'global')
    .trim()
    .toLowerCase();
  return REGION_ALIASES[k] || k || 'global';
}

export function parseAllowedRegions(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(normalizeRegion).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(normalizeRegion).filter(Boolean);
    } catch {
      /* comma list */
    }
    return value
      .split(/[,|]/)
      .map((s) => normalizeRegion(s))
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.values(value).map(normalizeRegion).filter(Boolean);
  }
  return [];
}

/**
 * @param {object} tournament - row with allowed_regions, min_team_elo, require_game_handle
 * @param {object} ctx
 * @param {string} ctx.userRegion
 * @param {number|null} ctx.teamElo - estimated team Elo (optional)
 * @param {boolean} ctx.hasGameHandle
 * @param {boolean} ctx.userSuspended - platform email ban proxy
 * @returns {{ ok: true } | { ok: false, code: string, error: string }}
 */
export function evaluateJoinEligibility(tournament, ctx = {}) {
  if (!tournament) return { ok: false, code: 'not_found', error: 'Tournament not found' };

  if (ctx.userSuspended) {
    return { ok: false, code: 'user_suspended', error: 'Your account cannot join tournaments' };
  }

  const allowed = parseAllowedRegions(tournament.allowed_regions);
  if (allowed.length > 0 && !allowed.includes('global')) {
    const ur = normalizeRegion(ctx.userRegion || 'global');
    if (ur !== 'global' && !allowed.includes(ur)) {
      return {
        ok: false,
        code: 'region_restricted',
        error: `This event is restricted to regions: ${allowed.join(', ').toUpperCase()}. Your profile region is ${ur.toUpperCase()}.`,
      };
    }
  }

  const minElo = tournament.min_team_elo != null ? Number(tournament.min_team_elo) : null;
  if (minElo != null && Number.isFinite(minElo) && minElo > 0) {
    const teamElo = ctx.teamElo != null ? Number(ctx.teamElo) : 1200;
    if (!Number.isFinite(teamElo) || teamElo < minElo) {
      return {
        ok: false,
        code: 'min_elo',
        error: `Minimum team Elo required: ${minElo}. Current estimate: ${Number.isFinite(teamElo) ? teamElo : 1200}.`,
      };
    }
  }

  if (tournament.require_game_handle && !ctx.hasGameHandle) {
    return {
      ok: false,
      code: 'game_handle_required',
      error: 'Link your game ID in Settings before joining this event.',
    };
  }

  return { ok: true };
}
