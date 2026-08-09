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

  // Now the shell itself: all four destinations, and real plan content. `exact`
  // matters — the weigh-in prompt card also contains the word "week".
  for (const tab of ['Now', 'Today', 'Week', 'Shop']) {
    await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
  }

  // A brand-new account has never weighed in, so the prompt is showing (I1).
  await expect(page.getByText(/Time for this week/)).toBeVisible();
  // The Week tab opens on today and expands another day on tap.
  //
  // Asserted as the accordion's invariant rather than by naming a weekday: an
  // earlier version of this test picked Sunday as "a day that isn't today", which
  // passed six days a week and failed on the seventh. Which day is open depends on
  // when the suite runs, so the test may not depend on the day at all.
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();

  const dayToggle = page.locator('li button[aria-expanded]');
  const openToggle = page.locator('li button[aria-expanded="true"]');
  await expect(dayToggle).toHaveCount(7);
  // Exactly one open on arrival — today's, auto-expanded.
  await expect(openToggle).toHaveCount(1);

  // Pinned by `aria-controls`, which does not change, rather than by
  // `[aria-expanded="false"]`, which does: a Playwright locator is a lazy query,
  // so a selector matching the attribute under test silently re-resolves to a
  // different element the moment the click changes it.
  const collapsedPanel = await page
    .locator('li button[aria-expanded="false"]')
    .first()
    .getAttribute('aria-controls');
  const target = page.locator(`li button[aria-controls="${collapsedPanel}"]`);

  await target.click();
  await expect(target).toHaveAttribute('aria-expanded', 'true');
  // Still exactly one: opening a day closes the one before it.
  await expect(openToggle).toHaveCount(1);

  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();

  expect(crashes, 'the page threw during boot').toEqual([]);
});
