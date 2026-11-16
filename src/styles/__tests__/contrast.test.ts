/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, '..', 'tokens.css'), 'utf8');

type Rgb = [number, number, number];

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

function parse(blockText: string): Record<string, Rgb> {
  const out: Record<string, Rgb> = {};
  for (const m of blockText.matchAll(/--color-([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[m[1] as string] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const dark = parse(block(':root'));
const light = { ...dark, ...parse(block(':root:not(.dark)')) };

const TEXT_TOKENS = [
  'text-primary',
  'text-secondary',
  'accent',
  'danger',
  'success',
  'warning',
  'pr-gold',
];
const SURFACES = ['bg', 'surface', 'surface-2'];

describe.each([
  ['dark', dark],
  ['light', light],
])('%s theme contrast', (_name, theme) => {
  for (const token of TEXT_TOKENS) {
    for (const surface of SURFACES) {
      it(`${token} on ${surface} is at least 4.5:1`, () => {
        const fg = theme[token];
        const bg = theme[surface];
        expect(fg).toBeDefined();
        expect(bg).toBeDefined();
        expect(ratio(fg as Rgb, bg as Rgb)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('on-accent on accent is at least 4.5:1', () => {
    expect(ratio(theme['on-accent'] as Rgb, theme['accent'] as Rgb)).toBeGreaterThanOrEqual(4.5);
  });
});
