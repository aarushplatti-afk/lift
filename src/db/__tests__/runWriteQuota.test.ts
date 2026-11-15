import { describe, expect, it, vi } from 'vitest';
import { runWrite } from '../repos/outbox';
import { onQuotaExceeded } from '../../lib/storageEvents';

describe('runWrite quota reporting', () => {
  it('reports quota errors and rethrows', async () => {
    const cb = vi.fn();
    const off = onQuotaExceeded(cb);
    const err = { name: 'QuotaExceededError' };
    await expect(runWrite(['workouts'], () => Promise.reject(err))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(cb).toHaveBeenCalledTimes(1);
    await expect(runWrite(['workouts'], () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });
});
