# Entry Flow Architecture: User Journey & Entry Points

## Overview
ArenaSaaS uses a **multi-entry-point architecture** to separate:
- **Public Landing** (www.arenasaas.com) — Sell the SaaS
- **Tenant Portal** (app.arenasaas.com) — Organizer dashboard
- **Tenant Public Site** ({tenant}.arenasaas.com) — White-labeled player/fan site
- **System Admin** (admin.arenasaas.com) — Platform owner only

Each entry point has different branding, authentication flows, and feature sets.

---

## 1. Public Landing Page (www.arenasaas.com)

### Purpose
High-conversion marketing site for prospective organizers and general public.

### URL Pattern
- `https://www.arenasaas.com`
- `https://arenasaas.com` (root domain redirects to www)

### Pages
| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `PublicLanding` | Hero, features, FAQ, contact |
| `/tournaments` | `TournamentDiscovery` | Global marketplace — upcoming competitions (linked from nav as **Upcoming competitions**) |
| `/register` | `TenantRegister` | 6-step wizard for org signup |
| `/login` | (Redirects to `/onboarding` on app.arenasaas.com) | Sign in to tenant portal |
| `/privacy` | `PrivacyPolicy` | GDPR-compliant privacy terms |
| `/terms` | `TermsOfService` | Legal terms of service |
| `*` | `PublicLanding` | Fallback to home |

### Branding
- **Color:** ArenaSaaS brand colors (primary: cyan, accent: pink)
- **Logo:** ArenaSaaS logo
- **Font:** Orbitron (display), Inter (body)

### Key Sections
1. **Hero Section**
   - Tagline: "Run Your Esports League In Minutes"
   - CTA: "Start Your League Today" → `/register`
   - Animated background with gaming aesthetic

2. **Features Section**
   - Auto-Brackets: Instant bracket generation
   - Team Management: Roster & role assignment
   - Real-Time Scoring: Captains report, admins approve
   - Mobile App: Native iOS/Android
   - Secure & Scalable: Multi-tenant isolation
   - Live Analytics: Player stats & revenue

3. **Pricing Section**
   - "Plans for Every League"
   - CTA: "Get Started" → `/register`

4. **FAQ Section**
   - Game support, formats, mobile, payouts, white-label

5. **Contact Section**
   - Email form → Sends to support@arenasaas.com via Resend
   - Success message on submission

6. **Footer**
   - Links to `/privacy`, `/terms`, contact
   - Copyright © 2026 ArenaSaaS

### Routing Detection
```javascript
// lib/routingLogic.js
isPublicLanding() → subdomain === null || subdomain === "www"
```

---

## 2. Tenant Registration Onboarding (app.arenasaas.com/register)

### Purpose
6-step wizard for new organizers to create an account and organization.

### Flow
1. **Step 0: Account Creation**
   - Email input
   - Password input
   - Both required to proceed

2. **Step 1: Organization Setup**
   - Organization name (e.g., "Elite Gaming Co.")
   - **Settlement currency:** USD or NGN — sets `tenant_wallets.currency`, `payout_settings.settlement_currency`, and default **primary rail** (NGN → Paystack-first)
   - **Hosting plan:** monthly subscription vs one-time single-tournament credit (maps to `tenant_entitlements.plan_type`)
   - Logo upload (optional, defaults to ArenaSaaS logo)
   - Generate subdomain suggestions from org name

3. **Step 2: Subdomain Selection**
   - Manual subdomain input (validates URL-safe slug)
   - Auto-suggestions: `elite`, `elite-esports`, `elite-league`, `the-elite`
   - User selects one or customizes

4. **Step 3: Email Verification**
   - "Send Verification Code" button
   - Calls `sendOtp()` backend function
   - User receives email with 6-digit OTP
   - Input field for OTP code
   - Validates via `verifyOtp()` backend function

5. **Step 4: Payout rails (Stripe + NGN)**
   - **USD:** connect Stripe for prize payouts (optional at signup) — "Connect Stripe Account" → `setupStripe()` (Connect onboarding)
   - **NGN:** copy explains Paystack / Flutterwave alongside Stripe for entry fees; wallet is created in NGN; Stripe Connect remains optional
   - **Complete setup** proceeds without Stripe; payouts can be configured later in Settings

