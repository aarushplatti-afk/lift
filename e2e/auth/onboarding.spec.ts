import { expect, test } from '../fixtures';
import {
  createUser,
  hasSupabase,
  mainNav,
  openSettings,
  POLL,
  readRemoteSettings,
  readRemoteTemplates,
  SKIP_REASON,
  signInUi,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

test('welcome sheet: kg, bodyweight and starter templates are saved once per account', async ({
  page,
  browser,
}) => {
  const user = await createUser('onboard', { onboarded: false });
  await page.goto('./');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const sheet = page.getByRole('dialog', { name: 'Welcome to Lift' });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('radio', { name: 'kg' }).click();
  await sheet.getByLabel('Current bodyweight in kg (optional)').fill('80');
  await expect(sheet.getByRole('checkbox', { name: /Push, Pull and Leg Day/ })).toBeChecked();
  await sheet.getByRole('button', { name: 'Get started' }).click();
  await expect(sheet).toHaveCount(0);

  for (const name of ['Push Day', 'Pull Day', 'Leg Day']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }

  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Back' }).click();

  await mainNav(page, 'Progress').click();
  await page.getByRole('radio', { name: 'Bodyweight', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weigh-ins' })).toContainText('80');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
  await expect(sheet).toHaveCount(0);

  await expect
    .poll(async () => (await readRemoteSettings(user))?.onboardedAt, POLL)
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (await readRemoteTemplates(user))
          .filter((t) => t.deleted_at === null)
          .map((t) => t.name)
          .sort(),
      POLL,
    )
    .toEqual(['Leg Day', 'Pull Day', 'Push Day']);

  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page2 = await second.newPage();
    await signInUi(page2, user);
    await expect(page2.getByRole('dialog', { name: 'Welcome to Lift' })).toHaveCount(0);
    await expect(page2.getByRole('button', { name: 'Push Day', exact: true })).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await second.close();
  }
});

test('skipping the welcome sheet saves no data; starter templates can be added later', async ({
  page,
}) => {
  const user = await createUser('onboard-skip', { onboarded: false });
  await page.goto('./');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const sheet = page.getByRole('dialog', { name: 'Welcome to Lift' });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole('button', { name: 'Skip' }).click();
  await expect(sheet).toHaveCount(0);

  await expect(page.getByText('No templates yet')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
  await expect(sheet).toHaveCount(0);

  await page.getByRole('button', { name: 'Add starter templates' }).click();
  for (const name of ['Push Day', 'Pull Day', 'Leg Day']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
});
