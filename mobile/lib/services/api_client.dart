import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  final String? code;
  final Map<String, dynamic>? body;
  ApiException(this.status, this.message, {this.code, this.body});
  @override
  String toString() => message;
}

/// Arena API client — mirrors web `arenaClient.js` surface used by mobile hubs.
class ApiClient {
  ApiClient();

  String? _token;
  String? tenantId;
  String? get token => _token;

  Future<void> loadSession() async {
    final p = await SharedPreferences.getInstance();
    _token = p.getString('arena_token');
    tenantId = p.getString('arena_tenant_id');
  }

  Future<void> setToken(String? t) async {
    _token = t;
    final p = await SharedPreferences.getInstance();
    if (t == null || t.isEmpty) {
      await p.remove('arena_token');
    } else {
      await p.setString('arena_token', t);
    }
  }

  Future<void> setTenantId(String? id) async {
    tenantId = id;
    final p = await SharedPreferences.getInstance();
    if (id == null || id.isEmpty) {
      await p.remove('arena_tenant_id');
    } else {
      await p.setString('arena_tenant_id', id);
    }
  }

  Uri _u(String path, [Map<String, String>? query]) {
    final base = AppConfig.apiBase.replaceAll(RegExp(r'/$'), '');
    final pth = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$pth').replace(queryParameters: query);
  }

