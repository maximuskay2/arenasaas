// File generated for Arena mobile FCM. Prefer regenerating with:
//   dart pub global activate flutterfire_cli
//   flutterfire configure --project=<your-firebase-project>
//
// Or set --dart-define values at build time (see docs/FIREBASE_SETUP.md).

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
class DefaultFirebaseOptions {
  static bool get isConfigured {
    try {
      final o = currentPlatform;
      return o.apiKey.isNotEmpty &&
          o.apiKey != 'REPLACE_ME' &&
          o.projectId.isNotEmpty &&
          o.projectId != 'REPLACE_ME' &&
          o.appId.isNotEmpty &&
          o.appId != 'REPLACE_ME';
    } catch (_) {
      return false;
    }
  }

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  // Values: dart-define overrides, else placeholders (must be replaced for real FCM).
  static const String _apiKey = String.fromEnvironment(
    'FIREBASE_API_KEY',
    defaultValue: 'REPLACE_ME',
  );
  static const String _appIdAndroid = String.fromEnvironment(
    'FIREBASE_ANDROID_APP_ID',
    defaultValue: 'REPLACE_ME',
  );
  static const String _appIdIos = String.fromEnvironment(
    'FIREBASE_IOS_APP_ID',
    defaultValue: 'REPLACE_ME',
  );
  static const String _messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
    defaultValue: 'REPLACE_ME',
  );
  static const String _projectId = String.fromEnvironment(
    'FIREBASE_PROJECT_ID',
    defaultValue: 'REPLACE_ME',
  );
  static const String _storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
    defaultValue: 'REPLACE_ME.appspot.com',
  );
  static const String _iosBundleId = String.fromEnvironment(
    'FIREBASE_IOS_BUNDLE_ID',
    defaultValue: 'com.arenasaas.arenaMobile',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: _apiKey,
    appId: String.fromEnvironment('FIREBASE_WEB_APP_ID', defaultValue: 'REPLACE_ME'),
    messagingSenderId: _messagingSenderId,
    projectId: _projectId,
    authDomain: String.fromEnvironment(
      'FIREBASE_AUTH_DOMAIN',
      defaultValue: 'REPLACE_ME.firebaseapp.com',
    ),
    storageBucket: _storageBucket,
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: _apiKey,
    appId: _appIdAndroid,
    messagingSenderId: _messagingSenderId,
    projectId: _projectId,
    storageBucket: _storageBucket,
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: _apiKey,
    appId: _appIdIos,
    messagingSenderId: _messagingSenderId,
    projectId: _projectId,
    storageBucket: _storageBucket,
    iosBundleId: _iosBundleId,
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: _apiKey,
    appId: _appIdIos,
    messagingSenderId: _messagingSenderId,
    projectId: _projectId,
    storageBucket: _storageBucket,
    iosBundleId: _iosBundleId,
  );
}
