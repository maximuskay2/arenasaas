/**
 * Initialize Stripe Connect onboarding flow
 * Railway env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_REDIRECT_URL
 */

import { maxikay } from '../api/arenaClient.js';

const Stripe = require('stripe');

export async function setupStripe(email, tenantId) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const redirectUrl = process.env.STRIPE_REDIRECT_URL;

    if (!stripeSecretKey || !redirectUrl) {
      return {
        success: false,
        error: 'Stripe not configured. Contact support.',
      };
    }

    if (!email || !tenantId) {
      return {
        success: false,
        error: 'Missing email or tenant ID',
      };
    }

    const stripe = new Stripe(stripeSecretKey);

    // Create connected account
    const account = await stripe.accounts.create({
      type: 'express',
      email,
      business_type: 'individual',
      requested_capabilities: ['card_payments', 'transfers'],
      country: 'US',
      default_currency: 'usd',
    });

    // Store account ID on tenant config
    const tenantConfigs = await maxikay.entities.TenantConfig.filter({ tenant_id: tenantId }, '-created_date', 1);
    if (tenantConfigs && tenantConfigs.length > 0) {
      await maxikay.entities.TenantConfig.update(tenantConfigs[0].id, {
        stripe_account_id: account.id,
      });
    }

    // Generate onboarding link
    const link = await stripe.accountLinks.create({
      account: account.id,
      type: 'account_onboarding',
      refresh_url: redirectUrl,
      return_url: redirectUrl,
    });

    return {
      success: true,
      redirectUrl: link.url,
      accountId: account.id,
    };
  } catch (err) {
    console.error('[setupStripe] Error:', err.message);
    return {
      success: false,
      error: `Stripe setup failed: ${err.message}`,
    };
  }
}