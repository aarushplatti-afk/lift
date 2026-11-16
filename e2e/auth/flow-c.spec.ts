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

function benchWorkout(
  exerciseId: string,
  now: number,
  daysAgo: number,
  sets: { lb: number; reps: number; type?: 'warmup' | 'normal' }[],
): RemoteWorkoutInsert {
  const startedAt = now - daysAgo * DAY;
  return {
    id: randomUUID(),
    name: `Bench ${String(daysAgo)}d`,
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
          weightKg: kg(s.lb),
          reps: s.reps,
          completed: true,
          completedAt: startedAt,
        })),
      },
    ],
  };
}

function nav(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
}

function tile(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=..');
}

function dots(page: Page): Locator {
  return page.locator('.lift-chart .recharts-line-dots .recharts-dot');
}

test('Flow C: Progress exercises view, ranges, tooltip, units and records', async ({ page }) => {
  // 1. Create user, sign in, wait for seeding, find Bench.
  const user = await createUser('flow-c');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  let benchId = '';
  await expect
    .poll(
      async () => {
        const found = (await readRemoteExercises(user)).find(
          (e) => e.name === 'Barbell Bench Press',
        );
        benchId = found?.id ?? '';
        return benchId !== '';
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  // 2. Insert four (third workout at 40 d, not the spec's 30 d: 1M reaches back 28-31 d, so 30 d is
  // month-length dependent and would leave 2 points in 1M, defeating the fallback step).
  // Insert four completed Bench workouts remotely, then pull via Sync now.
  const now = Date.now();
  const lastDay = now - 10 * DAY;
  await insertRemoteWorkouts(user, [
    benchWorkout(benchId, now, 150, [{ lb: 185, reps: 5 }]),
    benchWorkout(benchId, now, 60, [{ lb: 205, reps: 5 }]),
    benchWorkout(benchId, now, 40, [{ lb: 215, reps: 5 }]),
    benchWorkout(benchId, now, 10, [
      { lb: 245, reps: 1, type: 'warmup' },
      { lb: 225, reps: 5 },
    ]),
  ]);
  await openSettings(page);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();

  // 3. Progress, Exercises; select Barbell Bench Press via the selector.
  await nav(page, 'Progress').click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Exercises', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Exercise: .* Change$/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole('dialog', { name: 'Choose exercise' });
  await sheet.getByRole('searchbox').fill('Bench Press');
  await sheet.getByText('Barbell Bench Press', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Exercise: Barbell Bench Press. Change' }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Weight', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: '3M' })).toBeChecked();

  // 4. 3M: 3 dots, best 225 lb (warm-up excluded), +20 lb / +10%, 4 workouts, 1 week ago.
  await expect(dots(page)).toHaveCount(3, { timeout: 20_000 });
  await expect(tile(page, 'Current best')).toContainText('225 lb');
  await expect(tile(page, 'Change · 3M')).toContainText('+20 lb');
  await expect(tile(page, 'Change · 3M')).toContainText('+10%');
  await expect(tile(page, 'Workouts')).toContainText('4');
  await expect(tile(page, 'Last performed')).toContainText('1 week ago');

  // 5. Est. 1RM: 225 x 5 -> 262.5 lb.
  await page.getByRole('radio', { name: 'Est. 1RM' }).click();
  await expect(tile(page, 'Current best')).toContainText('262.5 lb');

  // 6. 6M: 4 dots; e1RM 215.8 -> 262.5 = +46.7 lb / +22%.
  await page.getByRole('radio', { name: '6M' }).click();
  await expect(dots(page)).toHaveCount(4);
  await expect(tile(page, 'Change · 6M')).toContainText('+46.7 lb');
  await expect(tile(page, 'Change · 6M')).toContainText('+22%');

  // 7. Tap the last dot: tooltip shows its date and the producing set.
  await dots(page).last().click({ force: true });
  const tooltip = page.locator('.recharts-tooltip-wrapper');
  await expect(tooltip).toContainText(shortDate(lastDay));
  await expect(tooltip).toContainText('225 lb × 5');

  // 8. 1M: fallback hint, all 4 dots remain.
  await page.getByRole('radio', { name: '1M' }).click();
  await expect(
    page.getByText('Fewer than 2 workouts in this range. Showing all time.'),
  ).toBeVisible();
  await expect(dots(page)).toHaveCount(4);

  // 9. First recent session links to its history detail.
  const first = page.getByRole('region', { name: 'Recent sessions' }).getByRole('link').first();
  await expect(first).toHaveAttribute('href', /\/history\/[0-9a-f-]+$/);
  await first.click();
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]+$/);
  await expect(page.getByText('225 lb × 5')).toBeVisible();

  // 10. Settings to kg; Progress remembers the selection: 262.5 lb e1RM = 119.1 kg.
  await nav(page, 'Workout').click();
  await openSettings(page);
  await page.getByRole('radio', { name: 'kg' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await nav(page, 'Progress').click();
  await expect(
    page.getByRole('button', { name: 'Exercise: Barbell Bench Press. Change' }),
  ).toBeVisible();
  await expect(tile(page, 'Current best')).toContainText('119.1 kg');

  // 11. Exercises -> Bench -> Records, then Chart -> View progress.
  await nav(page, 'Exercises').click();
  await page
    .getByRole('link', { name: /Barbell Bench Press/ })
    .first()
    .click();
  await page.getByRole('radio', { name: 'Records' }).click();
  // Spec says 510.3 kg, but P19 mandates formatVolume, which rounds to whole units (510 kg).
  const date = shortDate(lastDay);
  for (const [label, value] of [
    ['Best weight', '102.1 kg'],
    ['Best est. 1RM', '119.1 kg'],
    ['Best set volume', '510 kg'],
  ] as const) {
    const card = page.getByRole('link', { name: new RegExp(label.replace('.', '\\.')) });
    await expect(card).toContainText(value);
    await expect(card).toContainText(date);
  }
  await page.getByRole('radio', { name: 'Chart' }).click();
  await expect(dots(page).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('link', { name: 'View progress' }).click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Exercise: Barbell Bench Press. Change' }),
  ).toBeVisible();
});
