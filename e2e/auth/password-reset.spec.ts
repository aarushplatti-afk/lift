import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  createUser,
  dumpDexie,
  hasSupabase,
  latestEmailLink,
  openSettings,
  PASSWORD,
  SKIP_REASON,
  signInUi,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const NEW_PASSWORD = 'brand-new-password-9';

async function requestReset(page: Page, email: string): Promise<string> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible({
    timeout: 20_000,
  });
  return latestEmailLink(email, /access_token|token=|verify/);
}

test('forgot password: email link sets a new password, then manual sign-in', async ({ page }) => {
  const user = await createUser('reset');
  const link = await requestReset(page, user.email);

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible({
    timeout: 20_000,
  });
  expect(page.url()).not.toContain('access_token');

  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill('something-else-entirely');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Passwords don’t match.')).toBeVisible();

  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByLabel('Email')).toHaveValue(user.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toHaveCount(0);

  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto(link);
  await expect(page.getByText(/invalid or has expired/)).toBeVisible({ timeout: 20_000 });
});

test('a reset link opened while signed in as another user leaves that session and cache intact', async ({
  page,
  browser,
}) => {
  const userB = await createUser('reset-b');
  const target = await createUser('reset-target');

  const requester = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let link: string;
  try {
    link = await requestReset(await requester.newPage(), target.email);
  } finally {
    await requester.close();
  }

  await signInUi(page, userB);
  await page.waitForTimeout(2000);
  await page.route('**/rest/v1/**', (route) => route.abort());
  await openSettings(page);
  await page.getByRole('radio', { name: 'kg' }).click();
  await expect(page.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await openSettings(page);
  await expect(page.getByText(userB.email)).toBeVisible();
  await expect(page.getByText(target.email)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');

  const dump = await dumpDexie(page);
  const queue = (dump.syncQueue ?? []) as { table?: string }[];
  expect(queue.some((e) => e.table === 'user_settings')).toBe(true);
  expect(JSON.stringify(dump)).not.toContain(target.id);
});
