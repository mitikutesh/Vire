import { expect, test } from '@playwright/test';

/**
 * The one test that proves the built bundle boots in a real browser.
 *
 * It must reach past the auth gate: the sign-in screen renders the same "Vire"
 * wordmark as the app shell, so asserting on the wordmark alone would pass for a
 * build that never gets further than sign-in — and would also pass for a build
 * that crashes into an empty page in a way this exact test once did.
 */
test('the built app boots, onboards, and renders the four-tab shell', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', (error) => crashes.push(error.message));

  await page.goto('/');

  // Served with VITE_AUTH_MODE=fake, so any address may register.
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Password').fill('playwright-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  // The fake emails a fixed code.
  await page.getByLabel('Confirmation code').fill('123456');
  await page.getByRole('button', { name: 'Confirm my email' }).click();

  // First run: no profile means no calorie target, so setup comes before the
  // tabs. The defaults are valid, so accepting them is enough here.
  await expect(page.getByRole('heading', { name: 'Tell Vire about you' })).toBeVisible();
  await expect(page.getByText(/Mifflin-St Jeor/)).toBeVisible(); // guardrail 2
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // Second gate: every tab renders a week, so one has to exist first. The
  // starter path is taken here because it needs no provider and no key.
  await expect(page.getByRole('heading', { name: 'No plan for this week yet' })).toBeVisible();
  await page.getByRole('button', { name: /built-in Finnish starter plan/ }).click();

  // Now the shell itself: all four destinations, and real plan content.
  for (const tab of ['Now', 'Today', 'Week', 'Shop']) {
    await expect(page.getByRole('button', { name: tab })).toBeVisible();
  }
  // The Week tab opens on today and expands another day on tap — the one bit of
  // real interaction in the shell so far.
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  const sunday = page.getByRole('button', { name: /Sunday/ });
  await expect(sunday).toHaveAttribute('aria-expanded', 'false');
  await sunday.click();
  await expect(sunday).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Shop' }).click();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();

  expect(crashes, 'the page threw during boot').toEqual([]);
});
