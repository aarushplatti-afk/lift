import { describe, expect, it } from 'vitest';
import { formatDurationInput, parseDurationInput } from '../duration';

describe('parseDurationInput', () => {
  it('parses digits as mmss', () => {
    expect(parseDurationInput('130')).toBe(90);
    expect(parseDurationInput('90')).toBe(90);
    expect(parseDurationInput('5')).toBe(5);
    expect(parseDurationInput('1000')).toBe(600);
    expect(parseDurationInput('0')).toBe(0);
  });
  it('parses m:ss and h:mm:ss', () => {
    expect(parseDurationInput('1:30')).toBe(90);
    expect(parseDurationInput('0:05')).toBe(5);
    expect(parseDurationInput('90:00')).toBe(5400);
    expect(parseDurationInput('1:02:03')).toBe(3723);
  });
  it('trims whitespace and returns undefined for empty', () => {
    expect(parseDurationInput(' 1:30 ')).toBe(90);
    expect(parseDurationInput('')).toBeUndefined();
    expect(parseDurationInput('   ')).toBeUndefined();
  });
  it('rejects garbage and out-of-range parts', () => {
    for (const s of ['abc', '1:60', '1:2:60', '1:60:00', '-5', '1.5', '1::3', ':30', '1:']) {
      expect(parseDurationInput(s)).toBeUndefined();
    }
  });
  it('enforces the 86399 maximum', () => {
    expect(parseDurationInput('23:59:59')).toBe(86399);
    expect(parseDurationInput('24:00:00')).toBeUndefined();
    expect(parseDurationInput('99999999')).toBeUndefined();
  });
});

describe('formatDurationInput', () => {
  it('formats m:ss', () => {
    expect(formatDurationInput(0)).toBe('0:00');
    expect(formatDurationInput(5)).toBe('0:05');
    expect(formatDurationInput(90)).toBe('1:30');
    expect(formatDurationInput(3600)).toBe('60:00');
  });
  it('clamps negatives and rounds', () => {
    expect(formatDurationInput(-4)).toBe('0:00');
    expect(formatDurationInput(59.6)).toBe('1:00');
  });
  it('round-trips through parse', () => {
    expect(parseDurationInput(formatDurationInput(754))).toBe(754);
  });
});
