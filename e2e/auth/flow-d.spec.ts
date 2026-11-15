import { expect, test, type Locator, type Page } from '@playwright/test';
import { bodyweightId } from '../../src/lib/ids';
import {
  createUser,
  dumpDexie,
  hasSupabase,
  openSettings,
  readRemoteBodyweight,
  readRemoteSettings,
  SKIP_REASON,
  signInUi,
  type RemoteBodyweight,
  type TestUser,
} from './helpers';

test.skip(!hasSupabase, SKIP_REASON);

const POLL = { timeout: 20_000, intervals: [500, 1000] };

function localDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear())}-${mm}-${dd}`;
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

function listRows(page: Page): Locator {
  return page.getByRole('region', { name: 'Weigh-ins' }).getByRole('listitem');
}

function editRow(page: Page, text: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^Edit weigh-in .*, ${text}$`) });
}

async function openBodyweight(page: Page): Promise<void> {
  await nav(page, 'Progress').click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'Bodyweight', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log weight' })).toBeVisible();
}

async function openSettingsFromAnywhere(page: Page): Promise<void> {
  await nav(page, 'Workout').click();
  await openSettings(page);
}

async function syncNow(page: Page): Promise<void> {
  await openSettingsFromAnywhere(page);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Back' }).click();
}

async function setWeight(page: Page, value: string): Promise<void> {
  await page.getByRole('textbox', { name: /^Weight in / }).fill(value);
}

async function remoteFor(user: TestUser, date: string): Promise<RemoteBodyweight[]> {
  return (await readRemoteBodyweight(user)).filter((r) => r.entry_date === date);
}

/** Drags a list row left past half its width, which deletes it (same handler as the Delete button). */
async function swipeDelete(page: Page, rowButton: Locator): Promise<void> {
  await rowButton.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
  });
  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  if (await dismiss.isVisible()) await dismiss.click();
  const box = await rowButton.boundingBox();
  if (!box) throw new Error('row not visible');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 10, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, y, { steps: 8 });
  await page.mouse.move(box.x + 10, y, { steps: 8 });
  await page.mouse.up();
}

async function deleteRow(page: Page, rowButton: Locator): Promise<void> {
  if (process.env.FLOW_D_SHEET_DELETE === '1') {
    await rowButton.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  } else {
    await swipeDelete(page, rowButton);
  }
}

