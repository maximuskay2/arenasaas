import { test, expect } from '@playwright/test';
import { CREDS } from './helpers/api.js';

/**
 * Browser path: organizer can open matches list after login.
 * Deep match UI depends on seeded fixtures; API lifecycle is covered in match-engine-api.spec.js.
 */
test('organizer reaches matches area after login', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(CREDS.organizer.email);
  await page.locator('#password').fill(CREDS.organizer.password);
  await page.getByRole('button', { name: 'Initialize Session' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 25_000 });

  await page.goto('/league/tournaments');
  await expect(page.getByRole('heading', { name: /tournament/i }).first()).toBeVisible({ timeout: 20_000 });
});
