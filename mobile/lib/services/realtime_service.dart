import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config.dart';

/// Socket.io client mirroring web `realtimeClient.js`.
class RealtimeService {
  io.Socket? _socket;

  io.Socket get socket {
    if (_socket != null) return _socket!;
    final base = AppConfig.apiBase.replaceAll(RegExp(r'/$'), '');
    _socket = io.io(
      base,
      io.OptionBuilder()
          .setPath('/socket.io/')
          .setTransports(['websocket', 'polling'])
          .enableReconnection()
          .setReconnectionAttempts(20)
          .setReconnectionDelay(1500)
          .build(),
    );
    _socket!.onConnect((_) => debugPrint('[socket] connected'));
    _socket!.onDisconnect((_) => debugPrint('[socket] disconnected'));
    _socket!.onConnectError((e) => debugPrint('[socket] connect error $e'));
    return _socket!;
  }

  void ensureConnected() {
    final s = socket;
    if (!s.connected) s.connect();
  }

  void joinMatchLive(String matchId) {
    ensureConnected();
    socket.emit('join-match-live', matchId);
  }

  void leaveMatchLive(String matchId) {
    socket.emit('leave-match-live', matchId);
  }

  void joinMatchLobby(String matchId) {
    ensureConnected();
    socket.emit('join-match-lobby', matchId);
  }

  void leaveMatchLobby(String matchId) {
    socket.emit('leave-match-lobby', matchId);
  }

  void joinTournament(String tournamentId) {
    ensureConnected();
    socket.emit('join-tournament', tournamentId);
  }

  void leaveTournament(String tournamentId) {
    socket.emit('leave-tournament', tournamentId);
  }

  void joinFeed({bool global = true, String? tenantId}) {
    ensureConnected();
    if (global) socket.emit('join-feed', {'scope': 'global'});
    if (tenantId != null && tenantId.isNotEmpty) {
      socket.emit('join-feed', {'tenantId': tenantId});
    }
  }

  /// Register a socket listener. Call [SocketSub.cancel] on dispose.
  SocketSub on(String event, void Function(dynamic) handler) {
    ensureConnected();
    void listener(dynamic data) => handler(data);
    socket.on(event, listener);
    return SocketSub(socket, event, listener);
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}

/// Lightweight cancel handle for socket event listeners (not a StreamSubscription).
class SocketSub {
  SocketSub(this._socket, this._event, this._listener);
  final io.Socket _socket;
  final String _event;
  final void Function(dynamic) _listener;
  bool _cancelled = false;

  Future<void> cancel() async {
    if (_cancelled) return;
    _cancelled = true;
    _socket.off(_event, _listener);
  }
}
