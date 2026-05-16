import { defineConfig } from 'prisma/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prisma CLI skips .env auto-loading when a prisma.config.ts is present.
// Load the root .env manually so DATABASE_URL is available for direct CLI use.
if (!process.env.DATABASE_URL) {
  try {
    const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* .env is optional */ }
}

export default defineConfig({
  migrations: {
    seed: 'ts-node --project tsconfig.json --transpile-only prisma/seed.ts',
  },
});
