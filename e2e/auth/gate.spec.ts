import { expect, test } from '@playwright/test';
import { createUser, hasSupabase, PASSWORD, SKIP_REASON, signInUi, type TestUser } from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

let user: TestUser;
test.beforeAll(async () => {
  user = await createUser('gate');
});

test('sign-in gate: bad password shows inline error, good sign-in shows 4 tabs', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Lift', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(`${PASSWORD}-wrong`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  await signInUi(page, user);
  const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
  await expect(tabs).toHaveCount(4);
  await expect(tabs).toHaveText(['Workout', 'History', 'Progress', 'Exercises']);
});
