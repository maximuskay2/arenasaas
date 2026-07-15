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

class ApiClient {
  ApiClient();

  String? _token;
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

  Uri _u(String path, [Map<String, String>? query]) {
    final base = AppConfig.apiBase.replaceAll(RegExp(r'/$'), '');
    final p = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$p').replace(queryParameters: query);
  }

  Map<String, String> _headers({Map<String, String>? extra, bool jsonBody = true}) {
    final h = <String, String>{
      'Accept': 'application/json',
      if (jsonBody) 'Content-Type': 'application/json',
    };
    if (_token != null && _token!.isNotEmpty) {
      h['Authorization'] = 'Bearer $_token';
    }
    if (tenantId != null && tenantId!.isNotEmpty) {
      h['X-Tenant-ID'] = tenantId!;
    }
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
    switch (method.toUpperCase()) {
      case 'GET':
        res = await http.get(uri, headers: h);
        break;
      case 'POST':
        res = await http.post(uri, headers: h, body: body == null ? null : jsonEncode(body));
        break;
      case 'PATCH':
        res = await http.patch(uri, headers: h, body: body == null ? null : jsonEncode(body));
        break;
      case 'PUT':
        res = await http.put(uri, headers: h, body: body == null ? null : jsonEncode(body));
        break;
      case 'DELETE':
        res = await http.delete(uri, headers: h);
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
      final code = data is Map ? data['code']?.toString() : null;
      throw ApiException(
        res.statusCode,
        msg,
        code: code,
        body: data is Map ? Map<String, dynamic>.from(data) : null,
      );
    }
    return data;
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final data = await request('POST', '/api/auth/login', body: {
      'email': email.trim().toLowerCase(),
      'password': password,
    });
    final map = Map<String, dynamic>.from(data as Map);
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
    final map = Map<String, dynamic>.from(data as Map);
    final t = map['token']?.toString();
    if (t != null && t.isNotEmpty) await setToken(t);
    return map;
  }

