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

/** Join Socket.io rooms for community feed (global platform + optional tenant). */
export function joinCommunityFeedRooms({ global: g, tenantId } = {}) {
  const s = getArenaSocket();
  if (g) s.emit('join-feed', { scope: 'global' });
  if (tenantId) s.emit('join-feed', { tenantId: String(tenantId) });
}

export function leaveCommunityFeedRooms({ global: g, tenantId } = {}) {
  const s = getArenaSocket();
  if (g) s.emit('leave-feed', { scope: 'global' });
  if (tenantId) s.emit('leave-feed', { tenantId: String(tenantId) });
}

/**
 * Subscribe to community feed events. Handlers receive (payload, meta).
 * meta.event is one of: community:post | community:post-removed | community:post-updated | community:like | community:comment | community:comment-removed
 */
export function subscribeCommunityFeed(handler) {
  const s = getArenaSocket();
  const events = [
    'community:post',
    'community:post-removed',
    'community:post-updated',
    'community:like',
    'community:comment',
    'community:comment-removed',
  ];
  const wrapped = {};
  for (const ev of events) {
    wrapped[ev] = (payload) => handler(payload, { event: ev });
    s.on(ev, wrapped[ev]);
  }
  return () => {
    for (const ev of events) {
      s.off(ev, wrapped[ev]);
    }
  };
}

/**
 * Match lobby chat scoping (high-speed “war room”).
 * Room: `match:lobby:{matchId}` with event `match:lobby:message`.
 */
export function joinMatchLobbyRoom(matchId) {
  if (!matchId) return;
  getArenaSocket().emit('join-match-lobby', String(matchId));
}

export function leaveMatchLobbyRoom(matchId) {
  if (!matchId) return;
  getArenaSocket().emit('leave-match-lobby', String(matchId));
}

export function joinMatchLiveRoom(matchId) {
  if (!matchId) return;
  getArenaSocket().emit('join-match-live', String(matchId));
}

export function leaveMatchLiveRoom(matchId) {
  if (!matchId) return;
  getArenaSocket().emit('leave-match-live', String(matchId));
}

export function subscribeMatchLiveFeed(handler) {
  const s = getArenaSocket();
  s.on('match:live:feed', handler);
  return () => s.off('match:live:feed', handler);
}

export function subscribeMatchLobbyChat(matchId, handler) {
  const s = getArenaSocket();
  if (!matchId || typeof handler !== 'function') return () => {};

  const mid = String(matchId);
  const wrapped = (payload) => {
    if (payload?.match_id != null && String(payload.match_id) === mid) handler(payload);
  };
  s.on('match:lobby:message', wrapped);
  return () => s.off('match:lobby:message', wrapped);
}
