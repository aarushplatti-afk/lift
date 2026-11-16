import { expect, test } from '../fixtures';
import {
  createUser,
  hasSupabase,
  openSettings,
  readRemoteSettings,
  SKIP_REASON,
  signInUi,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

let user: TestUser;
test.beforeAll(async () => {
  user = await createUser('settings');
});

test('settings round trip: kg + light syncs to user_settings and persists after reload', async ({
  page,
}) => {
  await signInUi(page, user);
  await openSettings(page);
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('radio', { name: 'kg' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.getByText(/Example: 100 kg = 100 kg/)).toBeVisible();

  await expect
    .poll(async () => readRemoteSettings(user), { timeout: 10_000, intervals: [500, 1000] })
    .toMatchObject({ unit: 'kg', theme: 'light' });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});
