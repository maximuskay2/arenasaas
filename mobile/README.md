# Arena Mobile (Flutter)

Player + organizer client for **Arena-SaaS**.

## Features

- Discover / free & paid join (solo + **team roster**)
- My matches + report score
- Live watch, Elo rankings (team/player)
- Vault (wallets + trophies)
- **Real Firebase FCM** (no stub tokens)
- **Organizer create tournament** (tenant-scoped)

## Run

```bash
cd mobile
flutter pub get

flutter run --dart-define=API_BASE=http://127.0.0.1:3001
# Android emulator: http://10.0.2.2:3001
```

## Firebase FCM (required for push)

See **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**.

Quick path:

1. `flutterfire configure --project=<id>`
2. Drop `android/app/google-services.json` and `ios/Runner/GoogleService-Info.plist`
3. Profile → **Enable push notifications**

Stub tokens (`arena-mobile-dev-…`) are **rejected**.

## Organizer create

Sign in with organizer/admin membership → FAB **Create** or Profile → Create tournament.  
Select tenant under Profile if you belong to multiple orgs.

## Team join

Open a tournament with roster size &gt; 1 → **Team** mode → team name, tag, captain game ID, teammate email + game IDs.
