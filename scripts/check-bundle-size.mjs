import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const distDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'dist');
const budgetArg = args.find((a) => a.startsWith('--budget-kb='));
const budgetKb = budgetArg ? Number(budgetArg.split('=')[1]) : 250;
const warnKb = Math.min(230, budgetKb);

const html = readFileSync(join(distDir, 'index.html'), 'utf8');
const refs = new Set();
for (const m of html.matchAll(/<script\b[^>]*\btype="module"[^>]*>/g)) {
  const src = /\bsrc="([^"]+)"/.exec(m[0]);
  if (src) refs.add(src[1]);
}
for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*>/g)) {
  const href = /\bhref="([^"]+)"/.exec(m[0]);
  if (href) refs.add(href[1]);
}
if (refs.size === 0) {
  console.error('check-bundle-size: no entry or modulepreload references in index.html');
  process.exit(1);
}

let total = 0;
for (const ref of refs) {
  const rel = ref.replace(/^\/lift\//, '').replace(/^\//, '');
  const size = gzipSync(readFileSync(join(distDir, rel))).length;
  total += size;
  console.log(`  ${(size / 1000).toFixed(1).padStart(7)} kB  ${rel}`);
}
const kb = total / 1000;
console.log(`Initial JS (gzip): ${kb.toFixed(1)} kB (budget ${budgetKb} kB)`);
if (kb > budgetKb) {
  console.error(`check-bundle-size: over budget by ${(kb - budgetKb).toFixed(1)} kB`);
  process.exit(1);
}
if (kb > warnKb) console.warn(`check-bundle-size: warning, above ${warnKb} kB`);
