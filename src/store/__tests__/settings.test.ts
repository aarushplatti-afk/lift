import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { db } from '../../db/schema';
import { setOwner } from '../../db/repos/meta';
import { initSettingsStore, useSettingsStore } from '../settings';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
});

describe('settings store', () => {
  it('hydrates with defaults then reflects updates', async () => {
    const stop = initSettingsStore();
    await waitFor(() => expect(useSettingsStore.getState().hydrated).toBe(true));
    expect(useSettingsStore.getState().settings.unit).toBe('lb');
    await useSettingsStore.getState().update({ unit: 'kg' });
    await waitFor(() => expect(useSettingsStore.getState().settings.unit).toBe('kg'));
    stop();
  });
});
