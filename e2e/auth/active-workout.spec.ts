import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { createUser, hasSupabase, readRemoteWorkouts, SKIP_REASON, signInUi } from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const POLL = { timeout: 20_000, intervals: [500, 1000] };

async function startWithBench(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText('Barbell Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  await expect(page.getByRole('region', { name: 'Barbell Bench Press' })).toBeVisible();
}

async function fillSet(page: Page): Promise<void> {
  await page.getByLabel('Weight (lb) set 1').fill('135');
  await page.getByLabel('Reps set 1').fill('5');
}

test('reload mid-workout restores banner, values and elapsed time', async ({ page }) => {
  // page.clock is installed before the first navigation. Supabase auth timers run on the
  // faked clock but only fire when we advance it, which is harmless for this short flow.
  await page.clock.install();
  const user = await createUser('aw-reload');
  await signInUi(page, user);
  await startWithBench(page);
  await fillSet(page);
  await page.clock.runFor(600);
  await page.waitForTimeout(400);

  await page.reload();
  // The reload keeps the /workout/active route; minimize to reach the home banner.
  await page.getByRole('button', { name: 'Minimize workout' }).click();
  await expect(page.getByRole('button', { name: /Workout in progress/ })).toBeVisible();
  await page.getByRole('button', { name: /Workout in progress/ }).click();
  await expect(page.getByLabel('Weight (lb) set 1')).toHaveValue('135');
  await expect(page.getByLabel('Reps set 1')).toHaveValue('5');

  await page.clock.fastForward(125_000);
  await expect
    .poll(async () => ((await page.getByLabel('Elapsed time').textContent()) ?? '').trim(), {
      timeout: 5000,
    })
    .toMatch(/^(0?[2-9]|[1-9]\d):\d\d$|^\d+:0?\d{1,2}:\d\d$/);
});

test('offline round trip syncs a completed workout', async ({ page, context }) => {
  const user = await createUser('aw-offline');
  await signInUi(page, user);
  await expect(page.getByRole('button', { name: /Sync status/ })).toBeVisible();
  await page.waitForTimeout(3000);
  await context.setOffline(true);

  await startWithBench(page);
  await fillSet(page);
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByText('Personal records')).toBeVisible();
  await page.waitForTimeout(500);

  await context.setOffline(false);
  await expect
    .poll(async () => {
      const rows = await readRemoteWorkouts(user);
      const w = rows.find((r) => r.status === 'completed');
      const set = w?.exercises[0]?.sets[0];
      return {
        ended: Boolean(w?.ended_at),
        kg: set?.weightKg ? Math.round(set.weightKg * 1000) / 1000 : null,
        reps: set?.reps,
        completed: set?.completed,
      };
    }, POLL)
    .toEqual({ ended: true, kg: 61.235, reps: 5, completed: true });
});

test('second device sees the in-progress workout without auto-opening it', async ({
  page,
  browser,
}) => {
  const user = await createUser('aw-device');
  await signInUi(page, user);
  await startWithBench(page);
  await page.waitForTimeout(7500);

  const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page2 = await context2.newPage();
    await signInUi(page2, user);
    await expect(page2.getByText('In progress on another device')).toBeVisible({
      timeout: 20_000,
    });
    expect(new URL(page2.url()).hash).toMatch(/^(#\/)?$/);
    await expect(page2.getByRole('button', { name: 'Start Empty Workout' })).toBeVisible();
  } finally {
    await context2.close();
  }
});
