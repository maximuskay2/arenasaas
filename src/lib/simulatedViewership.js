/** Deterministic pseudo-metrics for sponsor decks until live Twitch/YouTube APIs are wired. */

function hash32(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

/**
 * @param {string} tournamentId
 * @param {string} [streamUrl]
 * @returns {{ peak: number, average: number, hoursWatched: number, trendPct: number, simulated: true }}
 */
export function simulatedViewershipForTournament(tournamentId, streamUrl) {
  const h = hash32(`${tournamentId}::${streamUrl || ""}`);
  const peak = 800 + (h % 220_000);
  const average = Math.max(120, Math.round(peak * (0.28 + (h % 25) / 100)));
  const hoursWatched = Math.round((peak / 950 + (h % 800) / 8) * 10) / 10;
  const trendPct = 2 + (h % 22);
  return { peak, average, hoursWatched, trendPct, simulated: true };
}
