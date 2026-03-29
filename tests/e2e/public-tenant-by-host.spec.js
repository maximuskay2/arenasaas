import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:3001';
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL || 'admin@arena.local';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'admin123';

async function apiLogin(request, email, password) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`login failed ${res.status()}: ${await res.text()}`);
  }
  const j = await res.json();
  return j.token;
}

test.describe('GET /api/public/tenant-by-host', () => {
  test('unknown host returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/public/tenant-by-host?host=nosuch.invalid.e2e`);
    expect(res.status()).toBe(404);
  });

  test('returns tenant shell JSON after custom_domain is set on tenant_config', async ({ request }) => {
    const token = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const tRes = await request.get(`${API}/api/v1/Tenant?slug=dev-league`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tRes.ok()).toBeTruthy();
    const tenants = await tRes.json();
    const tid = tenants[0]?.id;
    expect(tid, 'seeded dev-league tenant').toBeTruthy();

    const cfgRes = await request.get(`${API}/api/v1/TenantConfig?tenant_id=${encodeURIComponent(tid)}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tid },
    });
    expect(cfgRes.ok()).toBeTruthy();
    const configs = await cfgRes.json();
    const cfgId = configs[0]?.id;
    expect(cfgId).toBeTruthy();

    const host = `e2e-${Date.now()}.arena.local`;
    const patch = await request.patch(`${API}/api/v1/TenantConfig/${cfgId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': tid,
        'Content-Type': 'application/json',
      },
      data: { custom_domain: host },
    });
    if (!patch.ok()) {
      throw new Error(`patch TenantConfig failed ${patch.status()}: ${await patch.text()}`);
    }

    const byHost = await request.get(`${API}/api/public/tenant-by-host?host=${encodeURIComponent(host)}`);
    expect(byHost.ok()).toBeTruthy();
    const data = await byHost.json();
    expect(data.slug).toBe('dev-league');
    expect(data.tenant_id).toBeTruthy();
  });
});
