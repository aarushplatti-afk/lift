import { expect, test } from '../fixtures';
import { createUser, hasSupabase, SKIP_REASON, signInUi } from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

test('finishing with filled but unticked sets logs the workout', async ({ page }) => {
  const user = await createUser('finishinc');
  await signInUi(page, user);
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText('Barbell Bench Press', { exact: true }).click();
  await page.getByText('Back Squat', { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(2\)$/ }).click();
  const bench = page.getByRole('region', { name: 'Barbell Bench Press' });
  await bench.getByLabel('Weight (lb) set 1').fill('135');
  await bench.getByLabel('Reps set 1').fill('5');
  const squat = page.getByRole('region', { name: 'Back Squat' });
  await squat.getByLabel('Weight (lb) set 1').fill('185');
  await squat.getByLabel('Reps set 1').fill('5');
  await squat.getByRole('button', { name: '+ Add Set' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Finish workout?' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark complete & finish' }).click();
  await expect(page.getByText('Personal records')).toBeVisible();
});

test('a partly ticked workout can discard the rest and finish', async ({ page }) => {
  const user = await createUser('finishinc2');
  await signInUi(page, user);
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText('Barbell Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  const bench = page.getByRole('region', { name: 'Barbell Bench Press' });
  await bench.getByRole('button', { name: '+ Add Set' }).click();
  await bench.getByLabel('Weight (lb) set 1').fill('135');
  await bench.getByLabel('Reps set 1').fill('5');
  await bench.getByRole('button', { name: 'Complete set 1' }).click();
  await bench.getByLabel('Weight (lb) set 2').fill('135');
  await bench.getByLabel('Reps set 2').fill('5');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByRole('button', { name: /Discard incomplete sets/ }).click();
  await expect(page.getByText('Personal records')).toBeVisible();
});
