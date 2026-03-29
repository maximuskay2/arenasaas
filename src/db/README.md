# Database Schema

This folder contains the full PostgreSQL migration schema for ArenaSaaS.

## Files

| File | Description |
|------|-------------|
| `schema.sql` | Full DDL — all tables, indexes, triggers |

## Tables

| Table | Description |
|-------|-------------|
| `tenants` | Platform organizations |
| `tenant_configs` | White-label branding per tenant |
| `tenant_entitlements` | Subscription plan features |
| `tenant_wallets` | Organizer revenue wallets |
| `withdrawal_requests` | Payout requests |
| `payment_ledger` | All financial transactions |
| `game_templates` | Game configurations (Valorant, CS2…) |
| `tournaments` | Tournament events |
| `teams` | Registered teams per tournament |
| `matches` | Individual bracket matches |
| `match_reports` | Player-submitted score evidence |
| `reschedule_requests` | Match reschedule requests |
| `match_highlights` | Clips and kill highlights |
| `player_stats` | Per-match player KDA stats |
| `free_agents` | Player recruitment board |
| `feed_posts` | Tournament social feed |
| `feed_comments` | Comments on feed posts |
| `chat_messages` | In-match chat |
| `fan_votes` | MVP fan votes |
| `sponsors` | Tournament sponsors |
| `prize_payments` | Prize distribution records |
| `merchandise_items` | Merch catalog |
| `merchandise_orders` | Merch purchase orders |
| `notifications` | User notification inbox |
| `audit_logs` | Admin action audit trail |
| `otp_records` | Email verification OTPs |
| `platform_config` | System-wide key-value config |
| `users` | Extended user profiles |

## Deploying on Railway

```bash
# 1. Add a PostgreSQL plugin in your Railway project
# 2. Copy the DATABASE_URL from Railway dashboard
# 3. Run the migration:
psql $DATABASE_URL -f db/schema.sql
```

Or via Railway CLI:
```bash
railway run psql $DATABASE_URL -f db/schema.sql
```

## Local Development

```bash
# Start local Postgres (Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:16

# Apply schema
psql postgresql://postgres:secret@localhost:5432/arenasaas -f db/schema.sql
```

## Notes

- All tables include `id` (UUID), `created_date`, `updated_date`, `created_by`
- JSONB columns used for flexible arrays (roster, items, social_links, game_handles)
- Auto-update trigger on `updated_date` applied to all tables
- Indexes cover all common query patterns (tenant isolation, status filters, player lookups)