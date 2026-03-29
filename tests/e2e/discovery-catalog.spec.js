import { test, expect } from '@playwright/test';

test.describe('GET /api/public/tournaments-catalog', () => {
  test('returns paginated JSON', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:3001/api/public/tournaments-catalog?page=1&limit=5');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.items)).toBeTruthy();
  });
});

test.describe('GET /api/public/tournaments (alias)', () => {
  test('matches catalog shape', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:3001/api/public/tournaments?page=1&limit=3');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total_pages');
  });
});

test.describe('GET /api/public/payment-rails', () => {
  test('returns boolean flags and recommended_order', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:3001/api/public/payment-rails');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('stripe');
    expect(body).toHaveProperty('paystack');
    expect(body).toHaveProperty('flutterwave');
    expect(typeof body.stripe).toBe('boolean');
    expect(Array.isArray(body.recommended_order)).toBeTruthy();
  });

  test('NGN query prefers paystack/flutterwave order in recommended_order', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:3001/api/public/payment-rails?currency=NGN');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.recommended_order)).toBeTruthy();
    if (body.recommended_order.length >= 2) {
      const iPs = body.recommended_order.indexOf('paystack');
      const iFw = body.recommended_order.indexOf('flutterwave');
      const iSt = body.recommended_order.indexOf('stripe');
      if (iPs !== -1 && iFw !== -1) expect(iPs).toBeLessThan(iFw);
      if (iFw !== -1 && iSt !== -1) expect(iFw).toBeLessThan(iSt);
    }
  });
});
