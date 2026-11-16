import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  createUser,
  hasSupabase,
  readRemoteWorkouts,
  SKIP_REASON,
  signInUi,
  type RemoteWorkout,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const POLL = { timeout: 20_000, intervals: [500, 1000] };
const KG_PER_LB = 0.45359237;

async function logBench(page: Page, lb: number): Promise<void> {
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText('Barbell Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  await expect(page.getByRole('region', { name: 'Barbell Bench Press' })).toBeVisible();
  await page.getByLabel('Weight (lb) set 1').fill(String(lb));
  await page.getByLabel('Reps set 1').fill('5');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByText('Personal records')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Empty Workout' })).toBeVisible();
  // Keep startedAt strictly ordered across workouts.
  await page.waitForTimeout(1100);
}

async function openHistory(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'History' })
    .click();
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
}

/** History row by total volume text, e.g. "675 lb". */
function row(page: Page, volume: string): Locator {
  return page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: `${volume} lb` });
}

function badges(page: Page): Locator {
  return page.getByRole('main').getByRole('img', { name: /personal record/ });
}

function lbOf(w: RemoteWorkout): number | undefined {
  const kg = w.exercises[0]?.sets[0]?.weightKg;
  return typeof kg === 'number' ? Math.round(kg / KG_PER_LB) : undefined;
}

async function remoteByLb(user: TestUser, lb: number): Promise<RemoteWorkout | undefined> {
  return (await readRemoteWorkouts(user)).find((w) => w.status === 'completed' && lbOf(w) === lb);
}

test('History: edit, delete, PR recompute, template, repeat and second device', async ({
  page,
  browser,
}) => {
  // 1. Sign in; log and finish 135, 145, 140.
  const user = await createUser('history');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  await logBench(page, 135);
  await logBench(page, 145);
  await logBench(page, 140);

  // 2. Three rows, only 145 has the PR badge.
  await openHistory(page);
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await expect(page.getByRole('heading', { name: month, level: 2 })).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(3);
  await expect(badges(page)).toHaveCount(1);
  await expect(row(page, '725').getByRole('img', { name: '1 personal record' })).toBeVisible();
  await expect(row(page, '675').getByRole('img')).toHaveCount(0);
  await expect(row(page, '700').getByRole('img')).toHaveCount(0);

  // 3. Edit 145 -> 130, Save.
  await row(page, '725').getByRole('link').click();
  await expect(page.getByRole('img', { name: 'Personal record' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByLabel('Weight (lb) set 1').fill('130');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Repeat Workout' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByText('130 lb × 5')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Personal record' })).toHaveCount(0);
  await openHistory(page);
  await expect(badges(page)).toHaveCount(1);
  await expect(row(page, '700').getByRole('img', { name: '1 personal record' })).toBeVisible();
  await expect(row(page, '650').getByRole('img')).toHaveCount(0);
  await expect
    .poll(async () => (await remoteByLb(user, 140))?.exercises[0]?.sets[0]?.isPR, POLL)
    .toBe(true);
  await expect
    .poll(async () => {
      const w = await remoteByLb(user, 130);
      return w ? w.exercises[0]?.sets[0]?.isPR : 'missing';
    }, POLL)
    .toBeUndefined();

  // 4. Delete the 140 workout.
  await row(page, '700').getByRole('link').click();
  await page.getByRole('button', { name: 'Delete Workout' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this workout?' })
    .getByRole('button', { name: 'Delete workout' })
    .click();
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(2);
  await expect(badges(page)).toHaveCount(0);
  await expect
    .poll(async () => {
      const rows = (await readRemoteWorkouts(user)).filter(
        (w) => w.status === 'completed' && lbOf(w) === 140,
      );
      return rows.length === 1 && rows[0]?.deleted_at !== null;
    }, POLL)
    .toBe(true);
  const remote130 = await remoteByLb(user, 130);
  expect(remote130?.deleted_at).toBeNull();
  expect(remote130?.exercises[0]?.sets[0]?.isPR).toBeUndefined();

  // 5. Open 135, Save as Template "Bench Day"; it appears on Workout home.
  await row(page, '675').getByRole('link').click();
  await page.getByRole('button', { name: 'Save as Template' }).click();
  await page.getByLabel('Template name').fill('Bench Day');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved as template' })).toBeDisabled();

  // 6. Repeat Workout: Bench 135 x 5 prefilled, uncompleted. Discard.
  await page.getByRole('button', { name: 'Repeat Workout' }).click();
  const active = page.getByRole('region', { name: 'Barbell Bench Press' });
  await expect(active).toBeVisible();
  await expect(active.getByLabel('Weight (lb) set 1')).toHaveValue('135');
  await expect(active.getByLabel('Reps set 1')).toHaveValue('5');
  await expect(active.getByRole('button', { name: 'Complete set 1' })).toBeVisible();
  await expect(active.getByRole('button', { name: 'Complete set 1' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Cancel Workout' }).click();
  await page
    .getByRole('dialog', { name: 'Discard this workout?' })
    .getByRole('button', { name: 'Discard workout' })
    .click();
  await expect(page.getByRole('button', { name: 'Start Empty Workout' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bench Day', exact: true })).toBeVisible();

  // 7. A second device sees the same rows and badges after pull.
  const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page2 = await context2.newPage();
    await signInUi(page2, user);
    await openHistory(page2);
    await expect(page2.getByRole('main').getByRole('listitem')).toHaveCount(2, { timeout: 20_000 });
    await expect(row(page2, '675')).toBeVisible();
    await expect(row(page2, '650')).toBeVisible();
    await expect(badges(page2)).toHaveCount(0);
  } finally {
    await context2.close();
  }
});
