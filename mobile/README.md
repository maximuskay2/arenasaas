# Arena Mobile — player + league organizer

Flutter client for **players** and **tenant league hosts**.  
**Platform admin (Central Station) stays on the web only.**

## Role split

| Surface | Where |
|---------|--------|
| Player hub (discover, join, matches, vault, community) | **Mobile + web** |
| League organizer (create tournament, ops, disputes) | **Mobile + web** |
| Platform admin / Central Station / system routes | **Web only** (`/central-station`) |

See [docs/ROLE_BOUNDARIES.md](docs/ROLE_BOUNDARIES.md).

## Navigation

| Tab | Purpose |
|-----|---------|
| **Home** | Career hub or league command (toggle if league host) |
| **Discover** | Tournament marketplace |
| **Matches** | My matches + report score |
| **Social** | Community feed |
| **More** | Rankings, Watch, Vault, Teams, Check-in, Free agents, league ops, Settings |

Platform admins see a banner: **Open Central Station** (web). Organizer tabs stay hidden unless they also have a tenant host membership.

## Intentionally web-only

- Central Station / SystemAdmin / global tenant freeze & impersonation  
- Platform HWID ban list, commission slider, secrets vault UI  
- Merchandise, sponsorships finance depth, audit explorer  
- Bracket pan/zoom editor, full analytics charts  
- MFA TOTP setup, Stripe Connect full onboarding  
- Socket.io match lobby chat (use web Match Live)

## Run

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE=http://127.0.0.1:3001
```

Firebase push: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).

API: `npm run dev:full` from repo root.