  Map<String, String> _headers({Map<String, String>? extra, bool jsonBody = true}) {
    final h = <String, String>{
      'Accept': 'application/json',
      if (jsonBody) 'Content-Type': 'application/json',
    };
    if (_token != null && _token!.isNotEmpty) h['Authorization'] = 'Bearer $_token';
    if (tenantId != null && tenantId!.isNotEmpty) h['X-Tenant-ID'] = tenantId!;
    if (extra != null) h.addAll(extra);
    return h;
  }

  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
    Map<String, String>? headers,
  }) async {
    final uri = _u(path, query);
    final h = _headers(extra: headers);
    late http.Response res;
    final encoded = body == null ? null : jsonEncode(body);
    switch (method.toUpperCase()) {
      case 'GET':
        res = await http.get(uri, headers: h);
        break;
      case 'POST':
        res = await http.post(uri, headers: h, body: encoded);
        break;
      case 'PATCH':
        res = await http.patch(uri, headers: h, body: encoded);
        break;
      case 'PUT':
        res = await http.put(uri, headers: h, body: encoded);
        break;
      case 'DELETE':
        res = await http.delete(uri, headers: h, body: encoded);
        break;
      default:
        throw ApiException(0, 'Unsupported method $method');
    }
    if (res.statusCode == 204) return null;
    dynamic data;
    try {
      data = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {
      data = res.body;
    }
    if (res.statusCode >= 400) {
      final msg = data is Map && data['error'] != null
          ? data['error'].toString()
          : 'Request failed (${res.statusCode})';
      throw ApiException(
        res.statusCode,
        msg,
        code: data is Map ? data['code']?.toString() : null,
        body: data is Map ? Map<String, dynamic>.from(data) : null,
      );
    }
    return data;
  }

  List<dynamic> _asList(dynamic data, [String? key]) {
    if (data is List) return data;
    if (data is Map) {
      if (key != null && data[key] is List) return data[key] as List;
      for (final k in ['items', 'data', 'rows', 'results', 'tournaments', 'matches', 'teams', 'posts']) {
        if (data[k] is List) return data[k] as List;
      }
    }
    return [];
  }

  Map<String, dynamic> _asMap(dynamic data) =>
      data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};

  // ─── Auth ───────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await request('POST', '/api/auth/login', body: {
      'email': email.trim().toLowerCase(),
      'password': password,
    });
    final map = _asMap(data);
    final t = map['token']?.toString();
    if (t != null && t.isNotEmpty) await setToken(t);
    return map;
  }

  Future<Map<String, dynamic>> register(String email, String password, {String? fullName}) async {
    final data = await request('POST', '/api/auth/register', body: {
      'email': email.trim().toLowerCase(),
      'password': password,
      if (fullName != null && fullName.isNotEmpty) 'full_name': fullName,
    });
    final map = _asMap(data);
    final t = map['token']?.toString();
    if (t != null && t.isNotEmpty) await setToken(t);
    return map;
  }

  Future<Map<String, dynamic>?> me() async {
    if (_token == null) return null;
    try {
      return _asMap(await request('GET', '/api/auth/me'));
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> patchMe(Map<String, dynamic> body) async =>
      _asMap(await request('PATCH', '/api/auth/me', body: body));

  Future<List<dynamic>> myWallet() async =>
      _asList(await request('GET', '/api/auth/me/wallet'), 'wallets');

  Future<List<dynamic>> myAccolades() async =>
      _asList(await request('GET', '/api/auth/me/accolades'), 'accolades');

  Future<List<dynamic>> myMatches({int limit = 50}) async =>
      _asList(await request('GET', '/api/auth/me/matches', query: {'limit': '$limit'}), 'matches');

  Future<List<dynamic>> myTeams() async =>
      _asList(await request('GET', '/api/auth/me/teams'), 'teams');

  Future<Map<String, dynamic>> myHub() async =>
      _asMap(await request('GET', '/api/auth/me/hub'));

  Future<List<dynamic>> myWatchlist() async =>
      _asList(await request('GET', '/api/auth/me/watchlist'), 'watchlist');

  Future<void> watchlistAdd(String tournamentId) async =>
      request('POST', '/api/auth/me/watchlist/$tournamentId');

  Future<void> watchlistRemove(String tournamentId) async =>
      request('DELETE', '/api/auth/me/watchlist/$tournamentId');

  Future<Map<String, dynamic>> prizePayoutKyc() async =>
      _asMap(await request('GET', '/api/auth/me/prize-payout-kyc'));

  Future<Map<String, dynamic>> withdrawalRequest(Map<String, dynamic> body) async =>
      _asMap(await request('POST', '/api/auth/me/withdrawal-request', body: body));

  Future<void> logout() async {
    try {
      await request('POST', '/api/auth/logout');
    } catch (_) {}
    await setToken(null);
  }

  // ─── Public / discovery ──────────────────────────────────
  Future<Map<String, dynamic>> catalog({
    int page = 1,
    int limit = 20,
    String? q,
    String? status,
    String? game,
  }) async {
    final query = <String, String>{'page': '$page', 'limit': '$limit'};
    if (q != null && q.isNotEmpty) query['q'] = q;
    if (status != null && status.isNotEmpty) query['status'] = status;
    if (game != null && game.isNotEmpty) query['game'] = game;
    return _asMap(await request('GET', '/api/public/tournaments', query: query));
  }

  Future<Map<String, dynamic>> discoveryDashboard() async =>
      _asMap(await request('GET', '/api/public/discovery/dashboard'));

  Future<Map<String, dynamic>> publicTournament(String id) async {
    try {
      return _asMap(await request('GET', '/api/public/tournament/$id'));
    } catch (_) {
      return tournament(id);
    }
  }

  Future<List<dynamic>> publicTournamentTeams(String id) async =>
      _asList(await request('GET', '/api/public/tournament/$id/teams'), 'teams');

  Future<List<dynamic>> publicTournamentMatches(String id) async =>
      _asList(await request('GET', '/api/public/tournament/$id/matches'), 'matches');

  Future<List<dynamic>> liveMatches({int limit = 30}) async =>
      _asList(await request('GET', '/api/public/live-matches', query: {'limit': '$limit'}), 'matches');

  Future<Map<String, dynamic>> matchWatch(String matchId) async =>
      _asMap(await request('GET', '/api/public/match/$matchId/watch'));

  Future<Map<String, dynamic>> powerRankings({String kind = 'team', int limit = 50}) async =>
      _asMap(await request('GET', '/api/public/power-rankings', query: {
        'kind': kind,
        'limit': '$limit',
      }));

  Future<Map<String, dynamic>> playerCareer(String email) async =>
      _asMap(await request('GET', '/api/public/player-career', query: {'email': email}));

  Future<Map<String, dynamic>> teamProfile(String id) async =>
      _asMap(await request('GET', '/api/public/team/$id'));

  Future<Map<String, dynamic>> opsBoard(String tenantId) async =>
      _asMap(await request('GET', '/api/public/ops-board', query: {'tenant_id': tenantId}));

  Future<List<dynamic>> publicCommunityPosts({String? tenantId}) async {
    final q = <String, String>{};
    if (tenantId != null) q['tenant_id'] = tenantId;
    return _asList(await request('GET', '/api/public/community/posts', query: q.isEmpty ? null : q), 'posts');
  }

  // ─── CRUD entities ───────────────────────────────────────
  Future<Map<String, dynamic>> tournament(String id) async =>
      _asMap(await request('GET', '/api/v1/Tournament/$id'));

  Future<List<dynamic>> listEntities(String entity, {Map<String, String>? query}) async =>
      _asList(await request('GET', '/api/v1/$entity', query: query ?? {'limit': '100'}));

  Future<Map<String, dynamic>> createEntity(String entity, Map<String, dynamic> body) async =>
      _asMap(await request('POST', '/api/v1/$entity', body: body));

  Future<Map<String, dynamic>> patchEntity(String entity, String id, Map<String, dynamic> body) async =>
      _asMap(await request('PATCH', '/api/v1/$entity/$id', body: body));

  Future<void> deleteEntity(String entity, String id) async =>
      request('DELETE', '/api/v1/$entity/$id');

  Future<List<dynamic>> listGameTemplates() async => listEntities('GameTemplate');

  Future<List<dynamic>> listTournaments({String? status}) async {
    final q = <String, String>{'limit': '100'};
    if (status != null) q['status'] = status;
    return listEntities('Tournament', query: q);
  }

  Future<List<dynamic>> listTeams({String? tournamentId}) async {
    final q = <String, String>{'limit': '100'};
    if (tournamentId != null) q['tournament_id'] = tournamentId;
    return listEntities('Team', query: q);
  }

  Future<List<dynamic>> listMatches({String? tournamentId, String? status}) async {
    final q = <String, String>{'limit': '100'};
    if (tournamentId != null) q['tournament_id'] = tournamentId;
    if (status != null) q['status'] = status;
    return listEntities('Match', query: q);
  }

  Future<Map<String, dynamic>> getMatch(String id) async =>
      _asMap(await request('GET', '/api/v1/Match/$id'));

  Future<Map<String, dynamic>> patchMatch(String id, Map<String, dynamic> body) async =>
      patchEntity('Match', id, body);

  Future<Map<String, dynamic>> createTournament(Map<String, dynamic> body) async =>
      createEntity('Tournament', body);

  Future<Map<String, dynamic>> updateTournament(String id, Map<String, dynamic> body) async =>
      patchEntity('Tournament', id, body);

  // ─── Join / payments ─────────────────────────────────────
  Future<Map<String, dynamic>> joinTournament(
    String id, {
    required String mode,
    String? teamName,
    String? tag,
    String? gameId,
    List<Map<String, dynamic>>? roster,
    Map<String, dynamic>? paymentProof,
    String? idempotencyKey,
    String? region,
  }) async {
    final body = <String, dynamic>{
      'mode': mode,
      if (teamName != null) 'team_name': teamName,
      if (tag != null) 'tag': tag,
      if (gameId != null) 'captain_game_id': gameId,
      if (roster != null) 'roster': roster,
      if (paymentProof != null) 'payment_proof': paymentProof,
      if (region != null) 'region': region,
    };
    return _asMap(await request(
      'POST',
      '/api/tournaments/$id/join',
      body: body,
      headers: {
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
      },
    ));
  }

  Future<Map<String, dynamic>> devSimulateEntry(String tournamentId) async =>
      _asMap(await request('POST', '/api/payments/dev-simulate-entry', body: {
        'tournament_id': tournamentId,
      }));

  Future<Map<String, dynamic>> createStripeCheckout({required String tournamentId}) async =>
      _asMap(await request('POST', '/api/payments/create-checkout-session', body: {
        'tournament_id': tournamentId,
      }));

  Future<Map<String, dynamic>> paystackInitialize({required String tournamentId}) async =>
      _asMap(await request('POST', '/api/paystack/initialize', body: {
        'tournament_id': tournamentId,
      }));

  Future<Map<String, dynamic>> flutterwaveInitialize({required String tournamentId}) async =>
      _asMap(await request('POST', '/api/flutterwave/initialize', body: {
        'tournament_id': tournamentId,
      }));

  Future<Map<String, dynamic>> verifyEntryReference(Map<String, dynamic> body) async =>
      _asMap(await request('POST', '/api/payments/verify-entry-reference', body: body));

  // ─── Match engine ────────────────────────────────────────
  Future<Map<String, dynamic>> reportResult(
    String matchId, {
    required int scoreA,
    required int scoreB,
    String? povLink,
    String? notes,
  }) async =>
      _asMap(await request('POST', '/api/match-engine/matches/$matchId/report-result', body: {
        'score_a': scoreA,
        'score_b': scoreB,
        if (povLink != null && povLink.isNotEmpty) 'pov_link': povLink,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      }));

  Future<List<dynamic>> listMatchReports(String matchId) async =>
      _asList(await request('GET', '/api/match-engine/matches/$matchId/reports'), 'reports');

  Future<List<dynamic>> listDisputes() async =>
      _asList(await request('GET', '/api/match-engine/disputes'), 'disputes');

  Future<Map<String, dynamic>> resolveDispute(String matchId, Map<String, dynamic> body) async =>
      _asMap(await request('PATCH', '/api/match-engine/matches/$matchId/resolve-dispute', body: body));

  Future<Map<String, dynamic>> finalizeTournament(String id, {bool override = false}) async =>
      _asMap(await request('POST', '/api/match-engine/tournaments/$id/finalize', body: {
        if (override) 'finalize_override': true,
      }));

  Future<Map<String, dynamic>> finalizeStatus(String id) async =>
      _asMap(await request('GET', '/api/match-engine/tournaments/$id/finalize-status'));

  Future<Map<String, dynamic>> getPickem(String tournamentId, {String? tenantOverride}) async {
    final headers = <String, String>{};
    if (tenantOverride != null) headers['X-Tenant-ID'] = tenantOverride;
    return _asMap(await request(
      'GET',
      '/api/match-engine/tournaments/$tournamentId/pickem',
      headers: headers.isEmpty ? null : headers,
    ));
  }

  Future<Map<String, dynamic>> putPickem(
    String tournamentId,
    Map<String, dynamic> bracketPicks, {
    String? tenantOverride,
  }) async {
    final headers = <String, String>{};
    if (tenantOverride != null) headers['X-Tenant-ID'] = tenantOverride;
    return _asMap(await request(
      'PUT',
      '/api/match-engine/tournaments/$tournamentId/pickem',
      body: {'bracket_picks': bracketPicks},
      headers: headers.isEmpty ? null : headers,
    ));
  }

  // ─── Community ───────────────────────────────────────────
  Future<List<dynamic>> communityPosts({String? scope}) async {
    final q = <String, String>{};
    if (scope != null) q['scope'] = scope;
    return _asList(
      await request('GET', '/api/community/posts', query: q.isEmpty ? null : q),
      'posts',
    );
  }

  Future<Map<String, dynamic>> createCommunityPost(Map<String, dynamic> body) async =>
      _asMap(await request('POST', '/api/community/posts', body: body));

  Future<void> likePost(String id) async => request('POST', '/api/community/posts/$id/like');

  Future<void> unlikePost(String id) async => request('DELETE', '/api/community/posts/$id/like');

  Future<List<dynamic>> postComments(String postId) async =>
      _asList(await request('GET', '/api/community/posts/$postId/comments'), 'comments');

  Future<Map<String, dynamic>> createComment(String postId, String content) async =>
      _asMap(await request('POST', '/api/community/posts/$postId/comments', body: {
        'content': content,
      }));

  // ─── Streams ─────────────────────────────────────────────
  Future<List<dynamic>> listStreams(String tournamentId) async =>
      _asList(await request('GET', '/api/tournaments/$tournamentId/streams'), 'streams');

  Future<Map<String, dynamic>> addStream(String tournamentId, Map<String, dynamic> body) async =>
      _asMap(await request('POST', '/api/tournaments/$tournamentId/streams', body: body));

  Future<void> deleteStream(String streamId) async => request('DELETE', '/api/streams/$streamId');

  // ─── Free agents ─────────────────────────────────────────
  Future<List<dynamic>> listFreeAgents() async => listEntities('FreeAgent');

  Future<Map<String, dynamic>> createFreeAgent(Map<String, dynamic> body) async =>
      createEntity('FreeAgent', body);

  // ─── Notifications ───────────────────────────────────────
  Future<void> registerFcmToken(String token, {String platform = 'mobile'}) async =>
      request('POST', '/api/notifications/fcm/register', body: {
        'token': token,
        'platform': platform,
      });

  Future<List<dynamic>> listNotifications({int limit = 50}) async {
    try {
      return _asList(await request('GET', '/api/v1/Notification', query: {'limit': '$limit'}), 'items');
    } catch (_) {
      return _asList(await request('GET', '/api/v1/Notification', query: {'limit': '$limit'}));
    }
  }

  Future<void> markNotificationRead(String id) async {
    try {
      await patchEntity('Notification', id, {'read': true, 'is_read': true});
    } catch (_) {}
  }

  // ─── Tenant registration ─────────────────────────────────
  Future<Map<String, dynamic>> registerTenant(Map<String, dynamic> body) async =>
      _asMap(await request('POST', '/api/tenant-registration', body: body));

  // ─── Match evidence (multipart) ──────────────────────────
  Future<Map<String, dynamic>> uploadMatchEvidence(String matchId, List<String> filePaths) async {
    final uri = _u('/api/match-engine/matches/$matchId/evidence');
    final req = http.MultipartRequest('POST', uri);
    final h = _headers(jsonBody: false);
    h.remove('Content-Type');
    req.headers.addAll(h);
    for (final path in filePaths.take(8)) {
      req.files.add(await http.MultipartFile.fromPath('screenshots', path));
    }
    final streamed = await req.send();
    final res = await http.Response.fromStream(streamed);
    dynamic data;
    try {
      data = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {
      data = res.body;
    }
    if (res.statusCode >= 400) {
      throw ApiException(res.statusCode, data is Map ? (data['error']?.toString() ?? 'Upload failed') : 'Upload failed');
    }
    return _asMap(data);
  }

  Future<Map<String, dynamic>> sendLobbyChat(String matchId, String content, {String? tournamentId}) async {
    return createEntity('ChatMessage', {
      'match_id': matchId,
      if (tournamentId != null) 'tournament_id': tournamentId,
      'content': content,
      'message': content,
      'body': content,
    });
  }

  Future<List<dynamic>> listLobbyChat(String matchId) async {
    return listEntities('ChatMessage', query: {'match_id': matchId, 'limit': '100'});
  }

  // ─── Game taxonomy ───────────────────────────────────────
  Future<List<dynamic>> taxonomyPlatforms() async =>
      _asList(await request('GET', '/api/public/game-taxonomy/platforms'));

  Future<List<dynamic>> taxonomyGenres({String? platformId}) async {
    final q = <String, String>{};
    if (platformId != null) q['platform_id'] = platformId;
    return _asList(await request('GET', '/api/public/game-taxonomy/genres', query: q.isEmpty ? null : q));
  }

  Future<List<dynamic>> taxonomyTitles({String? platformId, String? genreId}) async {
    final q = <String, String>{};
    if (platformId != null) q['platform_id'] = platformId;
    if (genreId != null) q['genre_id'] = genreId;
    return _asList(await request('GET', '/api/public/game-taxonomy/titles', query: q.isEmpty ? null : q));
  }

  Future<Map<String, dynamic>> publicPricing() async =>
      _asMap(await request('GET', '/api/public/pricing'));

  Future<Map<String, dynamic>> stripeConnectStatus() async =>
      _asMap(await request('GET', '/api/payments/stripe-connect-status'));

  Future<List<dynamic>> listAuditLogs({int limit = 50}) async =>
      listEntities('AuditLog', query: {'limit': '$limit'});

  Future<Map<String, dynamic>> patchTeam(String id, Map<String, dynamic> body) async =>
      patchEntity('Team', id, body);

  Future<void> deleteTeam(String id) async => deleteEntity('Team', id);

  Future<Map<String, dynamic>> patchFreeAgent(String id, Map<String, dynamic> body) async =>
      patchEntity('FreeAgent', id, body);

  Future<void> deleteFreeAgent(String id) async => deleteEntity('FreeAgent', id);

  Future<void> deleteCommunityPost(String id) async =>
      request('DELETE', '/api/community/posts/$id');

  Future<void> pinCommunityPost(String id, bool pinned) async =>
      request('PATCH', '/api/community/posts/$id/pin', body: {'pinned': pinned});

  Future<Map<String, dynamic>> publicTeam(String id) async =>
      _asMap(await request('GET', '/api/public/team/$id'));

  Future<Map<String, dynamic>> uploadFile(List<int> bytes, String filename) async {
    final uri = _u('/api/integrations/upload');
    final req = http.MultipartRequest('POST', uri);
    final h = _headers(jsonBody: false);
    h.remove('Content-Type');
    req.headers.addAll(h);
    req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    final streamed = await req.send();
    final res = await http.Response.fromStream(streamed);
    dynamic data;
    try {
      data = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {
      data = {'file_url': null};
    }
    if (res.statusCode >= 400) {
      throw ApiException(res.statusCode, data is Map ? (data['error']?.toString() ?? 'Upload failed') : 'Upload failed');
    }
    return _asMap(data);
  }
}
