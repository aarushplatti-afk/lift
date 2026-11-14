import { spawn, spawnSync } from 'node:child_process';

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error('Usage: node scripts/with-local-supabase.mjs <command> [args...]');
  process.exit(2);
}

function fail(message) {
  console.error(`\nLocal Supabase is not running or not reachable: ${message}`);
  console.error('Start it with `npx supabase start` (requires Docker), then retry.\n');
  process.exit(1);
}

const status = spawnSync('npx supabase status -o env', {
  shell: true,
  encoding: 'utf8',
});
if (status.error || status.status !== 0) {
  fail((status.stderr || status.error?.message || 'supabase status failed').trim());
}

// Only the public values are captured; privileged keys are never kept.
const wanted = new Set(['API_URL', 'ANON_KEY', 'PUBLISHABLE_KEY']);
const values = {};
for (const line of status.stdout.split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (!match || !wanted.has(match[1])) continue;
  values[match[1]] = match[2].replace(/^"|"$/g, '');
}

const url = values.API_URL;
const key = values.ANON_KEY || values.PUBLISHABLE_KEY;
if (!url || !key) {
  fail('API_URL or ANON_KEY/PUBLISHABLE_KEY missing from `supabase status -o env`.');
}

const child = spawn(command.join(' '), {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    SUPABASE_TEST_URL: url,
    SUPABASE_TEST_KEY: key,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: key,
  },
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
