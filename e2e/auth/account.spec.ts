import { expect, test } from '@playwright/test';
import {
  createUser,
  dumpDexie,
  hasSupabase,
  openSettings,
  SKIP_REASON,
  signInUi,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

let userA: TestUser;
let userB: TestUser;
test.beforeAll(async () => {
  userA = await createUser('acct-a');
  userB = await createUser('acct-b');
});

test('account switch wipes the previous user cache and shows lb defaults', async ({ page }) => {
  await signInUi(page, userA);
  await openSettings(page);
  await page.getByRole('radio', { name: 'kg' }).click();
  await expect(page.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 });

  await signInUi(page, userB);
  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(userB.email)).toBeVisible();

  const dump = JSON.stringify(await dumpDexie(page));
  expect(dump).not.toContain(userA.id);
  expect(dump).not.toContain(userA.email);
});

test('sign-out is blocked while changes are pending until the user confirms', async ({
  page,
  context,
}) => {
  await signInUi(page, userA);
  await openSettings(page);
  await context.setOffline(true);
  await page.getByRole('radio', { name: 'kg' }).click();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/unsynced change/);
  await expect(page.getByText(userA.email)).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(userA.email)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out anyway' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
