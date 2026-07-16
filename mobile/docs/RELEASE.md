# Arena Mobile — production release notes

Version: **1.1.0+2**

## Scope

Player + league-host client. Platform admin / Central Station remains **web only**.

## Pre-flight

1. API healthy: `npm run dev:full` (or production API URL).
2. `flutter pub get && flutter analyze` — no errors/warnings.
3. Firebase (optional for push): copy real `google-services.json` / `GoogleService-Info.plist` and run FlutterFire; see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).

## API base URL

```bash
# iOS sim / macOS
flutter run --dart-define=API_BASE=https://YOUR_API_HOST

# Android emulator → host machine
flutter run --dart-define=API_BASE=http://10.0.2.2:3001

# Physical device (LAN)
flutter run --dart-define=API_BASE=http://192.168.x.x:3001
```

## Deep links

| Link | Opens |
|------|--------|
| `arenasaas://tournament/:id` | Tournament detail |
| `arenasaas://match/:id` | Match center |
| `arenasaas://match/:id/lobby` | Match lobby |
| `arenasaas://create` | Create tournament |
| `/tournaments/:id`, `/matches/:id/live` | Same via path routes |

FCM data payload keys: `deep_link`, `match_id`, `tournament_id`, `view` (`lobby`|`live`).

## Android release APK / App Bundle

```bash
cd mobile
# Debug-signed release (dev only — replace signingConfigs before store)
flutter build apk --release --dart-define=API_BASE=https://YOUR_API_HOST
flutter build appbundle --release --dart-define=API_BASE=https://YOUR_API_HOST
```

Store checklist:

- [ ] Replace `signingConfig = debug` in `android/app/build.gradle.kts` with upload keystore
- [ ] Set production `API_BASE` (HTTPS)
- [ ] Turn off cleartext in production network config if API is HTTPS-only
- [ ] Icons: replace default mipmaps if branding changes
- [ ] Privacy / data safety form (photo evidence, account email, FCM)

## iOS release

```bash
cd mobile
flutter build ipa --release --dart-define=API_BASE=https://YOUR_API_HOST
```

- Bundle id: `com.arenasaas.arena_mobile` (confirm in Xcode)
- Enable Push Notifications + Background Modes if using FCM
- Photo Library / Camera usage strings already in Info.plist

## Smoke checklist

- [ ] Sign in / register with seeded user
- [ ] Discover → open tournament → join (dev pay ok)
- [ ] Matches → Lobby → Report with photo evidence
- [ ] Watch / Live → Match Center stream WebView
- [ ] Organizer toggle → create tournament → bracket tools
- [ ] Notifications inbox open + FCM enable (if Firebase configured)
- [ ] Deep link cold start: `adb shell am start -a android.intent.action.VIEW -d "arenasaas://match/TEST"`

## Intentionally not on mobile

Central Station, global admin, full bracket pan/zoom editor, deep finance/audit UIs.
