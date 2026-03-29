/**
 * Elo rating system for teams.
 * Starting Elo: 1200. K-factor: 32.
 * We approximate match history from stored wins/losses,
 * assuming an average opponent Elo of 1200.
 */

const BASE_ELO = 1200;
const K = 32;

/**
 * Compute expected score for player A against player B.
 */
export function expectedScore(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

/**
 * Given wins and losses, compute an estimated Elo.
 * We simulate each game against an average 1200 opponent.
 */
export function computeElo(wins = 0, losses = 0) {
  let elo = BASE_ELO;
  // Simulate wins
  for (let i = 0; i < wins; i++) {
    const expected = expectedScore(elo, BASE_ELO);
    elo = elo + K * (1 - expected);
  }
  // Simulate losses
  for (let i = 0; i < losses; i++) {
    const expected = expectedScore(elo, BASE_ELO);
    elo = elo + K * (0 - expected);
  }
  return Math.round(elo);
}

/**
 * Compute Elo for each team and return sorted array (highest first).
 * This is the "Elo seeding" — best teams get lowest seeds (1 = strongest).
 */
export function seedByElo(teams) {
  const withElo = teams.map((t) => ({
    ...t,
    elo: computeElo(t.wins, t.losses),
  }));
  // Sort descending by Elo (best team = seed #1)
  return withElo.sort((a, b) => b.elo - a.elo);
}

/**
 * Get a label tier for an Elo value.
 */
export function eloTier(elo) {
  if (elo >= 1400) return { label: "Diamond", color: "text-cyan-400" };
  if (elo >= 1300) return { label: "Platinum", color: "text-teal-400" };
  if (elo >= 1200) return { label: "Gold", color: "text-yellow-400" };
  if (elo >= 1100) return { label: "Silver", color: "text-slate-300" };
  return { label: "Bronze", color: "text-orange-400" };
}