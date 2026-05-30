#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const steps = [
  ['typecheck', ['--filter', '@mini-commerce/e2e', 'typecheck']],
  ['playwright', ['--filter', '@mini-commerce/e2e', 'test:e2e']],
];

for (const [label, args] of steps) {
  console.log(`\n[e2e certify] ${label}\n`);
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
