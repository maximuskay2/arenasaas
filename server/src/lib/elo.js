/**
 * Standard two-player Elo (team vs team). Base rating 1200.
 * R' = R + K * (S - E), E = 1 / (1 + 10^((Rb-Ra)/400))
 */

export const ELO_DEFAULT = 1200;

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (Number(ratingB) - Number(ratingA)) / 400));
}

export function kFactorFromPrizePool(prizePool) {
  const p = Number(prizePool);
  if (!Number.isFinite(p) || p < 0) return 24;
  if (p >= 10_000) return 40;
  if (p >= 2500) return 32;
  if (p >= 500) return 28;
  return 24;
}

/**
 * @returns {{ newA: number, newB: number, deltaA: number, deltaB: number }}
 */
export function computeMatchElo(ratingA, ratingB, scoreA, k) {
  const ra = Number(ratingA);
  const rb = Number(ratingB);
  const kf = Number(k);
  const ea = expectedScore(ra, rb);
  const eb = expectedScore(rb, ra);
  const sa = Number(scoreA);
  const sb = 1 - sa;
  const newA = ra + kf * (sa - ea);
  const newB = rb + kf * (sb - eb);
  return {
    newA: Math.round(newA * 100) / 100,
    newB: Math.round(newB * 100) / 100,
    deltaA: Math.round((newA - ra) * 100) / 100,
    deltaB: Math.round((newB - rb) * 100) / 100,
  };
}
