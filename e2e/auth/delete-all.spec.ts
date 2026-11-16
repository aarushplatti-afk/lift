import { expect, test } from '../fixtures';
import {
  createTemplate,
  createUser,
  deleteAllUi,
  dumpDexie,
  hasSupabase,
  logBenchWorkout,
  logWeighIn,
  mainNav,
  openSettings,
  POLL,
  readRemoteWorkouts,
  SKIP_REASON,
  signInUi,
  syncNowUi,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

test('delete all on device A clears device B on its next sync', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const user = await createUser('delete-all');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  await logBenchWorkout(page, 135);
  await logWeighIn(page, '178.4');
  await createTemplate(page, 'Push Day', 'Barbell Bench Press');
  await syncNowUi(page);
  await expect
    .poll(
      async () => (await readRemoteWorkouts(user)).filter((w) => w.deleted_at === null).length,
      POLL,
    )
    .toBe(1);

  const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const pageB = await contextB.newPage();
    await signInUi(pageB, user);
    await expect(pageB.getByRole('button', { name: 'Push Day', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await mainNav(pageB, 'History').click();
    await expect(pageB.getByRole('main').getByRole('listitem')).toHaveCount(1, {
      timeout: 20_000,
    });

    await openSettings(page);
    await deleteAllUi(page);

    await syncNowUi(pageB);
    await mainNav(pageB, 'Workout').click();
    await expect(pageB.getByRole('button', { name: 'Push Day', exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });
    await mainNav(pageB, 'History').click();
    await expect(pageB.getByRole('main').getByRole('listitem')).toHaveCount(0);
    await expect
      .poll(async () => {
        const dump = await dumpDexie(pageB);
        const exercises = (dump.exercises ?? []) as { isCustom?: boolean }[];
        return {
          workouts: dump.workouts?.length,
          templates: dump.templates?.length,
          bodyweight: dump.bodyweight?.length,
          builtIns: exercises.filter((e) => !e.isCustom).length,
          custom: exercises.filter((e) => e.isCustom).length,
        };
      }, POLL)
      .toEqual({ workouts: 0, templates: 0, bodyweight: 0, builtIns: 98, custom: 0 });
  } finally {
    await contextB.close();
  }
});
