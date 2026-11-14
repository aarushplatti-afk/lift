import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { setOwner } from '../../db/repos/meta';
import { getSettings, updateSettings } from '../../db/repos/settings';
import type { SettingsData } from '../../types/domain';
import { useLiveQuery } from '../useLiveQuery';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
});

describe('useLiveQuery', () => {
  it('returns initial, then the result, then re-renders on DB change', async () => {
    const { result } = renderHook(() => useLiveQuery<SettingsData | null>(getSettings, [], null));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.unit).toBe('lb'));
    await updateSettings({ unit: 'kg' });
    await waitFor(() => expect(result.current?.unit).toBe('kg'));
  });
});
