# Firebase Cloud Messaging (real tokens)

Arena mobile uses **firebase_core** + **firebase_messaging**. Stub tokens are rejected.

## 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Add project (or use existing)
3. Add **Android** app: package `com.arenasaas.arena_mobile`
4. Add **iOS** app: bundle id matching Xcode (`com.arenasaas.arenaMobile` or your id)
5. Download:
   - `google-services.json` → `mobile/android/app/google-services.json`
   - `GoogleService-Info.plist` → `mobile/ios/Runner/GoogleService-Info.plist`

## 2. Generate Flutter options (recommended)

```bash
cd mobile
dart pub global activate flutterfire_cli
flutterfire configure --project=<your-firebase-project-id>
```

This overwrites `lib/firebase_options.dart` with real keys.

### Or pass dart-defines

```bash
flutter run \
  --dart-define=API_BASE=http://10.0.2.2:3001 \
  --dart-define=FIREBASE_API_KEY=AIza... \
  --dart-define=FIREBASE_PROJECT_ID=your-id \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=123456789 \
  --dart-define=FIREBASE_ANDROID_APP_ID=1:123:android:abc \
  --dart-define=FIREBASE_IOS_APP_ID=1:123:ios:def \
  --dart-define=FIREBASE_STORAGE_BUCKET=your-id.appspot.com
```

## 3. Android

- Place `google-services.json` under `android/app/`
- Gradle applies `com.google.gms.google-services` when that file exists
- Min SDK is set to 23+ for messaging

## 4. iOS

- Enable **Push Notifications** + **Background Modes → Remote notifications** in Xcode
- Upload APNs key to Firebase Console → Project settings → Cloud Messaging
- Add `GoogleService-Info.plist` to Runner target

## 5. Server

Set on the Arena API (`server/.env`):

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
# or path
FIREBASE_SERVICE_ACCOUNT_PATH=/secure/firebase-adminsdk.json
```

The API stores device tokens via `POST /api/notifications/fcm/register` and sends via Admin SDK.

## 6. Verify

1. Sign in on mobile
2. Profile → **Enable push notifications**
3. Expect a **long FCM token** (not `arena-mobile-dev-…`)
4. Token row appears in `user_fcm_tokens`
5. Trigger a join / prize / FCM job and confirm delivery