  Future<Map<String, dynamic>?> me() async {
    if (_token == null) return null;
    try {
      final data = await request('GET', '/api/auth/me');
      if (data is Map) return Map<String, dynamic>.from(data);
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> catalog({
    int page = 1,
    int limit = 20,
    String? q,
    String? status,
  }) async {
    final query = <String, String>{
      'page': '$page',
      'limit': '$limit',
    };
    if (q != null && q.isNotEmpty) query['q'] = q;
    if (status != null && status.isNotEmpty) query['status'] = status;
    final data = await request('GET', '/api/public/tournaments', query: query);
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> tournament(String id) async {
    final data = await request('GET', '/api/v1/Tournament/$id');
    if (data is Map) return Map<String, dynamic>.from(data);
    throw ApiException(404, 'Tournament not found');
  }

  String? tenantId;

  Future<void> loadTenant() async {
    final p = await SharedPreferences.getInstance();
    tenantId = p.getString('arena_tenant_id');
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

  Map<String, String> authHeaders({Map<String, String>? extra}) {
    final h = <String, String>{};
    if (tenantId != null && tenantId!.isNotEmpty) {
      h['X-Tenant-ID'] = tenantId!;
    }
    if (extra != null) h.addAll(extra);
    return h;
  }

  Future<Map<String, dynamic>> joinTournament(
    String id, {
    required String mode,
    String? teamName,
    String? tag,
    String? gameId,
    List<Map<String, dynamic>>? roster,
    Map<String, dynamic>? paymentProof,
    String? paymentMethod,
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
      if (paymentMethod != null) 'payment_method': paymentMethod,
      if (region != null) 'region': region,
    };
    final headers = <String, String>{
      ...authHeaders(),
      if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
    };
    final data = await request(
      'POST',
      '/api/tournaments/$id/join',
      body: body,
      headers: headers,
    );
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<List<dynamic>> listGameTemplates() async {
    final data = await request(
      'GET',
      '/api/v1/GameTemplate',
      headers: authHeaders(),
      query: {'limit': '100'},
    );
    if (data is List) return data;
    if (data is Map && data['items'] is List) return data['items'] as List;
    if (data is Map && data['data'] is List) return data['data'] as List;
    return [];
  }

  Future<Map<String, dynamic>> createTournament(Map<String, dynamic> body) async {
    final data = await request(
      'POST',
      '/api/v1/Tournament',
      body: body,
      headers: authHeaders(),
    );
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> updateTournament(String id, Map<String, dynamic> body) async {
    final data = await request(
      'PATCH',
      '/api/v1/Tournament/$id',
      body: body,
      headers: authHeaders(),
    );
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  /// Dev-only: create completed entry_fee ledger without real keys.
  Future<Map<String, dynamic>> devSimulateEntry(String tournamentId) async {
    final data = await request('POST', '/api/payments/dev-simulate-entry', body: {
      'tournament_id': tournamentId,
    });
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> createStripeCheckout({
    required String tournamentId,
    String? successUrl,
    String? cancelUrl,
  }) async {
    final data = await request('POST', '/api/payments/create-checkout-session', body: {
      'tournament_id': tournamentId,
      if (successUrl != null) 'success_url': successUrl,
      if (cancelUrl != null) 'cancel_url': cancelUrl,
    });
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> paystackInitialize({
    required String tournamentId,
    String? callbackUrl,
  }) async {
    final data = await request('POST', '/api/paystack/initialize', body: {
      'tournament_id': tournamentId,
      if (callbackUrl != null) 'callback_url': callbackUrl,
    });
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> flutterwaveInitialize({
    required String tournamentId,
    String? redirectUrl,
  }) async {
    final data = await request('POST', '/api/flutterwave/initialize', body: {
      'tournament_id': tournamentId,
      if (redirectUrl != null) 'redirect_url': redirectUrl,
    });
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> powerRankings({String kind = 'team', int limit = 50}) async {
    final data = await request('GET', '/api/public/power-rankings', query: {
      'kind': kind,
      'limit': '$limit',
    });
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> matchWatch(String matchId) async {
    final data = await request('GET', '/api/public/match/$matchId/watch');
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<List<dynamic>> liveMatches({int limit = 20}) async {
    final data = await request('GET', '/api/public/live-matches', query: {'limit': '$limit'});
    if (data is Map && data['matches'] is List) return data['matches'] as List;
    if (data is List) return data;
    return [];
  }

  Future<List<dynamic>> myMatches({int limit = 50}) async {
    final data = await request('GET', '/api/auth/me/matches', query: {'limit': '$limit'});
    if (data is Map && data['matches'] is List) return data['matches'] as List;
    return [];
  }

  Future<List<dynamic>> myWallet() async {
    final data = await request('GET', '/api/auth/me/wallet');
    if (data is Map && data['wallets'] is List) return data['wallets'] as List;
    return [];
  }

  Future<List<dynamic>> myAccolades() async {
    final data = await request('GET', '/api/auth/me/accolades');
    if (data is Map && data['accolades'] is List) return data['accolades'] as List;
    return [];
  }

  Future<Map<String, dynamic>> myHub() async {
    final data = await request('GET', '/api/auth/me/hub');
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<Map<String, dynamic>> reportResult(
    String matchId, {
    required int scoreA,
    required int scoreB,
    String? povLink,
    String? notes,
  }) async {
    final data = await request('POST', '/api/match-engine/matches/$matchId/report-result', body: {
      'score_a': scoreA,
      'score_b': scoreB,
      if (povLink != null && povLink.isNotEmpty) 'pov_link': povLink,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    return Map<String, dynamic>.from(data as Map? ?? {});
  }

  Future<void> registerFcmToken(String token, {String platform = 'mobile'}) async {
    await request('POST', '/api/notifications/fcm/register', body: {
      'token': token,
      'platform': platform,
    });
  }

  Future<void> logout() async {
    try {
      await request('POST', '/api/auth/logout');
    } catch (_) {}
    await setToken(null);
  }
}
