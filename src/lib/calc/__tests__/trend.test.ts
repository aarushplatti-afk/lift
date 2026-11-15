import { describe, expect, it } from 'vitest';
import { TREND_ALPHA, ewma } from '../trend';

const e = (date: string, weightKg: number, id = date) => ({ id, date, weightKg });

describe('ewma', () => {
  it('exposes alpha 0.1', () => {
    expect(TREND_ALPHA).toBe(0.1);
  });

  it('returns empty for empty input', () => {
    expect(ewma([])).toEqual([]);
  });

  it('single point trend equals its weight', () => {
    expect(ewma([e('2026-01-01', 80)])[0]?.trendKg).toBe(80);
  });

  it('constant weights stay constant', () => {
    const out = ewma([e('2026-01-01', 80), e('2026-01-02', 80), e('2026-01-03', 80)]);
    for (const p of out) expect(p.trendKg).toBeCloseTo(80, 10);
  });

  it('consecutive days use alpha 0.1', () => {
    const out = ewma([e('2026-01-01', 80), e('2026-01-02', 81)]);
    expect(out[1]?.trendKg).toBeCloseTo(80.1, 10);
  });

  it('3-day gap uses alpha 0.271', () => {
    const out = ewma([e('2026-01-01', 80), e('2026-01-04', 90)]);
    expect(out[1]?.trendKg).toBeCloseTo(80 + 0.271 * 10, 10);
  });

  it('30-day gap uses alpha about 0.958', () => {
    const out = ewma([e('2026-01-01', 80), e('2026-01-31', 90)]);
    expect(out[1]?.trendKg).toBeCloseTo(80 + (1 - 0.9 ** 30) * 10, 10);
    expect((out[1]?.trendKg ?? 0) - 80).toBeCloseTo(9.576, 2);
  });

  it('uses calendar days across DST', () => {
    const spring = ewma([e('2026-03-07', 80), e('2026-03-08', 81)]);
    expect(spring[1]?.trendKg).toBeCloseTo(80.1, 10);
    const fall = ewma([e('2026-10-31', 80), e('2026-11-01', 81)]);
    expect(fall[1]?.trendKg).toBeCloseTo(80.1, 10);
  });

  it('sorts unsorted input without mutating it', () => {
    const input = [e('2026-01-03', 82), e('2026-01-01', 80), e('2026-01-02', 81)];
    const snapshot = input.map((x) => ({ ...x }));
    const out = ewma(input);
    expect(out.map((p) => p.entry.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(input).toEqual(snapshot);
  });

  it('duplicate date leaves the trend unchanged and orders by id', () => {
    const out = ewma([
      e('2026-01-02', 90, 'b'),
      e('2026-01-01', 80, 'a'),
      e('2026-01-02', 70, 'a2'),
    ]);
    expect(out.map((p) => p.entry.id)).toEqual(['a', 'a2', 'b']);
    expect(out[1]?.trendKg).toBeCloseTo(79, 10);
    expect(out[2]?.trendKg).toBe(out[1]?.trendKg);
  });

  it('rejects alpha outside (0, 1]', () => {
    expect(() => ewma([e('2026-01-01', 80)], 0)).toThrow(RangeError);
    expect(() => ewma([e('2026-01-01', 80)], 1.5)).toThrow(RangeError);
    expect(() => ewma([e('2026-01-01', 80)], Number.NaN)).toThrow(RangeError);
  });

  it('alpha 1 reproduces the raw series', () => {
    const out = ewma([e('2026-01-01', 80), e('2026-01-02', 83), e('2026-01-09', 78)], 1);
    expect(out.map((p) => p.trendKg)).toEqual([80, 83, 78]);
  });

  it('works for objects without an id', () => {
    const out = ewma([
      { date: '2026-01-02', weightKg: 81 },
      { date: '2026-01-01', weightKg: 80 },
    ]);
    expect(out.map((p) => p.entry.date)).toEqual(['2026-01-01', '2026-01-02']);
  });
});
