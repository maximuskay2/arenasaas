import { test, expect } from '@playwright/test';

const ORG_EMAIL = process.env.PLAYWRIGHT_ORG_EMAIL || 'organizer@arena.local';
const ORG_PASSWORD = process.env.PLAYWRIGHT_ORG_PASSWORD || 'organizer123';

test('organizer creates draft tournament and lands on detail page', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(ORG_EMAIL);
  await page.locator('#password').fill(ORG_PASSWORD);
  await page.getByRole('button', { name: 'Initialize Session' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 25_000 });
  // Full-page redirect can finish /me before waitForResponse runs — poll until organizer has a tenant.
  await page.waitForFunction(
    async () => {
      const t = localStorage.getItem('arena_access_token');
      if (!t) return false;
      try {
        const r = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${t}` },
          credentials: 'include',
        });
        if (!r.ok) return false;
        const u = await r.json();
        return !!(u.tenant_id || (Array.isArray(u.tenant_memberships) && u.tenant_memberships.length > 0));
      } catch {
        return false;
      }
    },
    { timeout: 20_000 }
  );

  await page.goto('/tournaments/new');
  await expect(page.getByRole('heading', { name: 'Create Tournament' })).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder(/Winter Championship/i).fill(`E2E Cup ${Date.now()}`);

  const gameTrigger = page.locator('form').getByRole('combobox').first();
  await gameTrigger.click();
  const firstGameOption = page.getByRole('option').first();
  await expect(firstGameOption).toBeVisible({ timeout: 15_000 });
  await firstGameOption.click();

  await page.locator('input[type="datetime-local"]').first().fill('2026-12-20T15:00');

  // React Router client navigation does not fire a full document load; `page.waitForURL` uses
  // waitForNavigation(load) and can time out even when the URL already changed. Assert URL via expect (polls).
  const createPost = page.waitForResponse(
    (r) => r.url().includes('/api/v1/Tournament') && r.request().method() === 'POST',
    { timeout: 25_000 }
  );
  await page.getByRole('button', { name: /CREATE TOURNAMENT/i }).click();
  const createRes = await createPost;
  const createBody = await createRes.text().catch(() => '');
  if (createRes.status() !== 201) {
    throw new Error(`POST /api/v1/Tournament → ${createRes.status()}: ${createBody.slice(0, 400)}`);
  }

  await expect(page).toHaveURL(
    (url) => {
      const pathname = url.pathname;
      const parts = pathname.split('/').filter(Boolean);
      return parts[0] === 'tournaments' && parts.length === 2 && parts[1] !== 'new';
    },
    { timeout: 25_000 }
  );
  await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/draft|teams|Open Registration/i).first()).toBeVisible({ timeout: 15_000 });
});
