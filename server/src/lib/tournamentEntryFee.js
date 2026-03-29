/**
 * Authoritative paid vs free rules for tournaments (hybrid monetization).
 * Legacy rows: missing entry_type → infer from entry_fee.
 */

export function effectiveEntryType(t) {
  const raw = String(t?.entry_type ?? '')
    .trim()
    .toUpperCase();
  if (raw === 'PAID' || raw === 'FREE') return raw;
  return Number(t?.entry_fee || 0) > 0 ? 'PAID' : 'FREE';
}

export function effectiveEntryFee(t) {
  if (effectiveEntryType(t) === 'FREE') return 0;
  return Number(t?.entry_fee || 0);
}

export function tournamentRequiresEntryPayment(t) {
  return effectiveEntryFee(t) > 0;
}