6. **Step 5: Success**
   - Welcome message; if `TENANT_REGISTRATION_REQUIRES_APPROVAL` is enabled (default in production), explains **pending platform approval**
   - CTA: "Go to Dashboard" → organizer portal `/`
   - **Server:** `POST /api/tenant-registration` (authenticated) creates in one transaction:
     - `tenants` (status `pending` or `active` per env), `tenant_configs` (including `payout_settings` with `settlement_currency` + `primary_rail`: Paystack-first for NGN), `tenant_entitlements`, `tenant_wallets` (**currency** `USD` or `NGN`), `user_tenants` (organizer)
     - Returns refreshed **JWT** so `tenant_id` is present for `X-Tenant-ID`

### Superadmin approval
- Platform admins (`role: admin`) use **Central Station** → **Tenants** → **Approve org** for rows with `status: pending`, which sets `tenants.status` to `active`.
- While pending, organizer **writes** to tenant-scoped resources are blocked (403 `tenant_pending`); reads and player/discovery flows continue to work.

### Backend Functions Called
- `sendOtp(email)` — Generates 6-digit code, stores in OTPRecord, sends email
- `verifyOtp(email, code)` — Validates OTP, marks used, returns success
- `setupStripe(email, tenantId)` — Creates Stripe Connect account, generates onboarding link
- `POST /api/tenant-registration` — Canonical org creation after OTP + auth (replaces unauthenticated multi-step CRUD that conflicted with RLS for logged-in users)

### Player / competitor flow
- **Account:** same `/api/auth/register` + `/api/auth/login` as organizers (`users.role` typically `user`).
- **Discovery:** public `/tournaments` (`TournamentDiscovery`) lists catalog from `GET /api/public/tournaments-catalog`.
- **Join:** authenticated `POST /api/tournaments/:id/join` with roster / payment proof as implemented in the transaction layer.

### Data Entities Created
```javascript
// Tenant
{
  name: "Elite Gaming Co.",
  slug: "elite",
  owner_email: "owner@elite.com",
  logo_url: "https://...",
  plan: "free",
  status: "active"
}

// TenantConfig
{
  tenant_id: "...",
  tenant_name: "Elite Gaming Co.",
  logo_url: "https://...",
  stripe_account_id: "acct_...",
  primary_color: "#00d4ff",
  accent_color: "#ff4655"
}

// User (invited)
{
  email: "owner@elite.com",
  role: "admin",
  email_verified: true,
  account_status: "active"
}

// OTPRecord (one-time use)
{
  email: "owner@elite.com",
  code: "123456",
  expires_at: "2026-03-27T12:10:00Z",
  used: true
}
```

---

## 3. Tenant Portal (app.arenasaas.com or {tenant}.arenasaas.com)

### Purpose
Organizer dashboard for managing tournaments, teams, matches, and revenue.

### URL Patterns
- `https://app.arenasaas.com` (primary tenant portal)
- `https://localhost:5173` (development)
- `https://{tenant}.arenasaas.com` (if tenant wants their own subdomain for admin)

### Pages
| Route | Purpose |
|-------|---------|
| `/` | Dashboard (stats, live matches, tournaments) |
| `/tournaments` | List all tournaments |
| `/tournaments/new` | Create new tournament |
| `/tournaments/:id` | Tournament detail & management |
| `/matches` | All matches across tournaments |
| `/matches/:id` | Match detail, check-in, scoring |
| `/teams` | List teams in tenant |
| `/games` | Game template library |
| `/audit-log` | System audit trail |
| `/settings` | Tenant configuration (branding, domain, etc.) |
| `/super-admin` | Tenant-level admin tools (NOT system admin) |
| `/wallet` | Prize pool & payout management |
| `/revenue` | Financial reports |
| `/team-dashboard` | Team management for players |
| `/merch-dashboard` | Merchandise shop management |
| `/onboarding` | Guided setup for new organizers |

### Branding (White-Label)
- **Colors:** From TenantConfig (primary_color, accent_color, secondary_color)
- **Logo:** From TenantConfig (logo_url)
- **Font:** From TenantConfig (display_font)
- **Domain:** Matches tenant subdomain (elite.arenasaas.com)

### Theme Switching
```javascript
// components/layout/TenantThemeProvider.jsx
// Reads TenantConfig colors and applies as CSS variables
// Converted from hex (#00d4ff) → HSL (190 100% 50%)
```

