import { test, expect } from '@playwright/test';

const ORG_EMAIL = process.env.PLAYWRIGHT_ORG_EMAIL || 'organizer@arena.local';
const ORG_PASSWORD = process.env.PLAYWRIGHT_ORG_PASSWORD || 'organizer123';

test('organizer can open tournaments list after login', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(ORG_EMAIL);
  await page.locator('#password').fill(ORG_PASSWORD);
  await page.getByRole('button', { name: 'Initialize Session' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 25_000 });
  await page.goto('/league/tournaments');
  await expect(page).toHaveURL(/\/league\/tournaments/);
  await expect(page.getByRole('heading', { name: 'Tournaments', exact: true })).toBeVisible({ timeout: 15_000 });
});
