import { io } from 'socket.io-client';

let socket;

/**
 * Socket.io must reach the API origin. In Vite dev, same-origin would be :5173 and every
 * Engine.IO poll/ws would go through Vite's proxy — if the API is down, that floods the
 * terminal with "ws proxy error". Hitting the API port directly avoids that; cookies for
 * `localhost` are still sent cross-port.
 */
function socketIoOrigin() {
  const raw = import.meta.env.VITE_API_URL;
  if (raw) return String(raw).replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://127.0.0.1:3001';
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function getArenaSocket() {
  if (socket?.connected) return socket;
  const url = socketIoOrigin();
  const dev = import.meta.env.DEV;
  socket = io(url || undefined, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnectionAttempts: dev ? 12 : Infinity,
    reconnectionDelay: dev ? 2500 : 1000,
  });
  return socket;
}

export function joinTournamentRoom(tournamentId) {
  if (!tournamentId) return;
  getArenaSocket().emit('join-tournament', String(tournamentId));
}

export function leaveTournamentRoom(tournamentId) {
  if (!tournamentId) return;
  getArenaSocket().emit('leave-tournament', String(tournamentId));
}

/** Subscribe to slot count updates for a tournament room (discovery cards). */
export function subscribeTournamentSlots(handler) {
  const s = getArenaSocket();
  s.on('tournament:slots', handler);
  return () => {
    s.off('tournament:slots', handler);
  };
}

/** Bracket / match row updates for a tournament room. */
export function subscribeMatchUpdatesForTournament(tournamentId, handler) {
  if (!tournamentId) return () => {};
  const s = getArenaSocket();
  const wrap = (payload) => {
    const m = payload?.match;
    if (m && String(m.tournament_id) === String(tournamentId)) handler(payload);
  };
  s.on('match:updated', wrap);
  return () => {
    s.off('match:updated', wrap);
  };
}

/** Global live ticker (match went in_progress) — landing page + discovery. */
export function subscribeLiveTicker(handler) {
  const s = getArenaSocket();
  s.on('live:ticker', handler);
  return () => {
    s.off('live:ticker', handler);
  };
}
