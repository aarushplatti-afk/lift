import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

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

export async function createUser(prefix: string): Promise<TestUser> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await anonClient().auth.signUp({ email, password: PASSWORD });
  if (error || !data.user) throw new Error(`signUp failed: ${error?.message ?? 'no user'}`);
  return { id: data.user.id, email, password: PASSWORD };
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
    sets: { weightKg?: number | null; reps?: number | null; completed?: boolean }[];
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
