import { describe, expect, it } from 'vitest';
import { formatWeight } from '../format';
import {
  KG_PER_LB,
  fromDisplay,
  fromDisplayInput,
  kgToLb,
  lbToKg,
  parseDecimal,
  roundKg,
  toDisplay,
} from '../units';

describe('units', () => {
  it('displays 135 lb as 135', () => {
    expect(toDisplay(lbToKg(135), 'lb')).toBe(135);
  });
  it('round-trips 137.5 lb', () => {
    expect(toDisplay(fromDisplay(137.5, 'lb'), 'lb')).toBe(137.5);
  });
  it('round-trips many lb values', () => {
    for (let lb = 0; lb <= 1000; lb += 0.5) expect(toDisplay(fromDisplay(lb, 'lb'), 'lb')).toBe(lb);
  });
  it('kg is identity', () => {
    expect(toDisplay(100, 'kg')).toBe(100);
    expect(fromDisplay(100, 'kg')).toBe(100);
  });
  it('converts both ways', () => {
    expect(lbToKg(1)).toBe(KG_PER_LB);
    expect(kgToLb(KG_PER_LB)).toBeCloseTo(1, 10);
  });
  it('roundKg rounds to 4 dp', () => {
    expect(roundKg(1.234567)).toBe(1.2346);
    expect(roundKg(0)).toBe(0);
  });
  it('handles zero', () => {
    expect(toDisplay(0, 'lb')).toBe(0);
  });
  it('parseDecimal accepts dot and comma', () => {
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal(' 12,5 ')).toBe(12.5);
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('.5')).toBe(0.5);
  });
  it('parseDecimal rejects invalid input', () => {
    for (const bad of [
      '',
      '  ',
      'abc',
      '-1',
      'NaN',
      'Infinity',
      '1,2,3',
      '1.2.3',
      '1,234.5',
      '1e3',
    ]) {
      expect(parseDecimal(bad)).toBeUndefined();
    }
  });
  it('fromDisplayInput converts or rejects', () => {
    expect(fromDisplayInput('135', 'lb')).toBe(roundKg(lbToKg(135)));
    expect(fromDisplayInput('100', 'kg')).toBe(100);
    expect(fromDisplayInput('x', 'kg')).toBeUndefined();
  });
});

describe('formatWeight', () => {
  it('formats lb and kg', () => {
    expect(formatWeight(lbToKg(135), 'lb')).toBe('135');
    expect(formatWeight(fromDisplay(137.5, 'lb'), 'lb')).toBe('137.5');
    expect(formatWeight(lbToKg(135), 'lb', { withUnit: true })).toBe('135 lb');
    expect(formatWeight(100, 'kg', { withUnit: true })).toBe('100 kg');
  });
  it('returns an em dash for undefined', () => {
    expect(formatWeight(undefined, 'kg')).toBe('—');
    expect(formatWeight(undefined, 'lb', { withUnit: true })).toBe('—');
  });
});
