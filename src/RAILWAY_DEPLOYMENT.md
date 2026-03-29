# Railway Deployment Guide

## Overview
ArenaSaaS is built as a stateless application architecture suitable for Railway's containerized infrastructure. All backend functions are environment-driven and database-backed.

## Pre-Deployment Checklist

### 1. **Environment Variables**
Copy and configure all variables in `.env.example`:

```bash
# Required for all deployments
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_xxxxx
RESEND_API_KEY=re_xxxxx
maxikay_API_KEY=xxxxx

# Optional but recommended
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx
OTP_EXPIRY_MINUTES=5
```

### 2. **Stripe Setup**
1. Create Stripe account: https://dashboard.stripe.com
2. Enable "Connect" for merchant accounts
3. Generate API keys (Secret & Publishable)
4. Set webhook endpoint: `https://yourdomain.com/api/stripe-webhook`
5. Add keys to Railway environment

### 3. **Email Service (Resend)**
1. Sign up: https://resend.com
2. Get API key from dashboard
3. Add to Railway: `RESEND_API_KEY`
4. Set sender: `MAIL_FROM=noreply@yourdomain.com`

### 4. **Database**
- Railway auto-provisions PostgreSQL
- `DATABASE_URL` is automatically set
- maxikay SDK handles schema migrations
- **No manual setup required**

## Deployment Steps

### Option A: Deploy from Git (Recommended)

1. **Connect GitHub**
   ```bash
   # In Railway dashboard:
   # New Project → GitHub → Select repo → Deploy
   ```

2. **Set Environment Variables**
   ```bash
   # Railway Dashboard → Environment → Add variables
   # (Use values from .env.example, not .env.local)
   ```

3. **Deploy**
   ```bash
   # Railway automatically deploys on git push
   git push origin main
   ```

### Option B: Deploy via CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Set environment variables
railway variables set STRIPE_SECRET_KEY sk_live_xxxxx
railway variables set RESEND_API_KEY re_xxxxx
railway variables set maxikay_API_KEY xxxxx

# Deploy
railway deploy
```

## Architecture Highlights

### Stateless Design
- No local file storage (use maxikay file uploads)
- No in-memory caches (use Redis if needed)
- All state in PostgreSQL database
- Horizontally scalable

### Backend Functions (Serverless)
All backend operations are environment-aware:
- `sendOtp()` — reads `OTP_EXPIRY_MINUTES`
- `setupStripe()` — reads `STRIPE_SECRET_KEY`, `STRIPE_REDIRECT_URL`
- `processPayout()` — reads `STRIPE_SECRET_KEY`, `DISCORD_WEBHOOK_URL`
- `automateMatch()` — reads `DISCORD_WEBHOOK_URL`

### Database Schema
- All entities auto-synced via maxikay SDK
- No manual SQL migrations needed
- Row-level security via `tenant_id` filtering
- Built-in audit logging with `created_by`, `updated_date`

## Monitoring & Debugging

### Logs
```bash
# View live logs
railway logs

# View function logs
railway logs --service backend-functions
```

### Health Checks
```bash
# Test OTP function
curl -X POST https://yourdomain.com/api/functions/sendOtp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Expected response:
# { "success": true, "message": "OTP sent to test@example.com" }
```

### Error Tracking
Add Sentry for production error tracking:
```bash
railway variables set SENTRY_DSN https://xxxxx@sentry.io/xxxxx
```

## Scaling Considerations

### Database
- PostgreSQL auto-scales with Railway
- Add read replicas if needed (Settings → Advanced)
- Connection pooling handled by maxikay SDK

### Functions
- All functions are stateless
- Auto-scales based on demand
- No cold start issues (Express.js on Railway)

### File Storage
- Use maxikay's integrated file storage (auto S3-backed)
- No local `/tmp` persistence between requests
- All uploads go through `maxikay.integrations.Core.UploadFile()`

## Common Issues

### 500 Errors on OTP
**Check:** `OTP_EXPIRY_MINUTES` set in Railway env vars
```bash
railway variables get OTP_EXPIRY_MINUTES
```

### Stripe Payouts Failing
**Check:**
1. `STRIPE_SECRET_KEY` is correct (sk_live, not sk_test)
2. Connected account (`stripe_account_id`) is onboarded
3. Bank details verified in Stripe dashboard

### Email Not Sending
**Check:**
1. `RESEND_API_KEY` is valid
2. `MAIL_FROM` matches verified sender domain in Resend
3. Recipient not in spam filter

## Security Best Practices

✅ **All secrets in environment variables** (never in code)
✅ **HTTPS only** (Railway auto-enforces)
✅ **Database encrypted** (Railway default)
✅ **No hardcoded API keys** (checked via linting)
✅ **Rate limiting** (configure at Railway level)
✅ **CORS configured** (set in TenantThemeProvider)

## Rollback

```bash
# Revert to previous deployment
railway rollback

# Or redeploy specific commit
git checkout <commit-hash>
git push origin main
```

## Next Steps

1. ✅ Configure `.env` variables in Railway
2. ✅ Deploy main branch
3. ✅ Test OTP flow: `/onboarding`
4. ✅ Test Stripe: Complete onboarding
5. ✅ Monitor logs for errors
6. ✅ Set up Discord webhook for notifications

## Support

- Railway Docs: https://railway.app/docs
- maxikay SDK: https://docs.maxikay.io
- Stripe API: https://stripe.com/docs/api