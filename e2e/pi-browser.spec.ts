import { test, expect } from '@playwright/test';

// What a Pioneer sees on a phone in Pi Browser (App Excellence Standard E14). The
// Pi SDK itself cannot run here — this proves the screens around it render, in the
// user agent and viewport that matter, and that nothing depends on a desktop.

test.beforeEach(async ({ page }) => {
  const ua = await page.evaluate(() => navigator.userAgent);
  expect(ua).toContain('PiBrowser');
});

test('the home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/TEC/);
});

test('/app opens on the sign-in door when there is no session', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('button', { name: 'Sign in with Pi' })).toBeVisible();
});

test('help & feedback is reachable and the form is there', async ({ page }) => {
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help & feedback' })).toBeVisible();
  await expect(page.getByLabel('Tell us what you think')).toBeVisible();
});

test('a link to nowhere lands on the not-found screen, with the way home', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to home' })).toBeVisible();
});