### Authentication
- User must be authenticated
- User role checked: admin, organizer, player
- Admin/Organizer access to dashboard
- Players access limited features (team dashboard, discovery)

### Data Context
- **Tenant ID:** From user's organization
- **User Email:** From authenticated session
- **Tenant Config:** Applied as branding theme

---

## 4. Tenant Public Site ({tenant}.arenasaas.com)

### Purpose
White-labeled website for players and fans to view tournaments, brackets, standings.

### URL Pattern
- `https://{tenant}.arenasaas.com` (e.g., `https://elite.arenasaas.com`)

### Pages (Planned)
| Route | Purpose |
|-------|---------|
| `/` | Tournament listing (public) |
| `/tournaments/:id` | Public bracket view |
| `/players` | Free agent marketplace |
| `/standings` | Leaderboards & rankings |
| `/news` | Tournament feed/announcements |

### Branding
- Full white-label using TenantConfig
- No ArenaSaaS branding (except small footer logo)
- Tenant's logo as main brand

### Authentication
- Public by default (no login required)
- Optional: Players can log in to join teams, submit scores

### Detection
```javascript
// lib/routingLogic.js
isPublicTenantSite() → subdomain exists && not ["www", "app", "admin"]
```

---

## 5. System Super-Admin Portal (admin.arenasaas.com)

### Purpose
**Highly secured** management interface for platform owner and staff.

### URL Pattern
- `https://admin.arenasaas.com` ONLY
- **Not linked anywhere** on public site or tenant portals

### Pages
| Feature | Purpose |
|---------|---------|
| **Tenant Management** | View all orgs, revenue, tournament counts, suspend/ban |
| **Financial Overview** | Platform revenue, commission tracking, payout schedules |
| **Global Bans** | Ban users or tenants across entire platform |
| **White-Label Override** | Manually adjust tenant branding if they violate ToS |
| **Maintenance Mode** | "Big Red Button" to take platform offline |
| **Audit Logs** | System-wide activity tracking |

### Security Measures
1. **Subdomain Gating**
   - Only accessible via `admin.arenasaas.com`
   - App rejects all admin routes on other subdomains

2. **Authentication**
   - User must be authenticated
   - User role must be `admin` (not organizer/player)
   - Session checked on every request

3. **IP Whitelisting** (Railway environment)
   - Set `ADMIN_IP_WHITELIST` environment variable
   - Optional but recommended: restrict to office IPs
   ```bash
   ADMIN_IP_WHITELIST=123.45.67.89,234.56.78.90
   ```

4. **Audit Logging**
   - All actions logged to AuditLog entity
   - Including: who accessed, what changed, timestamp

5. **No Public Links**
   - Admin URL never appears in code/UI
   - Direct navigation only via knowing the URL

### Detection
```javascript
// lib/routingLogic.js
isSystemAdmin() → subdomain === "admin"
// AND checked in App.jsx routing before rendering
```

### Component
```javascript
// pages/SystemAdmin.jsx
// Gated behind auth + role check
// Never shown in public/tenant portals
```

---

## 6. Routing Logic & Detection

### File: `lib/routingLogic.js`

```javascript
getSubdomain()          // "www", "app", "admin", "{tenant}", null
isPublicLanding()       // subdomain === null || "www"
isTenantPortal()        // subdomain === "app" || null (localhost)
isPublicTenantSite()    // subdomain exists && not in ["www", "app", "admin"]
isSystemAdmin()         // subdomain === "admin"
getTenantSlug()         // Returns tenant subdomain (e.g., "elite")
```

### App.jsx Routing Order
1. **Check loading states** → Show spinner
2. **Check auth errors** → Handle user_not_registered
3. **Check if public landing** (`isPublicLanding()`) → Show PublicLanding, Register, Legal
4. **Check if system admin** (`isSystemAdmin()`) → Show SystemAdmin portal
5. **Default: Tenant Portal** → Show Dashboard, Tournaments, etc.

---

## 7. Branding & Theme Strategy

