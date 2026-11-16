import { expect, test } from '../fixtures';
import {
  createUser,
  hasSupabase,
  SKIP_REASON,
  signInUi,
  waitForServiceWorker,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

let user: TestUser;
test.beforeAll(async () => {
  user = await createUser('offline');
});

test('offline reopen shows the shell and an Offline status', async ({ page, context }) => {
  await signInUi(page, user);
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sync status: Offline/ })).toBeVisible();
});

test('expired token while offline still opens the shell', async ({ page, context }) => {
  await signInUi(page, user);
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.evaluate(() => {
    const raw = localStorage.getItem('lift-auth');
    if (!raw) throw new Error('no lift-auth session in localStorage');
    const session = JSON.parse(raw) as { expires_at: number };
    session.expires_at = 1;
    localStorage.setItem('lift-auth', JSON.stringify(session));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveCount(0);
});
