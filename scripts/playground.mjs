#!/usr/bin/env node
/**
 * Developer utility CLI for the mini-commerce engineering playground.
 *
 * Usage:
 *   node scripts/playground.mjs <command>
 *
 * Commands are exposed via root package.json as pnpm pg:<command>.
 */

import { spawnSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';

const COMPOSE_FILE = 'infra/docker/compose.yaml';
const BFF_PORT = 3001;
const WEB_PORT = 3000;
const API_BASE = `http://localhost:${BFF_PORT}`;

// ANSI helpers — degrade gracefully when NO_COLOR is set.
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const c = {
  green: (s) => useColor ? `\x1b[32m${s}\x1b[0m` : s,
  red:   (s) => useColor ? `\x1b[31m${s}\x1b[0m` : s,
  yellow:(s) => useColor ? `\x1b[33m${s}\x1b[0m` : s,
  bold:  (s) => useColor ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:   (s) => useColor ? `\x1b[2m${s}\x1b[0m`  : s,
};

const log   = (msg = '')  => console.log(msg);
const pass  = (label)     => log(`  ${c.green('✓')} ${label}`);
const fail  = (label)     => log(`  ${c.red('✗')} ${label}`);
const warn  = (label)     => log(`  ${c.yellow('!')} ${label}`);
const info  = (label)     => log(`  ${c.dim('→')} ${label}`);

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------

const COMMANDS = { doctor, up, dev, smoke, seed, reset, down, logs, open };

async function main() {
  const command = process.argv[2];

  if (!command || !COMMANDS[command]) {
    log(c.bold('playground — developer utility CLI'));
    log('');
    log(`Usage: ${c.bold('pnpm pg:<command>')}`);
    log('');
    log('Commands:');
    for (const name of Object.keys(COMMANDS)) {
      log(`  pg:${c.bold(name)}`);
    }
    log('');
    process.exit(1);
  }

  await COMMANDS[command]();
}

// ---------------------------------------------------------------------------
// doctor — validate local prerequisites
// ---------------------------------------------------------------------------

async function doctor() {
  log(c.bold('\nPlayground Doctor\n'));
  let allOk = true;

  // Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  if (major >= 20) {
    pass(`Node.js ${nodeVersion}`);
  } else {
    fail(`Node.js ${nodeVersion} — requires >= 20.0.0`);
    allOk = false;
  }

  // pnpm
  if (commandExists('pnpm')) {
    const ver = capture('pnpm --version');
    pass(`pnpm ${ver.trim()}`);
  } else {
    fail('pnpm not found');
    info('Install: npm install -g pnpm@9');
    allOk = false;
  }

  // Docker
  if (commandExists('docker')) {
    try {
      const ver = capture('docker --version');
      pass(ver.trim());
    } catch {
      fail('Docker binary found but not responding — is Docker Desktop running?');
      allOk = false;
    }
  } else {
    fail('docker not found — install Docker Desktop');
    allOk = false;
  }

  // Docker Compose (bundled as `docker compose` plugin in recent versions)
  try {
    const ver = capture('docker compose version');
    pass(ver.trim());
  } catch {
    fail('docker compose not available — update Docker Desktop to 4.x+');
    allOk = false;
  }

  // Environment files
  const webEnvLocal = existsSync('apps/web/.env.local');
  if (webEnvLocal) {
    pass('apps/web/.env.local exists');
  } else {
    warn('apps/web/.env.local not found');
    info('Copy the example: cp apps/web/.env.example apps/web/.env.local');
  }

  // Port availability / occupancy
  log('');
  const bffUp = await portInUse(BFF_PORT);
  if (bffUp) {
    pass(`Port ${BFF_PORT} (BFF) is responding — service is running`);
  } else {
    info(`Port ${BFF_PORT} (BFF) is not in use — run pnpm pg:dev to start`);
  }

  const webUp = await portInUse(WEB_PORT);
  if (webUp) {
    pass(`Port ${WEB_PORT} (web) is responding — service is running`);
  } else {
    info(`Port ${WEB_PORT} (web) is not in use — run pnpm pg:dev to start`);
  }

  log('');
  if (allOk) {
    log(c.green('All required prerequisites are available.'));
  } else {
    log(c.red('Some prerequisites are missing. Resolve the issues above before continuing.'));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// up — start local infrastructure (postgres, otel-collector)
// ---------------------------------------------------------------------------

async function up() {
  log(c.bold('\nStarting local infrastructure...\n'));
  // Only start infra services. The BFF and web app run locally via pg:dev.
  compose(['up', '-d', 'postgres', 'otel-collector']);
  log('');
  pass('Postgres is running on port 5432');
  pass('OpenTelemetry Collector is running on ports 4317 / 4318');
  log('');
  info(`Run ${c.bold('pnpm pg:dev')} to start the web app and BFF in watch mode`);
  info(`Run ${c.bold('pnpm pg:doctor')} to validate the full local environment`);
}

// ---------------------------------------------------------------------------
// dev — start development applications via Turborepo
// ---------------------------------------------------------------------------

async function dev() {
  log(c.bold('\nStarting development applications...\n'));
  log(c.dim('Tip: run pnpm pg:up first to ensure Postgres is available.\n'));
  log(c.dim('Ctrl+C to stop all processes.\n'));
  // Turborepo runs dev scripts for all workspace apps in parallel.
  const result = spawnSync('pnpm', ['turbo', 'run', 'dev'], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ---------------------------------------------------------------------------
// smoke — minimal endpoint validation without k6
// ---------------------------------------------------------------------------

async function smoke() {
  log(c.bold('\nPlayground Smoke Test\n'));
  log(c.dim(`Target: ${API_BASE}\n`));

  // Smoke checks run sequentially: cart and checkout share in-memory state
  // and the order assertions depend on it. Running in parallel would race.
  const results = [];
  results.push(
    await check('GET  /health', () =>
      fetchJson(`${API_BASE}/health`, { expectStatus: 200 }),
    ),
  );
  results.push(
    await check('GET  /catalog/products', () =>
      fetchJson(`${API_BASE}/catalog/products`, { expectStatus: 200 }),
    ),
  );
  results.push(
    await check('GET  /catalog/products/prod_espresso', () =>
      fetchJson(`${API_BASE}/catalog/products/prod_espresso`, { expectStatus: 200 }),
    ),
  );
  results.push(
    await check('POST /cart/items', () =>
      fetchJson(`${API_BASE}/cart/items`, {
        method: 'POST',
        body: { productId: 'prod_espresso', quantity: 2 },
        expectStatus: 201,
      }),
    ),
  );
  results.push(
    await check('GET  /cart', () =>
      fetchJson(`${API_BASE}/cart`, { expectStatus: 200 }),
    ),
  );
  results.push(
    await check('POST /checkout', () =>
      fetchJson(`${API_BASE}/checkout`, {
        method: 'POST',
        body: { customerName: 'Smoke Customer' },
        expectStatus: 201,
      }),
    ),
  );
  results.push(
    await check('GET  /orders/ord_demo', () =>
      fetchJson(`${API_BASE}/orders/ord_demo`, { expectStatus: 200 }),
    ),
  );
  results.push(
    await check('POST /orders/ord_demo/manage (mark_prepared)', () =>
      fetchJson(`${API_BASE}/orders/ord_demo/manage`, {
        method: 'POST',
        body: { action: 'mark_prepared' },
        expectStatus: 202,
      }),
    ),
  );

  log('');
  const passed = results.filter(Boolean).length;
  const total  = results.length;

  if (passed === total) {
    log(c.green(`All ${total} smoke checks passed.`));
  } else {
    log(c.red(`${passed}/${total} smoke checks passed.`));
    log('');
    log(c.dim(`Ensure the BFF is running: pnpm pg:dev`));
    process.exit(1);
  }
}

async function check(label, fn) {
  try {
    await fn();
    pass(label);
    return true;
  } catch (err) {
    fail(`${label}  — ${err.message}`);
    return false;
  }
}

async function fetchJson(url, { method = 'GET', body, expectStatus } = {}) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (expectStatus && res.status !== expectStatus) {
    throw new Error(`Expected HTTP ${expectStatus}, got ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// seed — placeholder for local mock data
// ---------------------------------------------------------------------------

async function seed() {
  log(c.bold('\nSeed\n'));
  log(c.yellow('The BFF currently serves deterministic mock responses in-memory.'));
  log('No database seeding is needed at this stage.');
  log('');
  info('Catalog, cart, checkout, and orders are all mocked inside the BFF modules.');
  info('Order ord_demo is pre-seeded so /orders endpoints are usable immediately.');
  // TODO: Wire Prisma and replace with a real seed script (prisma db seed).
  info('TODO: Add a real seed script once Prisma persistence lands.');
}

// ---------------------------------------------------------------------------
// reset — stop containers and explain volume removal
// ---------------------------------------------------------------------------

async function reset() {
  log(c.bold('\nResetting local environment...\n'));
  log(c.yellow('This stops all containers. Postgres data volumes are preserved.'));
  log(c.dim('To also remove volumes (destructive): docker compose -f infra/docker/compose.yaml down -v\n'));
  compose(['down']);
  log('');
  pass('All containers stopped.');
  info(`Run ${c.bold('pnpm pg:up')} to bring infrastructure back up.`);
}

// ---------------------------------------------------------------------------
// down — stop Docker Compose services
// ---------------------------------------------------------------------------

async function down() {
  log(c.bold('\nStopping services...\n'));
  compose(['down']);
  log('');
  pass('Services stopped.');
}

// ---------------------------------------------------------------------------
// logs — stream Docker Compose logs
// ---------------------------------------------------------------------------

async function logs() {
  log(c.bold('\nDocker Compose logs\n'));
  log(c.dim('Streaming (Ctrl+C to stop)...\n'));
  const result = spawnSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, 'logs', '--follow'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0 && result.status !== null) process.exit(result.status);
}

// ---------------------------------------------------------------------------
// open — print local URLs
// ---------------------------------------------------------------------------

async function open() {
  log(c.bold('\nLocal URLs\n'));
  log(`  Web app             ${c.green(`http://localhost:${WEB_PORT}`)}`);
  log(`  BFF / API           ${c.green(`http://localhost:${BFF_PORT}`)}`);
  log(`  Health endpoint     ${c.green(`http://localhost:${BFF_PORT}/health`)}`);
  log(`  OTLP HTTP           ${c.dim('http://localhost:4318')}  (otel-collector)`);
  log(`  OTLP gRPC           ${c.dim('http://localhost:4317')}  (otel-collector)`);
  log('');
  log(c.dim('See docs/local-development.md for full setup instructions.'));
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function capture(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
}

function compose(args) {
  const result = spawnSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, ...args],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    log(c.red(`\ndocker compose ${args.join(' ')} failed`));
    log(c.dim('Is Docker Desktop running? Try: pnpm pg:doctor'));
    process.exit(result.status ?? 1);
  }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error',   () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error(c.red(`Error: ${err.message}`));
  process.exit(1);
});