### Public Landing (www.arenasaas.com)
- **Source:** index.css (hardcoded ArenaSaaS colors)
- **Colors:** cyan (#00d4ff), pink (#ff4655)
- **Logo:** ArenaSaaS logo

### Tenant Portal (app.arenasaas.com)
- **Source:** TenantConfig entity
- **Applied via:** TenantThemeProvider component
- **Mechanism:** CSS variables (hex → HSL conversion)
- **Changes:** Primary, accent, secondary colors dynamically

### System Admin (admin.arenasaas.com)
- **Source:** index.css (ArenaSaaS brand, secured)
- **No white-label:** Admin portal always uses platform colors
- **Reason:** Security — admin must always see official branding

---

## 8. Mobile App Considerations

### iOS/Android Build
- Same React codebase compiles to native app
- App opens directly to login/discover (skips public landing)
- Falls back to in-app browser if needed

### App Routes
- `/login` → Login screen
- `/discover` → Tournament discovery
- `/team-dashboard` → Player's teams
- Other routes as needed

---

## 9. Security Best Practices

### URL Hiding
- ✅ Admin URL (`admin.arenasaas.com`) never hardcoded in UI
- ✅ No links to admin portal anywhere
- ✅ Only accessible by knowing the URL

### Session Management
- ✅ maxikay AuthContext handles auth
- ✅ User role validated on every route
- ✅ Tokens stored securely (HttpOnly cookies)

### Data Isolation
- ✅ TenantConfig colors isolated per tenant
- ✅ Audit logs track all access
- ✅ Users can't access other tenants' data (via RLS)

### IP Whitelisting
- ✅ Railway supports network restrictions
- ✅ Set `ADMIN_IP_WHITELIST` env var
- ✅ Restrict admin panel to office IPs only

---

## 10. Deployment on Railway

### Environment Variables
```bash
# Public site config
PUBLIC_LANDING_DOMAIN=yourdomain.com
APP_URL=https://yourdomain.com
TENANT_PORTAL_URL=https://app.yourdomain.com
ADMIN_PORTAL_URL=https://admin.yourdomain.com

# Security (optional)
ADMIN_IP_WHITELIST=123.45.67.89,234.56.78.90
```

### DNS Setup
```
www.yourdomain.com → Railway app
app.yourdomain.com → Railway app
admin.yourdomain.com → Railway app
*.yourdomain.com → Railway app (catch all for {tenant} subdomains)
yourdomain.com → Railway app
```

### Subdomain Resolution
- Railway automatically serves same app on all subdomains
- App.jsx routing detects subdomain and shows appropriate content
- No separate deployments needed

---

## 11. Testing Entry Points

### Public Landing
```bash
# Visit: http://localhost:5173
# Or: http://www.localhost:5173 (if testing subdomain detection)
```

### Tenant Portal
```bash
# Visit: http://localhost:5173
# After login, shows dashboard
```

### Tenant Public Site
```bash
# Visit: http://elite.localhost:5173
# Shows white-labeled tournament site
```

### System Admin
```bash
# Visit: http://admin.localhost:5173
# Shows admin portal (if logged in as admin role)
```

---

## 12. Next Steps (product vs operations)

**Product / app (implemented in-repo)**

1. ✅ PublicLanding refactored with contact form
2. ✅ Routing logic enhanced with subdomain detection
3. ✅ SystemAdmin secured with auth checks
4. ✅ TenantRegister integrated with backend functions (`POST /api/tenant-registration`, OTP, wallet currency USD/NGN, payout defaults)
5. ✅ NGN payment parity: Paystack + Flutterwave + Stripe for entry fees (`payment-rails` + `TournamentJoinModal`), wallet/payout UI ordering, Settings copy

**Operations (your deployment checklist)**

1. Deploy and smoke-test on Railway (or host of choice): public landing, tenant portal, discovery, join with fee
2. Configure DNS: `www`, `app`, `admin`, wildcard `{tenant}` → same app
3. Validate white-label on `{tenant}` host after DNS propagates
4. Optional: set `ADMIN_IP_WHITELIST` for `admin.*` in production

---


## Summary

| URL | Purpose | Auth | Branding | Component |
|-----|---------|------|----------|-----------|
| `www.arenasaas.com` | Sell SaaS | None | ArenaSaaS | PublicLanding |
| `www.arenasaas.com/register` | Signup | None | ArenaSaaS | TenantRegister |
| `app.arenasaas.com` | Organizer Dashboard | Required | TenantConfig | Dashboard + AppLayout |
| `elite.arenasaas.com` | White-Labeled Site | Optional | TenantConfig | Public Pages |
| `admin.arenasaas.com` | Super-Admin Portal | Required + Role | ArenaSaaS | SystemAdmin |