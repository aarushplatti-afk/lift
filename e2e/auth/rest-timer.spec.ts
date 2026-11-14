import { expect, test, type Page } from '@playwright/test';
import { createUser, hasSupabase, SKIP_REASON, signInUi } from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

async function startWithBench(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText('Barbell Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  await expect(page.getByRole('region', { name: 'Barbell Bench Press' })).toBeVisible();
}

async function fillAndComplete(page: Page, n: number): Promise<void> {
  await page.getByLabel(`Weight (lb) set ${String(n)}`).fill('135');
  await page.getByLabel(`Reps set ${String(n)}`).fill('5');
  await page.getByRole('button', { name: `Complete set ${String(n)}` }).click();
}

function bar(page: Page) {
  return page.getByTestId('rest-timer-bar');
}

async function barSeconds(page: Page): Promise<number> {
  const text = (await bar(page).getByText(/^\d+:\d\d$/).textContent()) ?? '';
  const [m, s] = text.split(':').map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
}

test('rest timer starts at default, survives reload, completes, and honors override', async ({
  page,
}) => {
  await page.clock.install();
  const user = await createUser('rt-flow');
  await signInUi(page, user);
  await startWithBench(page);

  await fillAndComplete(page, 1);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).getByText('1:30', { exact: true })).toBeVisible();

  // Snapshot is persisted to Dexie meta; advance the faked clock then reload.
  await page.waitForTimeout(500);
  await page.clock.runFor(10_000);
  await page.reload();
  // A reload keeps the active workout route, so the restored bar is visible directly.
  await expect(page.getByLabel('Workout name')).toBeVisible();
  await expect(bar(page)).toBeVisible();
  await expect.poll(() => barSeconds(page)).toBeLessThan(90);
  await expect.poll(() => barSeconds(page)).toBeGreaterThan(0);

  await page.clock.fastForward(95_000);
  await expect(bar(page).getByText('Rest complete')).toBeVisible();

  await page.getByRole('button', { name: 'Barbell Bench Press options' }).click();
  await page.getByRole('button', { name: /^Rest timer:/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Rest timer' });
  const target = sheet.getByRole('group', { name: 'Rest time' });
  await target.getByRole('button', { name: 'Increase Rest time' }).click();
  await target.getByRole('button', { name: 'Increase Rest time' }).click();
  await expect(target.getByText('2:00', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: '+ Add Set' }).click();
  await fillAndComplete(page, 2);
  await expect(bar(page).getByText('2:00', { exact: true })).toBeVisible();
});

test('previous column shows last workout and tap fills the set', async ({ page }) => {
  const user = await createUser('rt-prev');
  await signInUi(page, user);
  await startWithBench(page);
  await fillAndComplete(page, 1);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByText('Personal records')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).first().click();
  await expect(page.getByRole('button', { name: 'Start Empty Workout' })).toBeVisible();

  await startWithBench(page);
  const prev = page.getByRole('button', { name: 'Use previous: 135 × 5' });
  await expect(prev).toBeVisible();
  await prev.click();
  await expect(page.getByLabel('Weight (lb) set 1')).toHaveValue('135');
  await expect(page.getByLabel('Reps set 1')).toHaveValue('5');
  await expect(page.getByRole('button', { name: 'Complete set 1' })).toBeVisible();
});
