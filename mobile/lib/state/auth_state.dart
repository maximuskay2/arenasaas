import 'package:flutter/foundation.dart';
import '../services/api_client.dart';
import '../services/push_service.dart';

class AuthState extends ChangeNotifier {
  AuthState(this.api, {this.push});

  final ApiClient api;
  final PushService? push;
  Map<String, dynamic>? user;
  bool loading = true;
  String? error;

  bool get isLoggedIn => api.token != null && api.token!.isNotEmpty;

  /// Platform owner (`role: admin`) — Central Station / God view.
  /// **Web only.** Mobile never exposes system admin APIs or UI.
  bool get isPlatformAdmin {
    final role = user?['role']?.toString() ?? '';
    return role == 'admin';
  }

  /// League host for a tenant (organizer tools on mobile are OK).
  /// Does **not** include platform `admin` unless they also have a tenant membership.
  bool get isLeagueHost {
    final role = user?['role']?.toString() ?? '';
    // Global role used for tenant league admins / staff (not platform God view)
    if (const {'super_admin', 'organizer', 'referee'}.contains(role)) {
      return true;
    }
    for (final m in tenantMemberships) {
      final r = m['role_in_tenant']?.toString() ?? m['role']?.toString() ?? '';
      if (const {'owner', 'admin', 'super_admin', 'organizer', 'referee'}.contains(r)) {
        return true;
      }
    }
    return false;
  }

  /// Mobile organizer hub (create events, disputes, ops for a tenant).
  /// Platform admins must use the web Central Station for platform control.
  bool get isOrganizer => isLeagueHost;

  /// True when this account is platform admin and has no league-host membership.
  bool get platformAdminWebOnly => isPlatformAdmin && !isLeagueHost;

  List<Map<String, dynamic>> get tenantMemberships {
    final mem = user?['tenant_memberships'];
    if (mem is! List) return [];
    return mem.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<void> _applyUser(Map<String, dynamic>? u) async {
    user = u;
    final tid = u?['tenant_id']?.toString();
    if (tid != null && tid.isNotEmpty) {
      await api.setTenantId(tid);
    } else if (tenantMemberships.isNotEmpty) {
      final first = tenantMemberships.first['tenant_id']?.toString();
      if (first != null) await api.setTenantId(first);
    }
  }

  Future<void> bootstrap() async {
    loading = true;
    notifyListeners();
    await api.loadSession();
    if (isLoggedIn) {
      user = await api.me();
      if (user == null) {
        await api.setToken(null);
      } else {
        await _applyUser(user);
        unawaited(push?.registerAfterLogin());
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    error = null;
    loading = true;
    notifyListeners();
    try {
      final res = await api.login(email, password);
      final u = res['user'] is Map
          ? Map<String, dynamic>.from(res['user'] as Map)
          : await api.me();
      await _applyUser(u);
      unawaited(push?.registerAfterLogin());
      loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register(String email, String password, {String? name}) async {
    error = null;
    loading = true;
    notifyListeners();
    try {
      final res = await api.register(email, password, fullName: name);
      final u = res['user'] is Map
          ? Map<String, dynamic>.from(res['user'] as Map)
          : await api.me();
      await _applyUser(u);
      unawaited(push?.registerAfterLogin());
      loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      error = e.toString();
      loading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> selectTenant(String tenantId) async {
    await api.setTenantId(tenantId);
    notifyListeners();
  }

  Future<void> refreshUser() async {
    user = await api.me();
    if (user != null) await _applyUser(user);
    notifyListeners();
  }

  void setUserLocal(Map<String, dynamic>? u) {
    user = u;
    notifyListeners();
  }

  Future<void> logout() async {
    await api.logout();
    await api.setTenantId(null);
    user = null;
    notifyListeners();
  }
}

void unawaited(Future<void>? f) {
  f?.catchError((_) {});
}
