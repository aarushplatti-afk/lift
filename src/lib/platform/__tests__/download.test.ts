import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from '../download';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('saveTextFile', () => {
  it('shares on iOS standalone', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { standalone: true, canShare: () => true, share });
    expect(await saveTextFile('a.json', 'application/json', '{}')).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
  });
  it('returns cancelled on AbortError', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    vi.stubGlobal('navigator', {
      standalone: true,
      canShare: () => true,
      share: () => Promise.reject(abort),
    });
    expect(await saveTextFile('a.json', 'application/json', '{}')).toBe('cancelled');
  });
  it('uses anchor download and revokes otherwise', async () => {
    vi.stubGlobal('navigator', {});
    vi.useFakeTimers();
    const create = vi.fn().mockReturnValue('blob:x');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    expect(await saveTextFile('a.csv', 'text/csv', 'a')).toBe('downloaded');
    expect(click).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    vi.useRealTimers();
  });
});
