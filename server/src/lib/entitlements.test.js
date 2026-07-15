import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMonthlySubscriptionUsable } from '../entitlements.js';

describe('isMonthlySubscriptionUsable', () => {
  it('allows active monthly without provider status', () => {
    assert.equal(isMonthlySubscriptionUsable({ is_active: true, status: 'active' }), true);
  });

  it('blocks past_due', () => {
    assert.equal(
      isMonthlySubscriptionUsable({
        is_active: true,
        status: 'active',
        subscription_status: 'past_due',
      }),
      false
    );
  });

  it('blocks canceled', () => {
    assert.equal(
      isMonthlySubscriptionUsable({
        is_active: true,
        status: 'active',
        subscription_status: 'canceled',
      }),
      false
    );
  });

  it('allows trialing', () => {
    assert.equal(
      isMonthlySubscriptionUsable({
        is_active: true,
        status: 'trial',
        subscription_status: 'trialing',
      }),
      true
    );
  });

  it('blocks inactive plan', () => {
    assert.equal(
      isMonthlySubscriptionUsable({
        is_active: false,
        status: 'active',
        subscription_status: 'active',
      }),
      false
    );
  });
});
