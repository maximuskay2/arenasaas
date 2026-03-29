/**
 * Apply platform_config `entry_platform_fee_percent` to gross entry revenue:
 * organizer tenant wallet is credited with (gross − cut); a `platform_fee` ledger row records the cut.
 */

export async function getEntryPlatformFeePercent(client) {
  const { rows } = await client.query(
    `SELECT value FROM platform_config WHERE key = 'entry_platform_fee_percent' LIMIT 1`
  );
  const n = parseFloat(String(rows[0]?.value ?? '0'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}

export function entryFeePlatformCut(grossMajor, percent) {
  if (percent <= 0 || !Number.isFinite(grossMajor) || grossMajor <= 0) return 0;
  const cut = Math.round(((Number(grossMajor) * percent) / 100) * 100) / 100;
  return Math.min(cut, Number(grossMajor));
}

/**
 * Credit tenant wallet with net entry proceeds after platform take.
 * Call only after the matching `entry_fee` row is inserted (same transaction).
 */
export async function creditTenantWalletEntryFeeNet(client, {
  tenantId,
  tournamentId,
  grossMajor,
  currency,
  ledgerReferenceBase,
}) {
  const tid = String(tenantId || '').trim();
  const tourId = String(tournamentId || '').trim();
  const gross = Number(grossMajor);
  if (!tid || !Number.isFinite(gross) || gross <= 0) return { net: 0, cut: 0 };

  const pct = await getEntryPlatformFeePercent(client);
  const cut = entryFeePlatformCut(gross, pct);
  const net = Math.round((gross - cut) * 100) / 100;
  const cur = String(currency || 'USD').toUpperCase().slice(0, 8);
  const refBase = String(ledgerReferenceBase || '').slice(0, 180);

  await client.query(
    `INSERT INTO tenant_wallets (tenant_id, balance, total_earned, currency)
     VALUES ($1, $2, $2, $3)
     ON CONFLICT (tenant_id) DO UPDATE SET
       balance = tenant_wallets.balance + EXCLUDED.balance,
       total_earned = tenant_wallets.total_earned + EXCLUDED.total_earned,
       updated_date = NOW()`,
    [tid, net, cur]
  );

  if (cut >= 0.01) {
    const pfRef = `platform_fee:${refBase || `${tid}:${tourId}`}`.slice(0, 200);
    const dup = await client.query(
      `SELECT id FROM payment_ledger WHERE type = 'platform_fee' AND reference = $1 LIMIT 1`,
      [pfRef]
    );
    if (!dup.rowCount) {
      const cutMinor = Math.round(cut * 100);
      await client.query(
        `INSERT INTO payment_ledger (tenant_id, tournament_id, type, amount, amount_minor, currency, provider, held, reference, description, status)
         VALUES ($1, $2, 'platform_fee', $3, $4, $5, 'platform', FALSE, $6, $7, 'completed')`,
        [
          tid,
          tourId || null,
          cut,
          cutMinor,
          cur,
          pfRef,
          `Platform entry fee share (${pct}% of gross entry)`,
        ]
      );
    }
  }

  return { net, cut, percent: pct };
}
