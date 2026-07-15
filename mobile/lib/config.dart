/// API base URL. Override with:
/// `flutter run --dart-define=API_BASE=http://10.0.2.2:3001`
/// Android emulator → host: 10.0.2.2 ; iOS sim → localhost ; device → LAN IP.
class AppConfig {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://127.0.0.1:3001',
  );

  static const appName = 'Arena';
}