test('Flow D: bodyweight log, upsert, delete, re-log, offline, goal and two devices', async ({
  page,
  browser,
  context,
}) => {
  test.setTimeout(240_000);

  // 1. Create user, sign in, wait for seeding.
  const user = await createUser('flow-d');
  await signInUi(page, user);
  await page.waitForTimeout(3000);
  const today = localDate(0);
  const threeAgo = localDate(3);
  const oneAgo = localDate(1);
  const todayId = bodyweightId(user.id, today);
  const threeAgoId = bodyweightId(user.id, threeAgo);

  // 2. Empty state.
  await openBodyweight(page);
  await expect(page.getByText('No weigh-ins yet')).toBeVisible();
  await expect(page.getByText('Log your first weigh-in to start tracking.')).toBeVisible();

  // 3. Log 178.4: one dot, single-point note, list row, Current, remote row.
  await setWeight(page, '178.4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Weigh-in saved')).toBeVisible();
  await expect(dots(page)).toHaveCount(1);
  await expect(page.locator('.lift-bw-trend')).toHaveCount(0);
  await expect(page.getByText('One weigh-in so far. Log another to see a trend.')).toBeVisible();
  await expect(listRows(page)).toHaveCount(1);
  await expect(listRows(page).first()).toContainText('178.4 lb');
  await expect(tile(page, 'Current')).toContainText('178.4 lb');
  await expect.poll(async () => (await readRemoteBodyweight(user)).length, POLL).toBe(1);
  {
    const rows = await readRemoteBodyweight(user);
    expect(rows[0]?.id).toBe(todayId);
    expect(rows[0]?.entry_date).toBe(today);
    expect(rows[0]?.weight_kg).toBe(80.921);
    expect(rows[0]?.deleted_at).toBeNull();
  }

  // 4. Same-day upsert: input shows 178.4, button Update; 177.6 replaces it.
  await expect(page.getByRole('textbox', { name: 'Weight in lb' })).toHaveValue('178.4');
  await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
  await setWeight(page, '177.6');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(listRows(page)).toHaveCount(1);
  await expect(listRows(page).first()).toContainText('177.6 lb');
  await expect.poll(async () => (await dumpDexie(page)).bodyweight?.length, POLL).toBe(1);
  await expect
    .poll(async () => (await readRemoteBodyweight(user))[0]?.weight_kg, POLL)
    .toBe(80.558);
  {
    const rows = await readRemoteBodyweight(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(todayId);
  }

  // 5. Past date: today-3 at 179. Two dots, trend line, Change down 1.4 lb (179 -> 177.6).
  await page.getByLabel('Date').fill(threeAgo);
  await setWeight(page, '179');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(listRows(page)).toHaveCount(2);
  await expect(dots(page)).toHaveCount(2);
  await expect(page.locator('.lift-bw-trend')).toHaveCount(1);
  await expect(tile(page, 'Change · 3M')).toContainText('↓ 1.4 lb');

  // 6. Delete today's row (swipe); the toast expires; remote soft-deleted.
  await deleteRow(page, editRow(page, '177.6 lb'));
  await expect(page.getByText('Weigh-in deleted')).toBeVisible();
  await expect(listRows(page)).toHaveCount(1);
  await expect(page.getByText('Weigh-in deleted')).toBeHidden({ timeout: 15_000 });
  await expect
    .poll(async () => (await remoteFor(user, today))[0]?.deleted_at !== null, POLL)
    .toBe(true);

  // 7. Re-log today at 176.8: same id revived, one row for today, two rows total.
  await page.getByLabel('Date').fill(today);
  await setWeight(page, '176.8');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(listRows(page)).toHaveCount(2);
  await expect.poll(async () => (await remoteFor(user, today))[0]?.deleted_at, POLL).toBeNull();
  {
    const todayRows = await remoteFor(user, today);
    expect(todayRows).toHaveLength(1);
    expect(todayRows[0]?.id).toBe(todayId);
    expect(todayRows[0]?.weight_kg).toBe(80.195);
    expect(await readRemoteBodyweight(user)).toHaveLength(2);
  }

  // 8. Delete today-3, Undo, Sync now: remote row live.
  await deleteRow(page, editRow(page, '179 lb'));
  await expect(listRows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(listRows(page)).toHaveCount(2);
  await expect(editRow(page, '179 lb')).toBeVisible();
  await syncNow(page);
  await expect.poll(async () => (await remoteFor(user, threeAgo))[0]?.deleted_at, POLL).toBeNull();
  expect((await remoteFor(user, threeAgo))[0]?.id).toBe(threeAgoId);

  // 9. Offline: log today-1 at 177; list updates; online + Sync now pushes it.
  await openBodyweight(page);
  await context.setOffline(true);
  await page.getByLabel('Date').fill(oneAgo);
  await setWeight(page, '177');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(listRows(page)).toHaveCount(3);
  await expect(editRow(page, '177 lb')).toBeVisible();
  expect(await remoteFor(user, oneAgo)).toHaveLength(0);
  await context.setOffline(false);
  await syncNow(page);
  await expect.poll(async () => (await remoteFor(user, oneAgo)).length, POLL).toBe(1);
  expect((await remoteFor(user, oneAgo))[0]?.weight_kg).toBe(80.286);

  // 10. Goal 170: remote setting, goal line + label; clear removes both.
  await openSettingsFromAnywhere(page);
  const goal = page.getByRole('textbox', { name: 'Goal weight in lb' });
  await goal.fill('170');
  await goal.blur();
  await expect
    .poll(async () => (await readRemoteSettings(user))?.bodyweightGoalKg as number, POLL)
    .toBeCloseTo(77.111, 3);
  await page.getByRole('button', { name: 'Back' }).click();
  await openBodyweight(page);
  await expect(page.locator('.lift-bw-goal')).toHaveCount(1);
  await expect(page.getByText('Goal 170 lb')).toBeVisible();
  await openSettingsFromAnywhere(page);
  await page.getByRole('button', { name: 'Clear goal' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await openBodyweight(page);
  await expect(page.locator('.lift-bw-goal')).toHaveCount(0);
  await expect
    .poll(async () => 'bodyweightGoalKg' in ((await readRemoteSettings(user)) ?? {}), POLL)
    .toBe(false);

  // 11. Second device: 3 rows, today 176.8; B logs 175; A syncs and shows it.
  const context2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page2 = await context2.newPage();
    await signInUi(page2, user);
    await openBodyweight(page2);
    await expect(listRows(page2)).toHaveCount(3, { timeout: 20_000 });
    await expect(editRow(page2, '176.8 lb')).toBeVisible();
    const bw2 = (await dumpDexie(page2)).bodyweight as { date: string }[];
    expect(bw2.filter((r) => r.date === today)).toHaveLength(1);

    await setWeight(page2, '175');
    await page2.getByRole('button', { name: 'Update', exact: true }).click();
    await expect
      .poll(async () => (await remoteFor(user, today))[0]?.weight_kg, POLL)
      .toBe(79.379);

    await syncNow(page);
    await openBodyweight(page);
    await expect(editRow(page, '175 lb')).toBeVisible({ timeout: 20_000 });
    const todayRows = await remoteFor(user, today);
    expect(todayRows).toHaveLength(1);
    expect(todayRows[0]?.deleted_at).toBeNull();
  } finally {
    await context2.close();
  }

  // 12. Switch to kg: 175 lb shows as 79.4 kg.
  await openSettingsFromAnywhere(page);
  await page.getByRole('radio', { name: 'kg' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await openBodyweight(page);
  await expect(editRow(page, '79.4 kg')).toBeVisible();
});
