import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  createTemplate,
  createUser,
  deleteAllUi,
  dumpDexie,
  exportBackupUi,
  hasSupabase,
  importBackupUi,
  logBenchWorkout,
  logWeighIn,
  mainNav,
  openSettings,
  POLL,
  readRemoteBodyweight,
  readRemoteExercises,
  readRemoteSettings,
  readRemoteTemplates,
  readRemoteWorkouts,
  SKIP_REASON,
  signInUi,
  snapshotData,
  syncNowUi,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const BUILT_INS = 98;

async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'));
}

async function liveCounts(user: TestUser) {
  const [workouts, templates, bodyweight, exercises] = await Promise.all([
    readRemoteWorkouts(user),
    readRemoteTemplates(user),
    readRemoteBodyweight(user),
    readRemoteExercises(user),
  ]);
  return {
    workouts: workouts.filter((w) => w.deleted_at === null && w.status === 'completed').length,
    templates: templates.filter((t) => t.deleted_at === null).length,
    bodyweight: bodyweight.filter((b) => b.deleted_at === null).length,
    builtIns: exercises.filter((e) => e.deleted_at === null && !e.is_custom).length,
    custom: exercises.filter((e) => e.deleted_at === null && e.is_custom).length,
  };
}

async function openHistory(page: Page): Promise<void> {
  await mainNav(page, 'History').click();
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
}

async function seedUser(page: Page, user: TestUser): Promise<void> {
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  await logBenchWorkout(page, 135);
  await page.waitForTimeout(1100);
  await logBenchWorkout(page, 145);
  await logWeighIn(page, '178.4');
  await createTemplate(page, 'Push Day', 'Barbell Bench Press');
  await openSettings(page);
  await page.getByRole('radio', { name: 'kg' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await readRemoteSettings(user))?.unit, POLL).toBe('kg');
  await page.getByRole('button', { name: 'Back' }).click();
  await syncNowUi(page);
}

