import { expect, test } from '../fixtures';
import { hasSupabase, PASSWORD, SKIP_REASON } from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

test('a new user can create an account and land in their own empty app', async ({ page }) => {
  const email = `signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto('./');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const welcome = page.getByRole('dialog', { name: 'Welcome to Lift' });
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Skip' }).click();
  await expect(welcome).toHaveCount(0);
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByText(/No workouts yet/i)).toBeVisible();
});
