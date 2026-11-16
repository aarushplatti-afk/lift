import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../schema';
import { ensureSeeded } from '../seed';
import {
  dismissBackupNudge,
  ensureBackupTracking,
  markBackupExported,
  observeBackupNudgeMeta,
  setOwner,
  wipeLocalData,
} from '../repos/meta';
import { completeOnboarding, observeOnboardingCounts, skipOnboarding } from '../repos/onboarding';
import * as templatesRepo from '../repos/templates';
import { getSettings, sanitizeSettings, DEFAULT_SETTINGS } from '../repos/settings';
import { todayLocal } from '../../lib/dates';

const U = '11111111-1111-4111-8111-111111111111';
const NOW = new Date(2026, 5, 15, 12).getTime();

beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner(U, 'a@b.c');
  await ensureSeeded(U);
  await db.syncQueue.clear();
});

describe('completeOnboarding', () => {
  it('writes templates, weigh-in, then settings last', async () => {
    const out = await completeOnboarding(
      { unit: 'kg', bodyweightKg: 80, addStarterTemplates: true },
      NOW,
    );
    expect(out).toEqual({ bodyweightSaved: true, templatesAdded: 3 });
    const q = await db.syncQueue.orderBy('id').toArray();
    expect(q.map((e) => e.table)).toEqual([
      'templates',
      'templates',
      'templates',
      'bodyweight_entries',
      'user_settings',
    ]);
    const bw = await db.bodyweight.toArray();
    expect(bw).toHaveLength(1);
    expect(bw[0]).toMatchObject({ date: todayLocal(NOW), weightKg: 80 });
    expect(await getSettings()).toMatchObject({ unit: 'kg', onboardedAt: NOW });
  });

  it('skips templates and weigh-in when not requested', async () => {
    const out = await completeOnboarding({ unit: 'lb', addStarterTemplates: false }, NOW);
    expect(out).toEqual({ bodyweightSaved: false, templatesAdded: 0 });
    expect(await db.templates.count()).toBe(0);
    expect(await db.bodyweight.count()).toBe(0);
    expect((await getSettings()).onboardedAt).toBe(NOW);
  });

  it('reports an invalid weight but still finishes the rest', async () => {
    const out = await completeOnboarding(
      { unit: 'kg', bodyweightKg: 0, addStarterTemplates: true },
      NOW,
    );
    expect(out).toEqual({ bodyweightSaved: false, templatesAdded: 3 });
    expect(await db.bodyweight.count()).toBe(0);
    expect((await getSettings()).onboardedAt).toBe(NOW);
  });

  it('leaves onboardedAt unset when the first step throws', async () => {
    vi.spyOn(templatesRepo, 'addStarterTemplates').mockRejectedValue(new Error('boom'));
    await expect(
      completeOnboarding({ unit: 'kg', bodyweightKg: 80, addStarterTemplates: true }, NOW),
    ).rejects.toThrow('boom');
    expect((await getSettings()).onboardedAt).toBeUndefined();
    expect(await db.settings.count()).toBe(0);
  });
});

describe('skipOnboarding', () => {
  it('sets only onboardedAt', async () => {
    await skipOnboarding(NOW);
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, onboardedAt: NOW });
    expect(await db.templates.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(1);
  });
});

describe('observeOnboardingCounts', () => {
  it('emits counts of workouts, templates and bodyweight', async () => {
    await completeOnboarding({ unit: 'kg', bodyweightKg: 70, addStarterTemplates: true }, NOW);
    const counts = await new Promise((resolve, reject) => {
      const sub = observeOnboardingCounts().subscribe({
        next: (v) => {
          sub.unsubscribe();
          resolve(v);
        },
        error: reject,
      });
    });
    expect(counts).toEqual({ workouts: 0, templates: 3, bodyweight: 1 });
  });
});

describe('sanitizeSettings onboardedAt', () => {
  it.each([0, -1, 1.5, Number.NaN])('drops %s', (v) => {
    const out = sanitizeSettings({ ...DEFAULT_SETTINGS, onboardedAt: v });
    expect('onboardedAt' in out).toBe(false);
  });
  it('keeps a positive integer', () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, onboardedAt: 5 }).onboardedAt).toBe(5);
  });
});

describe('backup nudge meta', () => {
  const read = (): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const sub = observeBackupNudgeMeta().subscribe({
        next: (v) => {
          sub.unsubscribe();
          resolve(v);
        },
        error: reject,
      });
    });

  it('starts empty, tracks once, records export and dismissal', async () => {
    expect(await read()).toEqual({});
    await ensureBackupTracking(100);
    await ensureBackupTracking(200);
    await markBackupExported(300);
    await dismissBackupNudge(400);
    expect(await read()).toEqual({ trackingSince: 100, lastBackupAt: 300, dismissedAt: 400 });
  });

  it('is reset by wipeLocalData', async () => {
    await ensureBackupTracking(100);
    await wipeLocalData();
    expect(await read()).toEqual({});
  });
});
