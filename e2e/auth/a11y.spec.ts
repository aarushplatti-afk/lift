import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { createUser, hasSupabase, mainNav, openSettings, SKIP_REASON, signInUi } from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const UNNAMED = /^\s*- (button|link|textbox|checkbox|switch|radio|combobox)\b(?!\s+")/;

async function expectNamedControls(page: Page, label: string): Promise<void> {
  const snapshot = await page.locator('body').ariaSnapshot();
  const unnamed = snapshot.split('\n').filter((line) => UNNAMED.test(line));
  expect(unnamed, `unnamed controls on ${label}`).toEqual([]);
}

async function expectNoOverflow(page: Page, label: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.doc, `document overflow on ${label}`).toBeLessThanOrEqual(390);
  expect(widths.body, `body overflow on ${label}`).toBeLessThanOrEqual(390);
}

test('every main screen exposes named controls and survives 130% text scaling', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = await createUser('a11y');
  await signInUi(page, user);
  await page.addStyleTag({ content: 'html { font-size: 130% }' });

  const start = page.getByRole('button', { name: 'Start Empty Workout' });
  await expect(start).toBeInViewport();
  await expectNamedControls(page, 'Workout home');
  await expectNoOverflow(page, 'Workout home');

  await start.click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText('Barbell Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  await expect(page.getByRole('region', { name: 'Barbell Bench Press' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeInViewport();
  await expectNamedControls(page, 'Active workout');
  await expectNoOverflow(page, 'Active workout');
  await page.getByRole('button', { name: 'Minimize workout' }).click();

  await mainNav(page, 'History').click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expectNamedControls(page, 'History');
  await expectNoOverflow(page, 'History');

  await mainNav(page, 'Progress').click();
  await expect(page.getByRole('radio', { name: 'Bodyweight', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Exercises', exact: true }).click();
  await expectNamedControls(page, 'Progress Exercises');
  await expectNoOverflow(page, 'Progress Exercises');
  await page.getByRole('radio', { name: 'Bodyweight', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log weight' })).toBeVisible();
  await expectNamedControls(page, 'Progress Bodyweight');
  await expectNoOverflow(page, 'Progress Bodyweight');

  await mainNav(page, 'Exercises').click();
  await expect(page.getByRole('heading', { name: 'Exercises', exact: true })).toBeVisible();
  await expectNamedControls(page, 'Exercises');
  await expectNoOverflow(page, 'Exercises');

  await mainNav(page, 'Workout').click();
  await openSettings(page);
  await expectNamedControls(page, 'Settings');
  await expectNoOverflow(page, 'Settings');
});

test('welcome sheet has named controls, fits at 130% text, and honours reduced motion', async ({
  page,
}) => {
  const user = await createUser('a11y-welcome', { onboarded: false });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const sheet = page.getByRole('dialog', { name: 'Welcome to Lift' });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expectNamedControls(page, 'Welcome sheet');

  await page.addStyleTag({ content: 'html { font-size: 130% }' });
  await expectNoOverflow(page, 'Welcome sheet');
  await expect(sheet.getByRole('button', { name: 'Get started' })).toBeInViewport();
  await expect(sheet.getByRole('button', { name: 'Skip' })).toBeInViewport();

  const durations = await page.evaluate(() => {
    const el = document.querySelector('button');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { transition: cs.transitionDuration, animation: cs.animationDuration };
  });
  expect(durations).not.toBeNull();
  for (const value of Object.values(durations ?? {})) {
    for (const part of value.split(',')) {
      expect(parseFloat(part)).toBeLessThanOrEqual(0.001);
    }
  }
  await sheet.getByRole('button', { name: 'Skip' }).click();
  await expect(sheet).toHaveCount(0);
});
