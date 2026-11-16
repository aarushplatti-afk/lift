import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
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
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);
test.skip(process.env.PERF !== '1', 'Perf check is opt-in: set PERF=1');

const DAY = 86_400_000;
const COUNT = 2000;

declare global {
  interface Window {
    __longTasks: number[];
  }
}

function dots(page: Page): Locator {
  return page.locator('.lift-chart .recharts-line-dots .recharts-dot');
}

function buildHistory(benchId: string, now: number): RemoteWorkoutInsert[] {
  const rows: RemoteWorkoutInsert[] = [];
  for (let i = 0; i < COUNT; i++) {
    const startedAt = now - (COUNT - i) * DAY;
    const lb = 135 + Math.round(i / 20) + (i % 7) * 2;
    rows.push({
      id: randomUUID(),
      name: `Bench ${String(i)}`,
      started_at: new Date(startedAt).toISOString(),
      ended_at: new Date(startedAt + 45 * 60_000).toISOString(),
      status: 'completed',
      exercises: [
        {
          id: randomUUID(),
          exerciseId: benchId,
          order: 0,
          sets: [0, 1, 2].map((s) => ({
            id: randomUUID(),
            order: s,
            type: 'normal' as const,
            weightKg: Math.round(lb * 0.45359237 * 10_000) / 10_000,
            reps: 5,
            completed: true,
            completedAt: startedAt,
          })),
        },
      ],
    });
  }
  return rows;
}

test('Progress perf: 2000 Bench workouts @perf', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  });

  const user = await createUser('progress-perf');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  let benchId = '';
  await expect
    .poll(
      async () => {
        benchId =
          (await readRemoteExercises(user)).find((e) => e.name === 'Barbell Bench Press')?.id ?? '';
        return benchId !== '';
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  await insertRemoteWorkouts(user, buildHistory(benchId, Date.now()));
  await openSettings(page);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Pending changes')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  // Wait for the pull to land: History shows the newest workout.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'History' })
    .click();
  await expect(page.getByRole('main').getByRole('listitem').first()).toBeVisible({
    timeout: 120_000,
  });
  await page.waitForTimeout(5000);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Workout' })
    .click();

  // First dot within 1500 ms of the tab tap (lazy chunk and chart included).
  const tab = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Progress' });
  const t0 = Date.now();
  await tab.click();
  await dots(page).first().waitFor({ state: 'visible', timeout: 10_000 });
  const firstDotMs = Date.now() - t0;

  // All, then All -> 3M timing.
  await page.getByRole('radio', { name: 'All' }).click();
  await expect.poll(() => dots(page).count()).toBeGreaterThan(200);
  const allDots = await dots(page).count();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__longTasks = [];
  });
  const t1 = Date.now();
  await page.getByRole('radio', { name: '3M' }).click();
  await expect.poll(() => dots(page).count(), { intervals: [10] }).toBeLessThan(150);
  const rangeMs = Date.now() - t1;
  const longTasks = await page.evaluate(() => window.__longTasks);
  const worstTask = Math.max(0, ...longTasks);

  console.log(
    `PERF firstDot=${String(firstDotMs)}ms allToThreeM=${String(rangeMs)}ms allDots=${String(allDots)} longestTask=${String(Math.round(worstTask))}ms`,
  );
  expect(firstDotMs).toBeLessThan(1500);
  expect(rangeMs).toBeLessThan(500);
  expect(allDots).toBeLessThanOrEqual(500);
  expect(worstTask).toBeLessThan(200);
});
