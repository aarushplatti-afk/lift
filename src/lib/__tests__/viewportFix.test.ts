import { describe, expect, it, vi } from 'vitest';
import { isEditing, isViewportShort, nudgeLayout } from '../viewportFix';

describe('isViewportShort', () => {
  it('flags a portrait viewport shorter than the screen by the status bar', () => {
    expect(
      isViewportShort({ innerHeight: 797, screenWidth: 390, screenHeight: 844, portrait: true }),
    ).toBe(true);
  });

  it('accepts a full-height portrait viewport and small rounding differences', () => {
    expect(
      isViewportShort({ innerHeight: 844, screenWidth: 390, screenHeight: 844, portrait: true }),
    ).toBe(false);
    expect(
      isViewportShort({ innerHeight: 841, screenWidth: 390, screenHeight: 844, portrait: true }),
    ).toBe(false);
  });

  it('uses the short screen side in landscape', () => {
    expect(
      isViewportShort({ innerHeight: 390, screenWidth: 390, screenHeight: 844, portrait: false }),
    ).toBe(false);
    expect(
      isViewportShort({ innerHeight: 340, screenWidth: 390, screenHeight: 844, portrait: false }),
    ).toBe(true);
  });
});

describe('nudgeLayout', () => {
  it('restores the element display', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const el = document.createElement('div');
    el.style.display = '';
    nudgeLayout(el);
    expect(el.style.display).toBe('');
  });
});

describe('nudgeLayout focus', () => {
  it('keeps focus on the previously focused button', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const root = document.createElement('div');
    const btn = document.createElement('button');
    root.appendChild(btn);
    document.body.appendChild(root);
    btn.focus();
    nudgeLayout(root);
    expect(document.activeElement).toBe(btn);
    root.remove();
  });
});

describe('isEditing', () => {
  it('is true for text fields and false for buttons or nothing', () => {
    expect(isEditing(document.createElement('input'))).toBe(true);
    expect(isEditing(document.createElement('textarea'))).toBe(true);
    expect(isEditing(document.createElement('select'))).toBe(true);
    expect(isEditing(document.createElement('button'))).toBe(false);
    expect(isEditing(null)).toBe(false);
  });
});
