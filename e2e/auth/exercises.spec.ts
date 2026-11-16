import { expect, test } from '../fixtures';
import { SEED_EXERCISES } from '../../src/db/seedData';
import {
  createUser,
  hasSupabase,
  readRemoteExercises,
  SKIP_REASON,
  signInUi,
  type RemoteExercise,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const POLL = { timeout: 10_000, intervals: [500, 1000] };

let user: TestUser;
test.beforeAll(async () => {
  user = await createUser('exercises');
});

const seeded = (rows: RemoteExercise[]) => rows.filter((r) => !r.is_custom && !r.deleted_at);

test('seed, create, delete and second-device convergence', async ({ page, browser }) => {
  await signInUi(page, user);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Exercises' })
    .click();
  await expect(page.getByRole('heading', { name: 'Exercises', level: 1 })).toBeVisible();
  await expect(page.getByText('Barbell Bench Press', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await expect
    .poll(async () => seeded(await readRemoteExercises(user)).length, POLL)
    .toBe(SEED_EXERCISES.length);

  await page.getByRole('link', { name: '+ New' }).click();
  await page.getByLabel('Name').fill('Zercher Squat');
  await page.getByLabel('Muscle group').selectOption('quads');
  await page.getByLabel('Equipment').selectOption('barbell');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Zercher Squat', level: 1 })).toBeVisible();

  await expect
    .poll(async () => {
      const rows = await readRemoteExercises(user);
      return rows.some((r) => r.name === 'Zercher Squat' && r.is_custom && !r.deleted_at);
    }, POLL)
    .toBe(true);

  await page.getByRole('button', { name: 'Delete exercise' }).click();
  await page
    .getByRole('dialog', { name: 'Delete exercise?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Exercises', level: 1 })).toBeVisible();

  await expect
    .poll(async () => {
      const rows = await readRemoteExercises(user);
      return rows.find((r) => r.name === 'Zercher Squat')?.deleted_at ?? null;
    }, POLL)
    .not.toBeNull();

  const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page2 = await context2.newPage();
    await signInUi(page2, user);
    await page2
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Exercises' })
      .click();
    await expect(page2.getByText('Barbell Bench Press', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page2.waitForTimeout(3000);

    const rows = await readRemoteExercises(user);
    expect(seeded(rows)).toHaveLength(SEED_EXERCISES.length);
    const live = rows.filter((r) => !r.deleted_at && !r.archived).map((r) => r.name.toLowerCase());
    expect(new Set(live).size).toBe(live.length);
  } finally {
    await context2.close();
  }
});
