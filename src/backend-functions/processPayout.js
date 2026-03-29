/**
 * Process prize payouts via Stripe Connect
 * Railway env: STRIPE_SECRET_KEY, DISCORD_WEBHOOK_URL (optional)
 */

import { maxikay } from '../api/arenaClient.js';

const Stripe = require('stripe');

export async function processPayout(prizePaymentId) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return {
        success: false,
        error: 'Stripe not configured',
      };
    }

    const prizePayment = await maxikay.entities.PrizePayment.filter({ id: prizePaymentId }).then(r => r[0]);
    if (!prizePayment) {
      return { success: false, error: 'Prize payment not found' };
    }

    if (prizePayment.status === 'sent' || prizePayment.status === 'confirmed') {
      return { success: false, error: 'Payout already processed' };
    }

    // Get tenant config for Stripe account
    const tenantConfig = await maxikay.entities.TenantConfig.filter({ tenant_id: prizePayment.tenant_id }).then(r => r[0]);
    if (!tenantConfig?.stripe_account_id) {
      return { success: false, error: 'Stripe account not configured for tenant' };
    }

    const stripe = new Stripe(stripeSecretKey);

    // Create payout
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(prizePayment.prize_amount * 100), // Convert to cents
        currency: prizePayment.currency.toLowerCase(),
        description: `Prize for ${prizePayment.team_name} - ${prizePayment.placement}${getPlacementSuffix(prizePayment.placement)} place`,
      },
      {
        stripeAccount: tenantConfig.stripe_account_id,
      }
    );

    // Update prize payment record
    await maxikay.entities.PrizePayment.update(prizePaymentId, {
      status: 'sent',
      payment_reference: payout.id,
    });

    // Log to Discord if configured
    if (process.env.DISCORD_WEBHOOK_URL) {
      await sendDiscordNotification(
        `💰 **Payout Processed**: ${prizePayment.team_name} - $${prizePayment.prize_amount} (Payout ID: ${payout.id})`
      );
    }

    return {
      success: true,
      payoutId: payout.id,
      message: `Payout of $${prizePayment.prize_amount} sent to ${prizePayment.team_name}`,
    };
  } catch (err) {
    console.error('[processPayout] Error:', err.message);
    return {
      success: false,
      error: `Payout failed: ${err.message}`,
    };
  }
}

function getPlacementSuffix(placement) {
  if (placement === 1) return 'st';
  if (placement === 2) return 'nd';
  if (placement === 3) return 'rd';
  return 'th';
}

async function sendDiscordNotification(message) {
  try {
    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.warn('Discord notification failed:', err.message);
  }
}