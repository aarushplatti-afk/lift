import { describe, expect, it } from 'vitest';
import { clampRestSeconds } from '../rest';

describe('clampRestSeconds', () => {
  it('rounds to the 15 s step', () => {
    expect(clampRestSeconds(90)).toBe(90);
    expect(clampRestSeconds(92)).toBe(90);
    expect(clampRestSeconds(98)).toBe(105);
  });
  it('clamps to 15..600', () => {
    expect(clampRestSeconds(0)).toBe(15);
    expect(clampRestSeconds(-50)).toBe(15);
    expect(clampRestSeconds(5000)).toBe(600);
  });
  it('falls back to 90 for non-finite input', () => {
    expect(clampRestSeconds(Number.NaN)).toBe(90);
    expect(clampRestSeconds(Infinity)).toBe(90);
  });
});
