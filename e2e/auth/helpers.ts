import { readFile } from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';

export const SUPABASE_URL = process.env.SUPABASE_TEST_URL;
export const SUPABASE_KEY = process.env.SUPABASE_TEST_KEY;
export const SKIP_REASON =
  'SUPABASE_TEST_URL/SUPABASE_TEST_KEY not set (run via npm run e2e:local-supabase)';
export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const PASSWORD = 'correct-horse-battery-1';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

function anonClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error(SKIP_REASON);
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Signs up a fresh user. When onboarded (default), the user's own session writes a
 * user_settings row with data.onboardedAt set, so the welcome sheet never appears.
 */
export async function createUser(
  prefix: string,
  { onboarded = true }: { onboarded?: boolean } = {},
): Promise<TestUser> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const client = anonClient();
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error || !data.user) throw new Error(`signUp failed: ${error?.message ?? 'no user'}`);
  const user: TestUser = { id: data.user.id, email, password: PASSWORD };
  if (onboarded) {
    if (!data.session) {
      const { error: signInError } = await client.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });
      if (signInError) throw new Error(`seed sign-in failed: ${signInError.message}`);
    }
    const { error: seedError } = await client
      .from('user_settings')
      .upsert({ user_id: user.id, data: { onboardedAt: Date.now() } }, { onConflict: 'user_id' });
    if (seedError) throw new Error(`user_settings seed failed: ${seedError.message}`);
  }
  return user;
}

