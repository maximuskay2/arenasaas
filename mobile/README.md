# Arena Mobile — player + league organizer

Flutter client for **players** and **tenant league hosts**.  
**Platform admin (Central Station) stays on the web only.**

## Role split

| Surface | Where |
|---------|--------|
| Player hub (discover, join, matches, vault, community) | **Mobile + web** |
| League organizer (create tournament, ops, disputes, bracket tools) | **Mobile + web** |
| Platform admin / Central Station / system routes | **Web only** (`/central-station`) |

See [docs/ROLE_BOUNDARIES.md](docs/ROLE_BOUNDARIES.md).

## Navigation

| Tab | Purpose |
|-----|---------|
| **Home** | Career hub or league command (toggle if league host) |
| **Discover** | Tournament marketplace (seeded catalog) |
| **Matches** | My matches → lobby, live center, report + evidence |
| **Social** | Community feed + realtime posts |
| **More** | Watch, rankings, vault, teams, check-in, free agents, notifs, legal, league ops |

### Production features (mobile)

- **Match Center** — WebView stream + Socket.io kill feed + lobby chat  
- **Match Lobby** — check-in, reports, multi-image evidence upload  
- **Bracket** — round selector + match cards → lobby/center  
- **Create tournament** — multi-step wizard (taxonomy, entry, schedule)  
- **Profiles** — player career + team profile from rankings / free agents  
- **Watchlist**, **notifications** (+ FCM path), **tenant register**, **legal**  
- **Organizer** — ops board, tournaments, teams, game templates, league settings, revenue, disputes, bracket tools, analytics  

Deep links: `/matches/:id`, `/matches/:id/live`, `/matches/:id/lobby`, `/tournaments/:id`, `arenasaas://match/:id`, `arenasaas://tournament/:id`.

Platform admins see a banner: **Open Central Station** (web). Organizer tools stay hidden unless they have a tenant host membership.

## Intentionally web-only

- Central Station / SystemAdmin / global tenant freeze & impersonation  
- Platform HWID ban list, commission slider, secrets vault UI  
- Merchandise, sponsorships finance depth, audit explorer  
- Full pan/zoom bracket editor, deep analytics charts  
- MFA TOTP setup, Stripe Connect full onboarding UI  

## Run

```bash
# From repo root: API + Postgres
npm run dev:full

cd mobile
flutter pub get
# iOS sim / desktop
flutter run --dart-define=API_BASE=http://127.0.0.1:3001
# Android emulator (host loopback)
flutter run --dart-define=API_BASE=http://10.0.2.2:3001
# Physical device — use your machine LAN IP
flutter run --dart-define=API_BASE=http://192.168.x.x:3001
```

Firebase push (optional production): [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).

### Analyze

```bash
cd mobile && flutter analyze
```

Expect only info-level lints (deprecated DropdownButtonFormField `value`, async context infos). No errors/warnings required for release candidates.
