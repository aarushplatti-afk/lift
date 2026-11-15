import { describe, expect, it, vi } from 'vitest';
import type { SyncEngine } from '../engine';
import { startSyncTriggers } from '../triggers';

describe('startSyncTriggers', () => {
  it('cancels the engine retry timer on teardown', () => {
    const engine: SyncEngine = {
      syncNow: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      getStatus: vi.fn(),
      runExclusive: vi.fn(),
      cancelRetry: vi.fn(),
    };
    const stop = startSyncTriggers(engine);
    expect(engine.cancelRetry).not.toHaveBeenCalled();
    stop();
    expect(engine.cancelRetry).toHaveBeenCalledTimes(1);
  });
});
