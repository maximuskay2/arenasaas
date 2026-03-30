/**
 * Score Pick'Em predictions after tournament completes; award profile_xp + small USD wallet credit.
 */
const XP_PER_CORRECT = 25;
const WALLET_PER_CORRECT = 0.25;

export async function scorePickEmPredictions(client, tournamentId, tenantId) {
  const tid = String(tournamentId);
  const ten = String(tenantId);

  const { rows: matches } = await client.query(
    `SELECT id::text AS id, winner_id::text AS winner_id FROM matches
     WHERE tournament_id::text = $1
       AND status IN ('completed', 'forfeited', 'no_show')
       AND winner_id IS NOT NULL`,
    [tid]
  );
  const actual = new Map();
  for (const m of matches) {
    if (m.winner_id) actual.set(String(m.id), String(m.winner_id));
  }

  const { rows: preds } = await client.query(
    `SELECT id, user_id, bracket_picks, pickem_settled FROM user_predictions WHERE tournament_id::text = $1 AND tenant_id = $2`,
    [tid, ten]
  );

  for (const p of preds) {
    if (p.pickem_settled) continue;

    const picks = p.bracket_picks && typeof p.bracket_picks === 'object' ? p.bracket_picks : {};
    let correct = 0;
    let total = 0;
    for (const [matchId, pickedWinner] of Object.entries(picks)) {
      const aw = actual.get(String(matchId));
      if (!aw) continue;
      total += 1;
      if (String(pickedWinner || '') === aw) correct += 1;
    }

    const xpGain = correct * XP_PER_CORRECT;
    const cashGain = correct * WALLET_PER_CORRECT;

    await client.query(
      `UPDATE user_predictions SET pickem_score = $1, correct_picks = $2, total_picks_scored = $3, pickem_settled = TRUE, updated_date = NOW() WHERE id = $4`,
      [correct, correct, total, p.id]
    );

    if (xpGain > 0) {
      await client.query(`UPDATE users SET profile_xp = COALESCE(profile_xp, 0) + $1, updated_date = NOW() WHERE id = $2`, [
        xpGain,
        p.user_id,
      ]);
    }

    if (cashGain > 0) {
      await client.query(
        `INSERT INTO user_wallets (user_id, currency, balance)
         VALUES ($1::uuid, 'USD', $2)
         ON CONFLICT (user_id, currency)
         DO UPDATE SET balance = user_wallets.balance + $2, updated_date = NOW()`,
        [p.user_id, cashGain]
      );
    }
  }

  return { scored: preds.length };
}
