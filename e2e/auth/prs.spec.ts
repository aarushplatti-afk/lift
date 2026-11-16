import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  createUser,
  hasSupabase,
  insertRemoteWorkouts,
  openSettings,
  readRemoteExercises,
  SKIP_REASON,
  signInUi,
  type RemoteWorkoutInsert,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const DAY = 86_400_000;
const KG_PER_LB = 0.45359237;

function kg(lb: number): number {
  return Math.round(lb * KG_PER_LB * 10_000) / 10_000;
}

function shortDate(ms: number): string {
  const d = new Date(ms);
  const base = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.getFullYear() === new Date().getFullYear()
    ? base
    : `${base}, ${String(d.getFullYear())}`;
}

interface SetSpec {
  weightKg: number;
  reps: number;
  type?: 'warmup' | 'normal';
}

function workout(
  exerciseId: string,
  startedAt: number,
  name: string,
  sets: SetSpec[],
): RemoteWorkoutInsert {
  return {
    id: randomUUID(),
    name,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(startedAt + 45 * 60_000).toISOString(),
    status: 'completed',
    exercises: [
      {
        id: randomUUID(),
        exerciseId,
        order: 0,
        sets: sets.map((s, i) => ({
          id: randomUUID(),
          order: i,
          type: s.type ?? 'normal',
          weightKg: s.weightKg,
          reps: s.reps,
          completed: true,
          completedAt: startedAt,
        })),
      },
    ],
  };
}

async function exerciseId(user: TestUser, name: string): Promise<string> {
  let id = '';
  await expect
    .poll(
      async () => {
        id = (await readRemoteExercises(user)).find((e) => e.name === name)?.id ?? '';
        return id !== '';
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return id;
}

async function openPRs(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Progress' })
    .click();
  await page.getByRole('radio', { name: 'PRs', exact: true }).click();
}

test('PRs view: records, filters and links', async ({ page }) => {
  // 1. Seed Bench and Pull-Up workouts remotely, then pull.
  const user = await createUser('prs');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  const benchId = await exerciseId(user, 'Barbell Bench Press');
  const pullId = await exerciseId(user, 'Pull-Up');
  const now = Date.now();
  const latest = now - 10 * DAY;
  await insertRemoteWorkouts(user, [
    workout(benchId, now - 20 * DAY, 'Bench early', [{ weightKg: kg(205), reps: 5 }]),
    workout(benchId, latest, 'Bench late', [
      { weightKg: kg(245), reps: 1, type: 'warmup' },
      { weightKg: kg(225), reps: 5 },
    ]),
    workout(pullId, now - 5 * DAY, 'Pull day', [{ weightKg: 20, reps: 5 }]),
  ]);
  await openSettings(page);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.getByRole('button', { name: 'Back' }).click();

  // 2. PRs view values and dates.
  await openPRs(page);
  const bench = page.getByRole('region', { name: 'Barbell Bench Press' });
  await expect(bench).toBeVisible({ timeout: 20_000 });
  await expect(bench).toContainText('225 lb');
  await expect(bench).toContainText('262.5 lb');
  await expect(bench).toContainText('1,125 lb');
  await expect(bench).toContainText(shortDate(latest));
  await expect(bench).not.toContainText('245 lb');
  const pull = page.getByRole('region', { name: 'Pull-Up' });
  await expect(pull).toContainText('+44.1 lb');

  // 3. Search and muscle chip.
  await page.getByRole('searchbox').fill('pull');
  await expect(pull).toBeVisible();
  await expect(bench).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('radio', { name: 'Chest', exact: true }).click();
  await expect(bench).toBeVisible();
  await expect(pull).toHaveCount(0);
  await page.getByRole('radio', { name: 'All', exact: true }).click();

  // 4. Record row opens the workout; header link opens Exercises with Bench selected.
  await bench.getByRole('link', { name: /Best weight/ }).click();
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]+$/);
  await expect(page.getByText('225 lb × 5')).toBeVisible();
  await page.goBack();
  await expect(bench).toBeVisible();
  await page.getByRole('link', { name: 'Barbell Bench Press progress' }).click();
  await expect(page.getByRole('radio', { name: 'Exercises', exact: true })).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Exercise: Barbell Bench Press. Change' }),
  ).toBeVisible();
});
