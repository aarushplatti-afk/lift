import { expect, test } from '@playwright/test';

test('app shell loads offline after service worker is ready', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
});
