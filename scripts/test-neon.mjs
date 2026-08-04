// The durable write's idempotency is a property of real foreign keys, so its
// suite needs a real connection. Opt-in only: `pnpm test` must never reach the
// shared dev/prod database. DATABASE_URL arrives via Prisma's own .env loading.
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  ['./node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, NIGHTFALL_TEST_NEON: '1' } },
);
process.exit(result.status ?? 1);
