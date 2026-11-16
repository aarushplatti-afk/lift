import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { useAuthStore } from '../../../store/auth';
import { useSettingsStore } from '../../../store/settings';
import { useSyncStore } from '../../../store/sync';

vi.mock('../../../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: {} }),
}));
vi.mock('../../../sync/engine', () => ({
  getSyncEngine: () => ({
    syncNow: () => Promise.resolve(),
    subscribe: () => () => undefined,
    getStatus: () => ({ state: 'synced', pendingCount: 0, failedCount: 0 }),
  }),
}));
vi.mock('../../../sync/triggers', () => ({ startSyncTriggers: () => () => undefined }));
vi.mock('../../../sync/auth', () => ({
  signIn: vi.fn(() => Promise.resolve({ ok: true })),
  getCachedSession: vi.fn(() => new Promise(() => undefined)),
  onAuthChange: () => () => undefined,
}));

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useAuthStore.setState({ status: 'signedIn', initialPullDone: true, init: () => () => undefined });
  useSyncStore.setState({ status: { state: 'synced', pendingCount: 0, failedCount: 0 } });
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, hydrated: true });
  window.location.hash = '#/history';
});

describe('History tab bar visibility', () => {
  it('shows the tab bar on the list and detail and hides it on the editor', async () => {
    const r = await createExercise({
      name: 'Bench Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      type: 'weight_reps',
    });
    if (!r.ok) throw new Error('seed failed');
    const startedAt = new Date(2026, 10, 12, 18).getTime();
    await db.workouts.put({
      id: 'w1',
      userId: 'u1',
      name: 'Push Day',
      startedAt,
      endedAt: startedAt + 60000,
      status: 'completed',
      createdAt: startedAt,
      updatedAt: startedAt,
      exercises: [
        {
          id: 'we1',
          exerciseId: r.exercise.id,
          order: 0,
          sets: [{ id: 's1', order: 0, type: 'normal', weightKg: 50, reps: 5, completed: true }],
        },
      ],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('link', { name: /^Push Day, Thu, Nov 12/ }));
    expect(await screen.findByRole('heading', { name: 'Push Day', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Edit' }));
    expect(await screen.findByLabelText('Workout name')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Push Day', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