test('Flow E: export, delete all, import restores everything', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const user = await createUser('flow-e');
  await seedUser(page, user);

  await expect
    .poll(() => liveCounts(user), POLL)
    .toEqual({ workouts: 2, templates: 1, bodyweight: 1, builtIns: BUILT_INS, custom: 0 });
  const prOf = (ws: Awaited<ReturnType<typeof readRemoteWorkouts>>) =>
    ws.filter((w) => w.deleted_at === null && w.exercises[0]?.sets[0]?.isPR === true);
  const remoteBefore = prOf(await readRemoteWorkouts(user))[0];
  expect(remoteBefore).toBeDefined();
  const settingsBefore = await readRemoteSettings(user);
  const before = await snapshotData(page);
  expect(before.workouts).toHaveLength(2);
  expect(before.templates).toHaveLength(1);
  expect(before.bodyweight).toHaveLength(1);

  // Export.
  await openSettings(page);
  const filePath = testInfo.outputPath('backup.json');
  const { fileName, text } = await exportBackupUi(page, filePath);
  expect(fileName).toMatch(/^lift-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const parsed = JSON.parse(text) as {
    format: string;
    userId: string;
    workouts: unknown[];
    templates: unknown[];
    bodyweight: unknown[];
  };
  expect(parsed.format).toBe('lift-backup');
  expect(parsed.userId).toBe(user.id);
  expect(parsed.workouts).toHaveLength(2);
  expect(parsed.templates).toHaveLength(1);
  expect(parsed.bodyweight).toHaveLength(1);

  // Delete all data.
  await deleteAllUi(page);
  expect(await isDark(page)).toBe(true);
  await expect(page.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Push Day', exact: true })).toHaveCount(0);
  await openHistory(page);
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(0);
  await expect
    .poll(async () => {
      const dump = await dumpDexie(page);
      const exercises = (dump.exercises ?? []) as { isCustom?: boolean }[];
      return {
        workouts: dump.workouts?.length,
        templates: dump.templates?.length,
        bodyweight: dump.bodyweight?.length,
        outbox: dump.syncQueue?.length,
        builtIns: exercises.filter((e) => !e.isCustom).length,
        custom: exercises.filter((e) => e.isCustom).length,
      };
    }, POLL)
    .toEqual({
      workouts: 0,
      templates: 0,
      bodyweight: 0,
      outbox: 0,
      builtIns: BUILT_INS,
      custom: 0,
    });
  await expect
    .poll(() => liveCounts(user), POLL)
    .toEqual({ workouts: 0, templates: 0, bodyweight: 0, builtIns: BUILT_INS, custom: 0 });
  await expect.poll(async () => (await readRemoteSettings(user))?.unit, POLL).toBe('lb');

  // Import and Replace.
  await mainNav(page, 'Workout').click();
  await openSettings(page);
  await importBackupUi(page, filePath);

  // Everything restored locally.
  await expect.poll(async () => (await snapshotData(page)).workouts.length, POLL).toBe(2);
  const after = await snapshotData(page);
  expect(after.workouts).toEqual(before.workouts);
  expect(after.templates).toEqual(before.templates);
  expect(after.bodyweight).toEqual(before.bodyweight);
  expect(after.exercises).toEqual(before.exercises);
  expect(after.settings).toEqual(before.settings);
  await expect(page.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  expect(await isDark(page)).toBe(false);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Push Day', exact: true })).toBeVisible();
  await openHistory(page);
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('main').getByRole('img', { name: /personal record/ })).toHaveCount(1);

  // Server restored too.
  await expect
    .poll(() => liveCounts(user), POLL)
    .toEqual({ workouts: 2, templates: 1, bodyweight: 1, builtIns: BUILT_INS, custom: 0 });
  const remoteAfter = await readRemoteWorkouts(user);
  expect(remoteAfter.filter((w) => w.deleted_at === null && w.status === 'completed')).toHaveLength(
    2,
  );
  expect(prOf(remoteAfter)).toHaveLength(1);
  expect(prOf(remoteAfter)[0]?.id).toBe(remoteBefore?.id);
  await expect.poll(async () => await readRemoteSettings(user), POLL).toEqual(settingsBefore);
  const bw = (await readRemoteBodyweight(user)).filter((b) => b.deleted_at === null);
  expect(bw[0]?.weight_kg).toBe(80.921);
});

test('cross-account import: A file into B shows data under B, A untouched', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const userA = await createUser('flow-e-a');
  const userB = await createUser('flow-e-b');
  await seedUser(page, userA);
  await expect
    .poll(() => liveCounts(userA), POLL)
    .toEqual({ workouts: 2, templates: 1, bodyweight: 1, builtIns: BUILT_INS, custom: 0 });
  await openSettings(page);
  const filePath = testInfo.outputPath('a-backup.json');
  await exportBackupUi(page, filePath);
  const aWorkoutsBefore = await readRemoteWorkouts(userA);
  const aTemplatesBefore = await readRemoteTemplates(userA);
  const aBodyweightBefore = await readRemoteBodyweight(userA);
  const aExercisesBefore = await readRemoteExercises(userA);
  const aSettingsBefore = await readRemoteSettings(userA);

  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const pageB = await ctxB.newPage();
    await signInUi(pageB, userB);
    await pageB.waitForTimeout(3000);
    await openSettings(pageB);
    await pageB.getByLabel('Backup file').setInputFiles(filePath);
    const sheet = pageB.getByRole('dialog', { name: 'Import backup' });
    await expect(sheet).toContainText('From a different account');
    await expect(sheet).toContainText('2 workouts');
    await pageB.getByRole('button', { name: 'Replace all data' }).click();
    await pageB
      .getByRole('dialog', { name: 'Replace all data?' })
      .getByRole('button', { name: 'Replace all data' })
      .click();
    await expect(pageB.getByText(/Backup imported|couldn't sync yet/)).toBeVisible({
      timeout: 30_000,
    });

    await expect(pageB.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
    await pageB.getByRole('button', { name: 'Back' }).click();
    await expect(pageB.getByRole('button', { name: 'Push Day', exact: true })).toBeVisible();
    await openHistory(pageB);
    await expect(pageB.getByRole('main').getByRole('listitem')).toHaveCount(2);
    await expect(pageB.getByRole('main').getByRole('img', { name: /personal record/ })).toHaveCount(
      1,
    );
    const dump = JSON.stringify(await dumpDexie(pageB));
    expect(dump).not.toContain(userA.id);

    await expect
      .poll(() => liveCounts(userB), POLL)
      .toEqual({ workouts: 2, templates: 1, bodyweight: 1, builtIns: BUILT_INS, custom: 0 });
    const bWorkouts = (await readRemoteWorkouts(userB)).filter((w) => w.deleted_at === null);
    expect(bWorkouts).toHaveLength(2);
    const aIds = aWorkoutsBefore.map((w) => w.id);
    for (const w of bWorkouts) expect(aIds).not.toContain(w.id);
    expect(bWorkouts.filter((w) => w.exercises[0]?.sets[0]?.isPR === true)).toHaveLength(1);
    await expect.poll(async () => (await readRemoteSettings(userB))?.unit, POLL).toBe('kg');
  } finally {
    await ctxB.close();
  }

  expect(await readRemoteWorkouts(userA)).toEqual(aWorkoutsBefore);
  expect(await readRemoteTemplates(userA)).toEqual(aTemplatesBefore);
  expect(await readRemoteBodyweight(userA)).toEqual(aBodyweightBefore);
  expect(await readRemoteExercises(userA)).toEqual(aExercisesBefore);
  expect(await readRemoteSettings(userA)).toEqual(aSettingsBefore);
});
