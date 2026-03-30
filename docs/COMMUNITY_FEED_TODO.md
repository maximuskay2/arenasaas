# Community / Conversation Feed - Remaining TODO

## Scope
Multi-tenant “Social Feed / War Room” with:
- Global feed (platform owner announcements)
- Tenant feed (org-scoped threads)
- Lobby feed (match-scoped high-speed chat)
- Real-time updates
- Role-gated posting and moderation (delete + shadowban)
- Rich media embedding (Twitch clips + YouTube highlights + match results)
- Optimistic likes

## Status Notes
- Frontend lint is clean.
- [x] Migration/schema sync for **community_posts** tables is implemented via `src/db/schema.sql` and server migration already creates the tables.
- Lobby feed realtime chat is implemented (Socket.io room + event emission), but authorization is still not strict enough for “teams currently in a match”.

---

## Community Feed (Global + Tenant)

### Role-gated posting / announcements
- [x] **Auto-pin** “Official Announcements” on create (staff posts start pinned).
- [x] Ensure UI clearly distinguishes “Pinned / Official” announcements from other post types (visual + sort behavior).

### Moderation & shadowban visibility
- [x] **Shadowban filtering for comments** (comments endpoint excludes shadowbanned authors).
- [x] Confirm moderation checks for comment delete match the intended policy:
  - Extracted `canModeratePost` into a shared permission module and added unit tests covering platform staff vs tenant staff vs non-author users.

### Real-time room scoping
- [x] Fix socket room join logic in `CommunityHub` so it joins only the relevant rooms.
- [x] Verify realtime invalidation is correct for:
  - post updates
  - likes/unlikes
  - new comments + removed comments
  - (Client now invalidates event-specific query keys first, with a fallback only for unknown events.)

### Rich media embedding
- [x] Implement **“Match Results”** rich media embedding when `media_url` contains a match reference.
- [x] Expand match-result URL detection rules for your exact match-result flow.
  - Broadened `media_url` parsing to support query-param and multiple URL forms.

---

## Lobby Feed (Match-Scoped Chat)

### Participant-level access control
- [x] Tighten “lobby chat” authorization to only teams currently in the match.
  - Current state: Socket.io is match-scoped (`match:lobby:{matchId}`) and messages are emitted per match, but DB RLS for `chat_messages` appears to be tournament/tenant-based rather than match-participant-based.
  - Implemented match-participant RLS checks based on match teams roster/captain (and bypass for non-match spectator-style chat rows).

### UX and event correctness
- [x] Add/verify the lobby UI shows realtime without polling (message list updates via socket invalidations).
- [x] Ensure send payload aligns with DB columns used in your current schema:
  - Current state: frontend supports both `content` and legacy `message`/`role` when sending + reading.

---

## Feed Service Architecture

### Dedicated microservice
- [x] Split “Feed Microservice” into a dedicated service (logical split for MVP).
  - Current state: community feed routes live in the main API server, but list logic is extracted into `server/src/services/feed/*` and reused by both routes and the alias.

### Endpoint naming compatibility (optional but recommended)
- [x] Add API alias endpoint(s) to match spec naming:
  - `GET /api/feed?tenant_id=xyz` now wraps/reuses the community feed list logic.

---

## Suggested Verification Checklist (Manual)
- [ ] Login as:
  - platform admin / tenant staff / normal player
- [ ] Post:
  - announcement as staff -> verify auto-pin
  - strategy/recruitment as player -> verify permissions
- [ ] Shadowban:
  - shadowban user (global + tenant) -> verify both **posts and comments** are hidden
- [ ] Realtime:
  - open global feed + tenant feed in two tabs -> verify new posts/likes/comments appear instantly in correct scope
- [ ] Lobby:
  - open match lobby in two tabs
  - authorized team member vs unauthorized user -> verify access rules
- [ ] Rich media:
  - embed YouTube and Twitch clip links -> verify correct rendering
  - add a “match results” media URL -> verify embed rendering

