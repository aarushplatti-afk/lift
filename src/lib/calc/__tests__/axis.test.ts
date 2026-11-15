import { describe, expect, it } from 'vitest';
import { xDomain, yAxis } from '../axis';

function expectNiceTicks(ticks: number[], values: number[]): void {
  expect(ticks.length).toBeGreaterThanOrEqual(3);
  expect(ticks.length).toBeLessThanOrEqual(5);
  const step = (ticks[1] as number) - (ticks[0] as number);
  for (let i = 1; i < ticks.length; i += 1) {
    expect((ticks[i] as number) - (ticks[i - 1] as number)).toBeCloseTo(step, 6);
  }
  expect(ticks[0]).toBeLessThanOrEqual(Math.min(...values));
  expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(Math.max(...values));
}

describe('yAxis', () => {
  it('pads a narrow non-zero-based range without reaching zero', () => {
    const { domain, ticks } = yAxis([100, 110], false);
    expect(domain[0]).toBeGreaterThan(0);
    expect(domain[0]).toBeLessThan(100);
    expect(domain[1]).toBeGreaterThan(110);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expectNiceTicks(ticks, [100, 110]);
    expect(domain).toEqual([ticks[0], ticks[ticks.length - 1]]);
  });

  it('pads a single value with at least 1 unit', () => {
    const big = yAxis([200], false);
    expect(big.domain[0]).toBeLessThan(200);
    expect(big.domain[1]).toBeGreaterThan(200);
    expectNiceTicks(big.ticks, [200]);
    const small = yAxis([3], false);
    expect(small.domain[0]).toBeLessThanOrEqual(2);
    expect(small.domain[1]).toBeGreaterThanOrEqual(4);
  });

  it('handles all-equal values', () => {
    const { domain, ticks } = yAxis([80, 80, 80], false);
    expect(domain[0]).toBeLessThan(80);
    expect(domain[1]).toBeGreaterThan(80);
    expectNiceTicks(ticks, [80]);
  });

  it('starts at zero when zero-based', () => {
    const { domain, ticks } = yAxis([420, 510, 480], true);
    expect(domain[0]).toBe(0);
    expect(ticks[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(510);
    expectNiceTicks(ticks, [420, 510]);
  });

  it('handles zero-based all-zero input', () => {
    const { domain } = yAxis([0, 0], true);
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(0);
  });

  it('floors the domain at 0 for non-zero-based data near zero', () => {
    const { domain, ticks } = yAxis([1, 3], false);
    expect(domain[0]).toBe(0);
    expect(ticks.every((t) => t >= 0)).toBe(true);
  });

  it('returns a default axis for empty input', () => {
    const { domain, ticks } = yAxis([], false);
    expect(domain).toEqual([0, 1]);
    expect(ticks[0]).toBe(0);
  });
});

describe('xDomain', () => {
  it('pads a single point by one day each side', () => {
    expect(xDomain([1_000_000_000])).toEqual([
      1_000_000_000 - 86_400_000,
      1_000_000_000 + 86_400_000,
    ]);
  });
  it('spans min to max for several points regardless of order', () => {
    expect(xDomain([5, 1, 3])).toEqual([1, 5]);
  });
  it('returns a one-day window for empty input', () => {
    expect(xDomain([])).toEqual([0, 86_400_000]);
  });
});
