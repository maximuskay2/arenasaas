import { runWithRls } from '../rls/transaction.js';
import { effectiveEntryFee, tournamentRequiresEntryPayment } from './tournamentEntryFee.js';

/**
 * When `tournament_id` is present, resolve amount/currency/tenant/description from DB (same rules as Stripe create-checkout-session).
 * @param {import('pg').Pool} pool
 * @param {string} tournamentId
 * @returns {Promise<{ amount: number, currency: string, tenant_id: string, description: string, tournament_id: string }>}
 */
export async function resolvePaidEntryCheckoutFromTournament(pool, tournamentId) {
  const tourId = String(tournamentId || '').trim();
  if (!tourId) {
    const err = new Error('tournament_id required for tournament-scoped checkout');
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
    client.query(
      `SELECT id, tenant_id, name, entry_type, entry_fee, currency FROM tournaments WHERE id::text = $1`,
      [tourId]
    )
  );
  const trow = rows[0];
  if (!trow) {
    const err = new Error('Tournament not found');
    err.statusCode = 404;
    throw err;
  }
  if (!tournamentRequiresEntryPayment(trow)) {
    const err = new Error('Tournament does not require a paid entry');
    err.statusCode = 400;
    err.code = 'not_paid_entry';
    throw err;
  }

  const amount = effectiveEntryFee(trow);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Invalid entry fee for tournament');
    err.statusCode = 400;
    throw err;
  }

  const currency = String(trow.currency || 'USD').toUpperCase().slice(0, 8);
  const tenant_id = String(trow.tenant_id || '').trim();
  const description = (trow.name ? `Entry fee: ${trow.name}` : 'Tournament registration').slice(0, 120);

  return { amount, currency, tenant_id, description, tournament_id: tourId };
}
