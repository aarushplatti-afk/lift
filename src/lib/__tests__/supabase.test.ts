import { afterEach, describe, expect, it, vi } from 'vitest';

function jwt(role: string): string {
  const enc = (o: object): string => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${enc({ alg: 'HS256' })}.${enc({ role })}.sig`;
}

async function load() {
  vi.resetModules();
  return import('../supabase');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('supabase client module', () => {
  it('is not configured without env', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const m = await load();
    expect(m.isSupabaseConfigured()).toBe(false);
    expect(() => m.getSupabase()).toThrow(/not configured/);
  });

  it('accepts anon JWTs and publishable keys, memoized', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', jwt('anon'));
    const m = await load();
    expect(m.isSupabaseConfigured()).toBe(true);
    expect(m.getSupabase()).toBe(m.getSupabase());

    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_abc123');
    const p = await load();
    expect(() => p.getSupabase()).not.toThrow();
  });

  it('refuses service_role JWTs and sb_secret_ keys', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', jwt('service_role'));
    await expect(load().then((m) => m.getSupabase())).rejects.toThrow(/secret or service-role/);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_secret_abc');
    await expect(load().then((m) => m.getSupabase())).rejects.toThrow(/secret or service-role/);
  });

  it('does not crash on malformed JWT-looking keys', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'a.!!!.c');
    const m = await load();
    expect(() => m.getSupabase()).not.toThrow();
  });
});
