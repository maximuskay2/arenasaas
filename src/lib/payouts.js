/**
 * Prize distribution and payout logic.
 * Supports configurable split across top placements.
 * Records payouts in PaymentLedger for audit trail.
 */
import { maxikay } from "@/api/maxikayClient";

/**
 * Default prize split percentages (must sum to 100).
 * Keys are placement (1 = champion, 2 = runner-up, etc.)
 */
export const DEFAULT_PRIZE_SPLIT = {
  1: 60,
  2: 25,
  3: 15,
};

/**
 * Determine final placements from completed bracket matches.
 * Returns array of { placement, teamId, teamName, captainEmail } sorted by placement.
 */
export function determinePlacements(matches, teams) {
  const teamMap = {};
  teams.forEach((t) => (teamMap[t.id] = t));

  // Find the final match (highest round number)
  const completedMatches = matches.filter((m) => m.status === "completed" && m.winner_id);
  if (completedMatches.length === 0) return [];

  const maxRound = Math.max(...completedMatches.map((m) => m.round));
  const finalMatch = completedMatches.find((m) => m.round === maxRound);
  if (!finalMatch) return [];

  const placements = [];

  // 1st place: winner of the final
  if (finalMatch.winner_id) {
    const team = teamMap[finalMatch.winner_id];
    placements.push({
      placement: 1,
      teamId: finalMatch.winner_id,
      teamName: finalMatch.winner_name,
      captainEmail: team?.captain_email,
    });
  }

  // 2nd place: loser of the final
  const runnerUpId =
    finalMatch.team_a_id === finalMatch.winner_id
      ? finalMatch.team_b_id
      : finalMatch.team_a_id;
  const runnerUpName =
    finalMatch.team_a_id === finalMatch.winner_id
      ? finalMatch.team_b_name
      : finalMatch.team_a_name;
  if (runnerUpId) {
    const team = teamMap[runnerUpId];
    placements.push({
      placement: 2,
      teamId: runnerUpId,
      teamName: runnerUpName,
      captainEmail: team?.captain_email,
    });
  }

  // 3rd place: losers of semi-finals (round maxRound-1), excluding finalists
  const finalistIds = new Set([finalMatch.team_a_id, finalMatch.team_b_id]);
  const semiFinals = completedMatches.filter((m) => m.round === maxRound - 1);
  semiFinals.forEach((sf) => {
    const loserId =
      sf.team_a_id === sf.winner_id ? sf.team_b_id : sf.team_a_id;
    const loserName =
      sf.team_a_id === sf.winner_id ? sf.team_b_name : sf.team_a_name;
    if (loserId && !finalistIds.has(loserId)) {
      const team = teamMap[loserId];
      placements.push({
        placement: 3,
        teamId: loserId,
        teamName: loserName,
        captainEmail: team?.captain_email,
      });
    }
  });

  return placements.sort((a, b) => a.placement - b.placement);
}

/**
 * Calculate payout amounts for each placement given the prize pool and split config.
 */
export function calculatePayouts(prizePool, placements, split = DEFAULT_PRIZE_SPLIT) {
  return placements.map((p) => {
    const pct = split[p.placement] || 0;
    const amount = Math.round((prizePool * pct) / 100 * 100) / 100;
    return { ...p, percentage: pct, amount };
  });
}

/**
 * Record payouts in PaymentLedger and mark teams as winners.
 * In production this would also trigger Stripe Connect transfers.
 */
export async function recordPayouts({ payouts, tournamentId, tenantId, prizePool, currency = "USD" }) {
  const ledgerEntries = payouts.map((p) => ({
    tenant_id: tenantId,
    type: "debit",
    amount: p.amount,
    currency,
    source: "withdrawal",
    tournament_id: tournamentId,
    team_id: p.teamId,
    status: "completed",
    notes: `Prize payout — ${p.placement === 1 ? "1st" : p.placement === 2 ? "2nd" : "3rd"} place: ${p.teamName} (${p.percentage}% of $${prizePool})`,
    reference: `payout_${tournamentId}_place_${p.placement}`,
  }));

  await maxikay.entities.PaymentLedger.bulkCreate(ledgerEntries);

  // Mark 1st place team as winner
  const champion = payouts.find((p) => p.placement === 1);
  if (champion?.teamId) {
    await maxikay.entities.Team.update(champion.teamId, { status: "winner" });
  }

  // Log to audit
  await maxikay.entities.AuditLog.create({
    action: "prize_payout",
    entity_type: "Tournament",
    entity_id: tournamentId,
    actor_email: "system",
    actor_role: "organizer",
    details: JSON.stringify(payouts.map((p) => ({ place: p.placement, team: p.teamName, amount: p.amount }))),
    tournament_id: tournamentId,
    tenant_id: tenantId,
  });
}