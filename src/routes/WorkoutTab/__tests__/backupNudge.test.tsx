import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wipeLocalData } from '../../../db/repos/meta';
import { db } from '../../../db/schema';
import { BACKUP_NUDGE_INTERVAL_MS } from '../../../lib/backupNudge';
import { useActiveWorkoutStore } from '../../../store/activeWorkout';
import { BackupNudgeCard } from '../BackupNudgeCard';

const exportBackup = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/useBackupExport', () => ({
  useBackupExport: () => ({ exporting: false, exportBackup }),
}));

async function seedWorkout(): Promise<void> {
  await db.workouts.put({
    id: 'w1',
    userId: 'u',
    name: 'Done',
    startedAt: 1,
    endedAt: 2,
    status: 'completed',
    exercises: [],
    createdAt: 1,
    updatedAt: 1,
  });
}

function renderCard() {
  return render(
    <MemoryRouter>
      <BackupNudgeCard />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeLocalData();
  exportBackup.mockReset().mockResolvedValue(undefined);
  useActiveWorkoutStore.setState({ workout: null });
});

describe('BackupNudgeCard', () => {
  it('is hidden without workouts or when tracking is recent', async () => {
    await db.meta.put({ key: 'backupTrackingSince', value: Date.now() - BACKUP_NUDGE_INTERVAL_MS });
    const first = renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/30 days/)).not.toBeInTheDocument();
    first.unmount();

    await seedWorkout();
    await db.meta.put({ key: 'backupTrackingSince', value: Date.now() });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/30 days/)).not.toBeInTheDocument();
  });

  it('shows after 30 days; Export calls the hook and hides', async () => {
    await seedWorkout();
    await db.meta.put({ key: 'backupTrackingSince', value: Date.now() - BACKUP_NUDGE_INTERVAL_MS });
    renderCard();
    expect(await screen.findByText(/30 days since your last backup/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportBackup).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(/30 days/)).not.toBeInTheDocument();
    });
  });

  it('Not now hides and snoozes', async () => {
    await seedWorkout();
    await db.meta.put({ key: 'backupTrackingSince', value: Date.now() - BACKUP_NUDGE_INTERVAL_MS });
    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(/30 days/)).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await db.meta.get('backupNudgeDismissedAt')).toBeDefined();
    });
  });
});
