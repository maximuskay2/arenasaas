/**
 * Shared idempotent match transition (G4) — used by HTTP engine + Redis worker.
 */
export async function applyForfeitTransition(client, params) {
  const {
    idempotencyKey,
    matchId,
    tenantId,
    expectedVersion,
    fromStatus,
    newStatus,
    patch = {},
  } = params;

  const idem = String(idempotencyKey).slice(0, 512);
  const ins = await client.query(
    `INSERT INTO processed_forfeit_jobs (idempotency_key, match_id, tenant_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [idem, String(matchId), String(tenantId)]
  );
  if (!ins.rowCount) {
    return { duplicate: true };
  }

  const patchKeys = Object.keys(patch).filter((k) =>
    ['notes', 'winner_id', 'winner_name', 'score_a', 'score_b'].includes(k)
  );
  const sets = [`"status" = $1`, `"version" = COALESCE(version, 1) + 1`];
  const vals = [String(newStatus)];
  let idx = 2;
  for (const k of patchKeys) {
    sets.push(`"${k}" = $${idx++}`);
    vals.push(patch[k]);
  }
  const ev = Number(expectedVersion);
  vals.push(String(matchId), ev, String(fromStatus), String(tenantId));
  const u = await client.query(
    `UPDATE matches SET ${sets.join(', ')}
     WHERE id = $${idx} AND version = $${idx + 1} AND status = $${idx + 2} AND tenant_id = $${idx + 3}
     RETURNING *`,
    vals
  );
  if (!u.rowCount) {
    await client.query(`DELETE FROM processed_forfeit_jobs WHERE idempotency_key = $1`, [idem]);
    return { conflict: true };
  }
  return { match: u.rows[0] };
}
