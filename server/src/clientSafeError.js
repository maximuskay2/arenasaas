/**
 * PostgreSQL (node-postgres) sets `err.code` to a 5-char SQLSTATE. Those messages
 * often include the database name, role, or host — they must not be forwarded
 * to browsers. The full error is still logged with `console.error` upstream.
 */
const PG_SQLSTATE = /^[0-9A-Z]{5}$/;

export function clientSafeErrorMessage(err) {
  if (process.env.NODE_ENV === 'production') {
    return 'Server error';
  }
  const code = err?.code != null ? String(err.code) : '';
  if (PG_SQLSTATE.test(code)) {
    return 'Server error';
  }
  if (typeof err?.message === 'string' && err.message) {
    return err.message;
  }
  return 'Server error';
}
