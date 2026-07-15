import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'api_client.dart';

/// Background isolate handler — must be top-level.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Ensure Firebase is ready in background isolate
  try {
    if (Firebase.apps.isEmpty && DefaultFirebaseOptions.isConfigured) {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    }
  } catch (e) {
    debugPrint('[FCM] background init: $e');
  }
  debugPrint('[FCM] background message: ${message.messageId} ${message.notification?.title}');
}

/// Real Firebase Cloud Messaging integration (no stub tokens).
class PushService {
  PushService(this.api);

  final ApiClient api;
  bool _ready = false;
  String? lastToken;
  String? lastError;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;

  bool get isReady => _ready;
  bool get isConfigured => DefaultFirebaseOptions.isConfigured;

  /// Initialize Firebase + request permission + register token with Arena API.
  Future<PushInitResult> initializeAndRegister({bool requireAuth = true}) async {
    lastError = null;

    if (!DefaultFirebaseOptions.isConfigured) {
      lastError =
          'Firebase is not configured. Run flutterfire configure or pass FIREBASE_* dart-defines. See mobile/docs/FIREBASE_SETUP.md';
      return PushInitResult(ok: false, error: lastError);
    }

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      }

      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      final messaging = FirebaseMessaging.instance;

      // iOS + Android 13+ permission
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        lastError = 'Notification permission denied';
        return PushInitResult(ok: false, error: lastError);
      }

      // iOS: wait for APNs token when available
      if (!kIsWeb && Platform.isIOS) {
        await messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
        // Give APNs a moment on cold start
        for (var i = 0; i < 10; i++) {
          final apns = await messaging.getAPNSToken();
          if (apns != null) break;
          await Future<void>.delayed(const Duration(milliseconds: 300));
        }
      }

      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        lastError =
            'FCM returned no token. Check google-services.json / GoogleService-Info.plist and network.';
        return PushInitResult(ok: false, error: lastError);
      }

      // Reject accidental stub patterns from older builds
      if (token.startsWith('arena-mobile-dev-')) {
        lastError = 'Stub token rejected — use real Firebase project configuration';
        return PushInitResult(ok: false, error: lastError);
      }

      lastToken = token;
      _ready = true;

      await _tokenRefreshSub?.cancel();
      _tokenRefreshSub = messaging.onTokenRefresh.listen((t) async {
        lastToken = t;
        await _registerWithApi(t);
      });

      await _foregroundSub?.cancel();
      _foregroundSub = FirebaseMessaging.onMessage.listen((msg) {
        debugPrint('[FCM] foreground: ${msg.notification?.title} ${msg.data}');
      });

      if (requireAuth && (api.token == null || api.token!.isEmpty)) {
        return PushInitResult(
          ok: true,
          token: token,
          registeredWithApi: false,
          note: 'Token obtained; sign in to register with Arena API',
        );
      }

      final registered = await _registerWithApi(token);
      return PushInitResult(
        ok: true,
        token: token,
        registeredWithApi: registered,
      );
    } catch (e, st) {
      debugPrint('[FCM] init failed: $e\n$st');
      lastError = e.toString();
      _ready = false;
      return PushInitResult(ok: false, error: lastError);
    }
  }

  Future<bool> _registerWithApi(String token) async {
    if (api.token == null || api.token!.isEmpty) return false;
    try {
      final platform = !kIsWeb && Platform.isIOS
          ? 'ios'
          : !kIsWeb && Platform.isAndroid
              ? 'android'
              : 'mobile';
      await api.registerFcmToken(token, platform: platform);
      return true;
    } catch (e) {
      debugPrint('[FCM] API register failed: $e');
      lastError = 'Token ok but API register failed: $e';
      return false;
    }
  }

  /// Re-register current token after login.
  Future<bool> registerAfterLogin() async {
    if (lastToken != null && lastToken!.isNotEmpty) {
      return _registerWithApi(lastToken!);
    }
    final r = await initializeAndRegister(requireAuth: true);
    return r.ok && (r.registeredWithApi == true);
  }

  Future<void> dispose() async {
    await _tokenRefreshSub?.cancel();
    await _foregroundSub?.cancel();
  }
}

class PushInitResult {
  PushInitResult({
    required this.ok,
    this.token,
    this.error,
    this.registeredWithApi,
    this.note,
  });

  final bool ok;
  final String? token;
  final String? error;
  final bool? registeredWithApi;
  final String? note;
}
