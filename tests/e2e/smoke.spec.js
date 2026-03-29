import { test, expect } from '@playwright/test';

test('marketing shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ArenaSaaS/i);
});
