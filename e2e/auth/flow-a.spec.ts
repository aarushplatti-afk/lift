import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  createUser,
  hasSupabase,
  readRemoteTemplates,
  readRemoteWorkouts,
  SKIP_REASON,
  signInUi,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const POLL = { timeout: 20_000, intervals: [500, 1000] };

async function addExercise(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText(name, { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  await expect(page.getByRole('region', { name })).toBeVisible();
}

test('Flow A: template create, start, summary save-as, sync and delete', async ({ page }) => {
  const user = await createUser('flow-a');
  await signInUi(page, user);
  await page.waitForTimeout(3000);

  // 1. Create "Push Day".
  await page.getByRole('button', { name: '+ New Template' }).click();
  await page.getByLabel('Template name').fill('Push Day');
  await addExercise(page, 'Barbell Bench Press');
  await addExercise(page, 'Machine Shoulder Press');
  const bench = page.getByRole('region', { name: 'Barbell Bench Press' });
  await bench.getByRole('button', { name: '+ Add Set' }).click();
  await bench.getByRole('button', { name: '+ Add Set' }).click();
  await expect(bench.getByRole('group', { name: /^Set \d/ })).toHaveCount(3);
  await bench.getByLabel('Target weight (lb) set 1').fill('135');
  await bench.getByLabel('Target reps set 1').fill('5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // 2. Row summary.
  const row = page.getByRole('button', { name: 'Push Day', exact: true });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Barbell Bench Press, Machine Shoulder Press');
  await expect(row).toContainText('Never used');

  // 3. Preview and start.
  await row.click();
  await expect(page.getByText('3 sets')).toBeVisible();
  await page.getByRole('button', { name: 'Start Workout' }).click();
  const active = page.getByRole('region', { name: 'Barbell Bench Press' });
  await expect(active).toBeVisible();
  await expect(active.getByLabel('Weight (lb) set 1')).toHaveValue('135');
  await expect(active.getByLabel('Reps set 1')).toHaveValue('5');
  await expect(active.getByRole('group', { name: 'Set 1' })).toContainText('—');

  // 4. Complete sets and finish.
  await active.getByRole('button', { name: 'Complete set 1' }).click();
  await active.getByLabel('Weight (lb) set 2').fill('135');
  await active.getByLabel('Reps set 2').fill('5');
  await active.getByRole('button', { name: 'Complete set 2' }).click();
  await active.getByLabel('Weight (lb) set 3').fill('135');
  await active.getByLabel('Reps set 3').fill('5');
  await active.getByRole('button', { name: 'Complete set 3' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const anyway = page.getByRole('button', { name: /Finish anyway|^Finish$/ }).last();
  if (await page.getByRole('dialog', { name: 'Finish workout?' }).isVisible()) {
    await anyway.click();
  }
  await expect(page.getByText('Personal records')).toBeVisible();

  await page.getByRole('button', { name: 'Save as Template' }).click();
  await page.getByLabel('Template name').fill('Push Day 2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved as template' })).toBeDisabled();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // 5. Home lists both.
  await expect(page.getByRole('button', { name: 'Push Day 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Push Day', exact: true })).toContainText(
    'Used today',
  );

  // 6. Remote data.
  let templateId = '';
  await expect
    .poll(async () => {
      const rows = (await readRemoteTemplates(user)).filter((t) => t.deleted_at === null);
      const pd = rows.find((t) => t.name === 'Push Day');
      templateId = pd?.id ?? '';
      return {
        count: rows.length,
        kg: pd?.exercises[0]?.sets[0]?.targetWeightKg,
        used: pd?.last_used_at !== null && pd?.last_used_at !== undefined,
      };
    }, POLL)
    .toEqual({ count: 2, kg: 61.235, used: true });
  await expect
    .poll(async () => {
      const done = (await readRemoteWorkouts(user)).filter((w) => w.status === 'completed');
      return { n: done.length, tpl: done[0]?.template_id };
    }, POLL)
    .toEqual({ n: 1, tpl: templateId });
  const workoutBefore = (await readRemoteWorkouts(user)).find((w) => w.status === 'completed');

  // 7. Delete "Push Day 2".
  await page.getByRole('button', { name: 'Push Day 2 options' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete template' }).click();
  await expect(page.getByRole('button', { name: 'Push Day 2', exact: true })).toHaveCount(0);
  await expect
    .poll(async () => {
      const t = (await readRemoteTemplates(user)).find((r) => r.name === 'Push Day 2');
      return t?.deleted_at != null;
    }, POLL)
    .toBe(true);
  const workoutAfter = (await readRemoteWorkouts(user)).find((w) => w.status === 'completed');
  expect(workoutAfter).toEqual(workoutBefore);
  expect(workoutAfter?.deleted_at).toBeNull();
});
