import { expect, test } from '../fixtures';
import {
  createUser,
  hasSupabase,
  logBenchWorkout,
  logWeighIn,
  mainNav,
  POLL,
  readRemoteBodyweight,
  readRemoteWorkouts,
  SKIP_REASON,
  signInUi,
  waitForServiceWorker,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);
test.use({ allowedConsoleErrors: [/net::ERR_INTERNET_DISCONNECTED/] });

test('19.7: full workout and weigh-in offline sync once online, no duplicates', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const user = await createUser('offline-sync');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  await waitForServiceWorker(page);

  await expect(page.getByRole('button', { name: /Sync status: Synced/ })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sync status: Offline/ })).toBeVisible();
  await logBenchWorkout(page, 135);
  await logWeighIn(page, '178.4');
  await mainNav(page, 'Workout').click();
  expect((await readRemoteWorkouts(user)).filter((w) => w.status === 'completed')).toHaveLength(0);
  expect(await readRemoteBodyweight(user)).toHaveLength(0);
  await expect(
    page.getByRole('button', { name: /Sync status: Offline, \d+ pending/ }),
  ).toBeVisible();

  await context.setOffline(false);
  await expect
    .poll(
      async () => (await readRemoteWorkouts(user)).filter((w) => w.status === 'completed').length,
      POLL,
    )
    .toBe(1);
  await expect.poll(async () => (await readRemoteBodyweight(user)).length, POLL).toBe(1);

  await mainNav(page, 'Workout').click();
  await expect(page.getByRole('button', { name: /Sync status: Synced/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(2000);
  const workouts = await readRemoteWorkouts(user);
  expect(workouts).toHaveLength(1);
  expect(workouts[0]?.status).toBe('completed');
  expect(workouts[0]?.deleted_at).toBeNull();
  const bw = await readRemoteBodyweight(user);
  expect(bw).toHaveLength(1);
  expect(bw[0]?.weight_kg).toBe(80.921);
});

test('expired token while offline opens from cache, then syncs once online', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const user = await createUser('expired-sync');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  await waitForServiceWorker(page);

  await expect(page.getByRole('button', { name: /Sync status: Synced/ })).toBeVisible();
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
  await expect(page.getByRole('button', { name: /Sync status: Offline/ })).toBeVisible();

  await logWeighIn(page, '180');
  expect(await readRemoteBodyweight(user)).toHaveLength(0);

  await context.setOffline(false);
  await expect.poll(async () => (await readRemoteBodyweight(user)).length, POLL).toBe(1);
  await mainNav(page, 'Workout').click();
  await expect(page.getByRole('button', { name: /Sync status: Synced/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel('Email')).toHaveCount(0);
  expect((await readRemoteBodyweight(user))[0]?.weight_kg).toBe(81.647);
});
