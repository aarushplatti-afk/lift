import { expect, test } from '@playwright/test';

test('app loads with title Lift', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Lift');
  await expect(
    page
      .getByRole('heading', { name: 'Workout', exact: true })
      .or(page.getByRole('heading', { name: 'Configuration error' }))
      .or(page.getByRole('heading', { name: 'Lift', exact: true })),
  ).toBeVisible();
});
