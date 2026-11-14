import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_REST_DONE, HAPTIC_TAP, isVibrationSupported, vibrate } from '../haptics';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('haptics', () => {
  it('is a no-op when unsupported', () => {
    expect(isVibrationSupported()).toBe(false);
    expect(() => vibrate(HAPTIC_TAP)).not.toThrow();
  });

  it('passes the pattern when supported', () => {
    const fn = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true });
    expect(isVibrationSupported()).toBe(true);
    vibrate(HAPTIC_TAP);
    vibrate(HAPTIC_REST_DONE);
    expect(fn).toHaveBeenNthCalledWith(1, 10);
    expect(fn).toHaveBeenNthCalledWith(2, [200, 100, 200]);
  });

  it('swallows exceptions', () => {
    const fn = vi.fn(() => {
      throw new Error('blocked');
    });
    Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true });
    expect(() => vibrate(5)).not.toThrow();
  });
});
