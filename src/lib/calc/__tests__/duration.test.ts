import { describe, expect, it } from 'vitest';
import { elapsedMs } from '../duration';

describe('elapsedMs', () => {
  it('returns the difference', () => {
    expect(elapsedMs(1000, 4500)).toBe(3500);
    expect(elapsedMs(1000, 1000)).toBe(0);
  });
  it('is 0 when the clock went backwards', () => {
    expect(elapsedMs(5000, 1000)).toBe(0);
  });
});
