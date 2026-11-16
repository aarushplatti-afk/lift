import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installKeyboardHandling, isKeyboardOpen } from '../keyboard';

class FakeVV extends EventTarget {
  height = 800;
}

describe('isKeyboardOpen', () => {
  it('uses a > 120 px threshold', () => {
    expect(isKeyboardOpen(800, 800)).toBe(false);
    expect(isKeyboardOpen(800, 680)).toBe(false);
    expect(isKeyboardOpen(800, 679)).toBe(true);
  });
});

describe('installKeyboardHandling', () => {
  let vv: FakeVV;
  beforeEach(() => {
    vv = new FakeVV();
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  });

  it('toggles data-keyboard on resize', () => {
    const off = installKeyboardHandling();
    expect(document.documentElement.dataset.keyboard).toBeUndefined();
    vv.height = 450;
    vv.dispatchEvent(new Event('resize'));
    expect(document.documentElement.dataset.keyboard).toBe('open');
    vv.height = 800;
    vv.dispatchEvent(new Event('resize'));
    expect(document.documentElement.dataset.keyboard).toBeUndefined();
    off();
  });

  it('scrolls only a hidden editable into view', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const spy = vi.fn();
    input.scrollIntoView = spy;
    input.focus();
    const off = installKeyboardHandling();
    vv.height = 450;
    input.getBoundingClientRect = () => ({ top: 300, bottom: 340 }) as DOMRect;
    vv.dispatchEvent(new Event('resize'));
    expect(spy).not.toHaveBeenCalled();
    input.getBoundingClientRect = () => ({ top: 600, bottom: 640 }) as DOMRect;
    vv.dispatchEvent(new Event('resize'));
    expect(spy).toHaveBeenCalledWith({ block: 'center' });
    off();
  });

  it('does not scroll non-editable focus', () => {
    const btn = document.createElement('button');
    document.body.append(btn);
    const spy = vi.fn();
    btn.scrollIntoView = spy;
    btn.focus();
    btn.getBoundingClientRect = () => ({ top: 600, bottom: 640 }) as DOMRect;
    const off = installKeyboardHandling();
    vv.height = 450;
    vv.dispatchEvent(new Event('resize'));
    expect(spy).not.toHaveBeenCalled();
    off();
  });

  it('cleanup removes listeners and attribute', () => {
    const off = installKeyboardHandling();
    vv.height = 450;
    vv.dispatchEvent(new Event('resize'));
    off();
    expect(document.documentElement.dataset.keyboard).toBeUndefined();
    vv.dispatchEvent(new Event('resize'));
    expect(document.documentElement.dataset.keyboard).toBeUndefined();
  });
});
