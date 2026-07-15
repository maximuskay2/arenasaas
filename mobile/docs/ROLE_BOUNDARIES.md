# Mobile vs web — role boundaries

## Who is who

| Role | Web | Mobile |
|------|-----|--------|
| **Player** | Full player hub | Full player hub |
| **League organizer** (`super_admin` / `organizer` / tenant membership) | League command post | Organizer tools (create, ops, disputes) |
| **Platform admin** (`role: admin`) | **Central Station** (`/central-station`) | **Not available** — banner + open web |

Platform admin is the product “God view”: tenants, HWID bans, commission, maintenance, vault secrets, system jobs. That stack is **web-only**.

## Mobile policy (enforced in code)

- `AuthState.isPlatformAdmin` → `user.role === 'admin'`
- `AuthState.isLeagueHost` → tenant host roles / memberships (**excludes** platform-only admin)
- `AuthState.isOrganizer` → alias of `isLeagueHost`
- No `/api/system/*` or Central Station UI in the Flutter app
- Platform admin sees `PlatformAdminWebBanner` and deep-link to web `/central-station`

## Use cases

1. **Platform owner on phone** — play, discover, watch; manage platform on desktop web.  
2. **League host on phone** — create events, disputes, ops for their tenant.  
3. **Player** — full competitive mobile experience.
