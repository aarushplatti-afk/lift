import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/;
const JWT = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function jwtRole(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role;
  } catch {
    return undefined;
  }
}

const failures = [];

for (const file of walk(distDir)) {
  const text = readFileSync(file, 'latin1');
  if (SECRET_KEY.test(text)) failures.push(`${file}: sb_secret_ key pattern`);
  for (const token of text.match(JWT) ?? []) {
    if (jwtRole(token) === 'service_role') failures.push(`${file}: service_role JWT`);
  }
}

const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
if (anon.startsWith('sb_secret_')) failures.push('VITE_SUPABASE_ANON_KEY: is an sb_secret_ key');
if (jwtRole(anon) === 'service_role') failures.push('VITE_SUPABASE_ANON_KEY: is a service_role JWT');

if (failures.length > 0) {
  for (const f of failures) console.error(`SECRET LEAK: ${f}`);
  process.exit(1);
}
console.log(`check-dist-secrets: ${distDir} clean`);
