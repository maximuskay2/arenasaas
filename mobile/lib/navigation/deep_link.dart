import 'package:flutter/material.dart';
import '../screens/create_tournament_screen.dart';
import '../screens/match_center_screen.dart';
import '../screens/match_lobby_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/tournament_detail_screen.dart';

/// Shared deep-link / FCM / notification payload routing.
class DeepLink {
  DeepLink._();

  /// Resolve a URI string or path into a page, or null if unknown.
  static Widget? pageForUri(Uri uri) {
    // arenasaas://tournament/:id
    if (uri.scheme == 'arenasaas') {
      final host = uri.host;
      final first = uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '';
      if (host == 'tournament' && first.isNotEmpty) {
        return TournamentDetailScreen(tournamentId: first);
      }
      if (host == 'match' && first.isNotEmpty) {
        final live = uri.pathSegments.length >= 2 && uri.pathSegments[1] == 'lobby'
            ? false
            : uri.queryParameters['view'] != 'lobby';
        if (uri.pathSegments.length >= 2 && uri.pathSegments[1] == 'lobby') {
          return MatchLobbyScreen(matchId: first);
        }
        return live ? MatchCenterScreen(matchId: first) : MatchLobbyScreen(matchId: first);
      }
      if (host == 'create') return const CreateTournamentScreen();
      if (host == 'notifications') return const NotificationsScreen();
      return null;
    }

    final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (segs.length >= 2 && (segs[0] == 'tournaments' || segs[0] == 'tournament')) {
      return TournamentDetailScreen(tournamentId: segs[1]);
    }
    if (segs.length >= 2 && segs[0] == 'matches') {
      final id = segs[1];
      if (segs.length >= 3 && segs[2] == 'live') return MatchCenterScreen(matchId: id);
      if (segs.length >= 3 && segs[2] == 'lobby') return MatchLobbyScreen(matchId: id);
      return MatchLobbyScreen(matchId: id);
    }
    if (segs.isNotEmpty && segs[0] == 'create') return const CreateTournamentScreen();
    if (segs.isNotEmpty && segs[0] == 'notifications') return const NotificationsScreen();
    return null;
  }

  static Route<dynamic>? routeForSettings(RouteSettings settings) {
    final name = settings.name ?? '';
    if (name.isEmpty) return null;
    final uri = Uri.tryParse(name);
    if (uri == null) return null;
    final page = pageForUri(uri);
    if (page == null) return null;
    return MaterialPageRoute(builder: (_) => page, settings: settings);
  }

  /// FCM / inbox payload keys: deep_link, route, match_id, tournament_id, type.
  static Widget? pageForPayload(Map<String, dynamic> data) {
    final link = data['deep_link']?.toString() ??
        data['route']?.toString() ??
        data['url']?.toString() ??
        '';
    if (link.isNotEmpty) {
      final uri = Uri.tryParse(link);
      if (uri != null) {
        final p = pageForUri(uri);
        if (p != null) return p;
      }
    }
    final matchId = data['match_id']?.toString() ?? data['matchId']?.toString() ?? '';
    if (matchId.isNotEmpty) {
      final view = data['view']?.toString() ?? data['screen']?.toString() ?? 'live';
      if (view == 'lobby') return MatchLobbyScreen(matchId: matchId);
      return MatchCenterScreen(matchId: matchId);
    }
    final tid = data['tournament_id']?.toString() ?? data['tournamentId']?.toString() ?? '';
    if (tid.isNotEmpty) return TournamentDetailScreen(tournamentId: tid);
    final type = data['type']?.toString() ?? '';
    if (type.contains('notification') || type == 'inbox') {
      return const NotificationsScreen();
    }
    return null;
  }

  static void open(BuildContext context, Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  static void openUri(BuildContext context, Uri uri) {
    final page = pageForUri(uri);
    if (page != null) open(context, page);
  }

  static void openPayload(BuildContext context, Map<String, dynamic> data) {
    final page = pageForPayload(data);
    if (page != null) open(context, page);
  }
}
