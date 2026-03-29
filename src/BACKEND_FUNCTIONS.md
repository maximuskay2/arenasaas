# Backend Functions Guide

## Overview
All backend functions are Railway-compatible and use environment variables for configuration. No hardcoded secrets.

## Functions

### 1. **sendOtp** - Email verification
```javascript
import { sendOtp } from '@/backend-functions/sendOtp';

const result = await sendOtp('user@example.com');
// Returns: { success: true, message: '...' }
```
**Env vars:** `OTP_EXPIRY_MINUTES` (default: 5)

### 2. **verifyOtp** - Validate OTP code
```javascript
import { verifyOtp } from '@/backend-functions/verifyOtp';

const result = await verifyOtp('user@example.com', '123456');
// Returns: { success: true, message: 'Email verified' }
```

### 3. **setupStripe** - Stripe Connect onboarding
```javascript
import { setupStripe } from '@/backend-functions/setupStripe';

const result = await setupStripe('captain@team.com', tenantId);
// Returns: { success: true, redirectUrl: '...', accountId: '...' }
```
**Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_REDIRECT_URL`

### 4. **processPayout** - Prize distribution
```javascript
import { processPayout } from '@/backend-functions/processPayout';

const result = await processPayout(prizePaymentId);
// Returns: { success: true, payoutId: '...' }
```
**Env vars:** `STRIPE_SECRET_KEY`

### 5. **automateMatch** - Check-in & forfeit
```javascript
import { enforceCheckIn, startMatch } from '@/backend-functions/automateMatch';

// Auto-forfeit teams that don't check in
const result = await enforceCheckIn(matchId);

// Start match
const result = await startMatch(matchId);
```
**Env vars:** `DISCORD_WEBHOOK_URL` (optional)

## Railway Deployment

1. **Set environment variables** in Railway dashboard
2. **Copy `.env.example` → `.env.local`** for local development
3. **Database:** Railway auto-provisions PostgreSQL
4. **Functions:** maxikay SDK handles execution via backend function endpoints

## Calling from Frontend

```javascript
// In React components/pages:
const response = await maxikay.functions.sendOtp({ email: 'user@example.com' });
```

## Database Entities Required
- `OTPRecord` - for email verification
- `TenantConfig` - stores `stripe_account_id`
- `PrizePayment` - prize payout records
- `Match` - tournament matches
- `User` - extended with `stripe_customer_id`

## Security Best Practices
- ✅ All secrets in env vars (no hardcodes)
- ✅ OTP expires after 5 minutes
- ✅ One-time use OTP codes
- ✅ Stripe account verification required
- ✅ Discord webhook optional (for logging)

## Testing Locally

```bash
# Install dependencies
npm install stripe

# Set local .env.local
cp .env.example .env.local
# Edit .env.local with test keys

# Run functions locally with maxikay CLI
maxikay dev
``