/** Polls Mailpit for mail to `email` and returns the first URL in the text body matching `match`. */
export async function latestEmailLink(email: string, match: RegExp): Promise<string> {
  const base = process.env.SUPABASE_TEST_MAIL_URL?.replace(/\/$/, '');
  if (!base) {
    test.skip(true, 'SUPABASE_TEST_MAIL_URL not set (run via npm run e2e:local-supabase)');
    throw new Error('unreachable');
  }
  const deadline = Date.now() + 15_000;
  let reachable = false;
  while (Date.now() < deadline) {
    try {
      const search = await fetch(
        `${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
      );
      if (search.ok) {
        reachable = true;
        const body = (await search.json()) as { messages?: { ID: string }[] };
        const id = body.messages?.[0]?.ID;
        if (id) {
          const msg = await fetch(`${base}/api/v1/message/${id}`);
          if (msg.ok) {
            const text = ((await msg.json()) as { Text?: string }).Text ?? '';
            const urls = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
            const hit = urls.find((u) => match.test(u));
            if (hit) return hit;
          }
        }
      }
    } catch {
      // mail server unreachable on this attempt
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!reachable) {
    test.skip(true, `Mailpit unreachable at ${base}`);
  }
  throw new Error(`no email link matching ${String(match)} for ${email}`);
}

/** Reads the user's user_settings.data with a second anon client signed in as the same user. */
export async function readRemoteSettings(user: TestUser): Promise<Record<string, unknown> | null> {
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signInError) throw new Error(`second client sign-in failed: ${signInError.message}`);
  const { data, error } = await client
    .from('user_settings')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(`user_settings read failed: ${error.message}`);
  return (data?.data as Record<string, unknown> | undefined) ?? null;
}

export interface RemoteExercise {
  id: string;
  name: string;
  is_custom: boolean;
  archived: boolean;
  deleted_at: string | null;
}

/** Reads every exercises row (including soft-deleted) for the user via a second signed-in client. */
export async function readRemoteExercises(user: TestUser): Promise<RemoteExercise[]> {
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signInError) throw new Error(`second client sign-in failed: ${signInError.message}`);
  const { data, error } = await client
    .from('exercises')
    .select('id,name,is_custom,archived,deleted_at')
    .eq('user_id', user.id)
    .limit(5000);
  if (error) throw new Error(`exercises read failed: ${error.message}`);
  return data as RemoteExercise[];
}

export async function signInUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('./');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

/** Waits for the service worker, then reloads so the page is SW-controlled. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible();
}

/** Contents of every object store in the 'lift' IndexedDB database. */
export async function dumpDexie(page: Page): Promise<Record<string, unknown[]>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const open = indexedDB.open('lift');
        open.onerror = () => {
          reject(new Error('cannot open lift db'));
        };
        open.onsuccess = () => {
          const idb = open.result;
          const names = Array.from(idb.objectStoreNames);
          const out: Record<string, unknown[]> = {};
          if (names.length === 0) {
            idb.close();
            resolve(out);
            return;
          }
          const tx = idb.transaction(names, 'readonly');
          for (const name of names) {
            const req = tx.objectStore(name).getAll();
            req.onsuccess = () => {
              out[name] = req.result as unknown[];
            };
          }
          tx.oncomplete = () => {
            idb.close();
            resolve(out);
          };
          tx.onerror = () => {
            reject(new Error('read failed'));
          };
        };
      }),
  );
}

export interface RemoteWorkout {
  id: string;
  status: string;
  ended_at: string | null;
  template_id: string | null;
  deleted_at: string | null;
  exercises: {
    sets: {
      weightKg?: number | null;
      reps?: number | null;
      completed?: boolean;
      isPR?: boolean;
    }[];
  }[];
}

/** Reads every workouts row (including soft-deleted) for the user via a second signed-in client. */
export async function readRemoteWorkouts(user: TestUser): Promise<RemoteWorkout[]> {
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signInError) throw new Error(`second client sign-in failed: ${signInError.message}`);
  const { data, error } = await client
    .from('workouts')
    .select('id,status,ended_at,deleted_at,template_id,exercises')
    .eq('user_id', user.id)
    .limit(500);
  if (error) throw new Error(`workouts read failed: ${error.message}`);
  return data as RemoteWorkout[];
}

export interface RemoteTemplate {
  id: string;
  name: string;
  last_used_at: string | null;
  deleted_at: string | null;
  exercises: {
    exerciseId: string;
    order: number;
    sets: { targetWeightKg?: number; targetReps?: number }[];
  }[];
}

/** Reads every templates row (including soft-deleted) for the user via a second signed-in client. */
export async function readRemoteTemplates(user: TestUser): Promise<RemoteTemplate[]> {
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signInError) throw new Error(`second client sign-in failed: ${signInError.message}`);
  const { data, error } = await client
    .from('templates')
    .select('id,name,last_used_at,deleted_at,exercises')
    .eq('user_id', user.id)
    .limit(500);
  if (error) throw new Error(`templates read failed: ${error.message}`);
  return data as RemoteTemplate[];
}

export interface RemoteBodyweight {
  id: string;
  entry_date: string;
  weight_kg: number;
  note: string | null;
  deleted_at: string | null;
}

/** Reads every bodyweight_entries row (including soft-deleted) for the user via a second signed-in client. */
export async function readRemoteBodyweight(user: TestUser): Promise<RemoteBodyweight[]> {
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signInError) throw new Error(`second client sign-in failed: ${signInError.message}`);
  const { data, error } = await client
    .from('bodyweight_entries')
    .select('id,entry_date,weight_kg,note,deleted_at')
    .eq('user_id', user.id)
    .limit(5000);
  if (error) throw new Error(`bodyweight read failed: ${error.message}`);
  return (data as RemoteBodyweight[]).map((r) => ({ ...r, weight_kg: Number(r.weight_kg) }));
}

export interface RemoteWorkoutInsert {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  status: 'completed' | 'in_progress';
  exercises: {
    id: string;
    exerciseId: string;
    order: number;
    sets: {
      id: string;
      order: number;
      type: 'normal' | 'warmup' | 'drop' | 'failure';
      weightKg?: number;
      reps?: number;
      durationSec?: number;
      completed: boolean;
      completedAt?: number;
    }[];
  }[];
}

/**
 * Inserts workouts as the given user through RLS (anon key plus that user's session).
 * Rows are sent in batches of 500 to keep request bodies small.
 */
export async function insertRemoteWorkouts(
  user: TestUser,
  rows: readonly RemoteWorkoutInsert[],
): Promise<void> {
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signInError) throw new Error(`second client sign-in failed: ${signInError.message}`);
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ ...r, user_id: user.id }));
    const { error } = await client.from('workouts').insert(batch);
    if (error) throw new Error(`workouts insert failed: ${error.message}`);
  }
}

export const POLL = { timeout: 20_000, intervals: [500, 1000] };

export function mainNav(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
}

/** Logs and finishes a one-set Barbell Bench Press workout through the UI (weight in the current unit). */
export async function logBenchWorkout(page: Page, weight: number, unit = 'lb'): Promise<void> {
  await page.getByRole('button', { name: 'Start Empty Workout' }).click();
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText('Barbell Bench Press', { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  await expect(page.getByRole('region', { name: 'Barbell Bench Press' })).toBeVisible();
  await page.getByLabel(`Weight (${unit}) set 1`).fill(String(weight));
  await page.getByLabel('Reps set 1').fill('5');
  await page.getByRole('button', { name: 'Complete set 1' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByText('Personal records')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Empty Workout' })).toBeVisible();
}

/** Logs a weigh-in for today on the Progress > Bodyweight screen. */
export async function logWeighIn(page: Page, value: string, unit = 'lb'): Promise<void> {
  await mainNav(page, 'Progress').click();
  await page.getByRole('radio', { name: 'Bodyweight', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log weight' })).toBeVisible();
  await page.getByRole('textbox', { name: `Weight in ${unit}` }).fill(value);
  await page.getByRole('button', { name: /^(Save|Update)$/ }).click();
  await expect(page.getByText('Weigh-in saved')).toBeVisible();
}

/** Creates a template with one exercise from the Workout tab. */
export async function createTemplate(page: Page, name: string, exercise: string): Promise<void> {
  await mainNav(page, 'Workout').click();
  await page.getByRole('button', { name: '+ New Template' }).click();
  await page.getByLabel('Template name').fill(name);
  await page.getByRole('button', { name: '+ Add Exercise' }).click();
  await page.getByText(exercise, { exact: true }).click();
  await page.getByRole('button', { name: /^Add \(1\)$/ }).click();
  await expect(page.getByRole('region', { name: exercise })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
}

/** Opens Settings, presses Sync now, waits for it to finish, and returns to the Workout tab. */
export async function syncNowUi(page: Page): Promise<void> {
  await mainNav(page, 'Workout').click();
  await openSettings(page);
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Back' }).click();
}

export interface DataSnapshot {
  exercises: Record<string, unknown>[];
  workouts: Record<string, unknown>[];
  templates: Record<string, unknown>[];
  bodyweight: Record<string, unknown>[];
  settings: unknown;
}

function stripVolatile(rows: unknown[] | undefined): Record<string, unknown>[] {
  return (rows ?? [])
    .map((r) => {
      const copy = { ...(r as Record<string, unknown>) };
      delete copy.updatedAt;
      return copy;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** Local data from Dexie with updatedAt removed and rows sorted by id, for deep-equal comparison. */
export async function snapshotData(page: Page): Promise<DataSnapshot> {
  const dump = await dumpDexie(page);
  return {
    exercises: stripVolatile(dump.exercises),
    workouts: stripVolatile(dump.workouts),
    templates: stripVolatile(dump.templates),
    bodyweight: stripVolatile(dump.bodyweight),
    settings: stripVolatile(dump.settings)[0],
  };
}

/** Clicks Export data and returns the downloaded file's name and text. */
export async function exportBackupUi(
  page: Page,
  savePath: string,
): Promise<{ fileName: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export data' }).click(),
  ]);
  await download.saveAs(savePath);
  return { fileName: download.suggestedFilename(), text: await readFile(savePath, 'utf8') };
}

/** Picks a backup file, confirms the summary sheet and the Replace dialog. */
export async function importBackupUi(page: Page, filePath: string): Promise<void> {
  await page.getByLabel('Backup file').setInputFiles(filePath);
  await expect(page.getByRole('dialog', { name: 'Import backup' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace all data' }).click();
  const confirm = page.getByRole('dialog', { name: 'Replace all data?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Replace all data' }).click();
  await expect(page.getByText(/Backup imported|couldn't sync yet/)).toBeVisible({
    timeout: 30_000,
  });
}

/** Runs the two-step Delete all data dialog. */
export async function deleteAllUi(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  const final = page.getByRole('button', { name: 'Delete everything' });
  await expect(final).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await final.click();
  await expect(page.getByText('All data deleted')).toBeVisible({ timeout: 30_000 });
}
