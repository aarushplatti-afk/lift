import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export type LiftClient = SupabaseClient<Database>;

let client: LiftClient | undefined;

function readEnv(): { url: string; key: string } | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return undefined;
  return { url, key };
}

function jwtRole(key: string): string | undefined {
  const parts = key.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const b64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload === 'object' && payload !== null && 'role' in payload) {
      const role = (payload as { role: unknown }).role;
      return typeof role === 'string' ? role : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function isSupabaseConfigured(): boolean {
  return readEnv() !== undefined;
}

export function getSupabase(): LiftClient {
  if (client) return client;
  const env = readEnv();
  if (!env) {
    throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  }
  if (env.key.startsWith('sb_secret_') || jwtRole(env.key) === 'service_role') {
    throw new Error('Refusing to use a secret or service-role key in the client');
  }
  client = createClient<Database>(env.url, env.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'lift-auth',
    },
  });
  return client;
}
