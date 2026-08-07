import { expect, test } from '@playwright/test';

test('app shell loads and renders the Vire wordmark', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Vire')).toBeVisible();
});
