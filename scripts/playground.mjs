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
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { platform } from 'node:os';

// Auto-bootstrap .env from .env.example so the README quick start is
// zero-ceremony. Defaults in .env.example are safe local-only values.
const ENV_PATH = new URL('../.env', import.meta.url);
const ENV_EXAMPLE_PATH = new URL('../.env.example', import.meta.url);
let envBootstrapped = false;
try {
  if (!existsSync(ENV_PATH) && existsSync(ENV_EXAMPLE_PATH)) {
    copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    envBootstrapped = true;
  }
} catch { /* fall through — env load below will surface the issue */ }

// Load root .env into process.env; silently skip if absent.
try {
  const raw = readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env is optional */ }

const COMPOSE_FILE = 'infra/docker/compose.yaml';
const COMPOSE_DEV_FILE = 'infra/docker/compose.dev.yaml';
const PERF_COMPOSE_FILE = 'infra/docker/compose.performance.yaml';
const PERF_DIR = 'tests/performance/k6';
const PERF_REPORTS_DIR = `${PERF_DIR}/reports`;
const BFF_PORT = Number(process.env.BFF_PORT ?? 3001);
const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);
const VIZ_PORT = Number(process.env.VIZ_PORT ?? 3002);
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

const COMMANDS = {
  doctor,
  up,
  restart,
  dev,
  'dev:host': devHost,
  smoke,
  seed,
  reset,
  down,
  logs,
  open,
  status,
  'perf:smoke': perfSmoke,
  'perf:checkout-flow': perfCheckoutFlow,
  'perf:read-heavy': perfReadHeavy,
  'perf:open-report': perfOpenReport,
  'perf:clean': perfClean,
};

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

  // Root .env file — auto-bootstrapped above if missing.
  if (existsSync('.env')) {
    if (envBootstrapped) {
      pass('.env created from .env.example');
    } else {
      pass('.env exists');
    }
  } else {
    fail('.env not found and .env.example missing — restore .env.example');
    allOk = false;
  }

  // Port availability / occupancy
  log('');
  const bffUp = await portInUse(BFF_PORT);
  if (bffUp) {
    pass(`Port ${BFF_PORT} (BFF) is responding — service is running`);
  } else {
    info(`Port ${BFF_PORT} (BFF) is not in use — run pnpm pg:up to start`);
  }

  const webUp = await portInUse(WEB_PORT);
  if (webUp) {
    pass(`Port ${WEB_PORT} (web) is responding — service is running`);
  } else {
    info(`Port ${WEB_PORT} (web) is not in use — run pnpm pg:up web to start`);
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
// up — start local infrastructure with optional target
// ---------------------------------------------------------------------------

async function up(targetOverride) {
  const target = targetOverride ?? process.argv[3] ?? 'core';
  const validTargets = ['core', 'web', 'viz', 'full'];
  if (!validTargets.includes(target)) {
    log(c.red(`Unknown target "${target}". Use: ${validTargets.join(' | ')}`));
    process.exit(1);
  }

  log(c.bold(`\nStarting local app stack (${target})...\n`));

  if (envBootstrapped) {
    pass('.env created from .env.example');
  }

  // Port collision pre-flight — stop existing Docker services if port is occupied.
  if (await portInUse(BFF_PORT)) {
    warn(`Port ${BFF_PORT} is in use — stopping existing services...`);
    compose(['down'], { profiles: ['web', 'viz'] });
    // Give the port a moment to free after container shutdown.
    await new Promise((r) => setTimeout(r, 1500));
    if (await portInUse(BFF_PORT)) {
      const pid = getPidOnPort(BFF_PORT);
      fail(`Port ${BFF_PORT} is still occupied${pid ? ` (PID ${pid})` : ''} after stopping Docker services.`);
      info(`Kill the non-Docker process: kill ${pid ?? '<PID>'}`);
      process.exit(1);
    }
    pass(`Port ${BFF_PORT} is free`);
  }

  // 1. Start postgres + otel-collector and wait for healthy
  compose(['up', '-d', '--wait', 'postgres', 'otel-collector']);
  pass('Postgres is healthy');

  // 2. Run schema migrations (idempotent)
  info('Running prisma migrate deploy...');
  const migrateResult = spawnSync(
    'pnpm',
    ['--filter', '@mini-commerce/bff', 'exec', 'prisma', 'migrate', 'deploy'],
    { stdio: 'inherit', shell: false },
  );
  if (migrateResult.status !== 0) process.exit(migrateResult.status ?? 1);
  pass('Schema is up to date');

  // 3. Seed (idempotent — seed.ts uses upsert)
  info('Running prisma db seed...');
  const seedResult = spawnSync(
    'pnpm',
    ['--filter', '@mini-commerce/bff', 'exec', 'prisma', 'db', 'seed'],
    { stdio: 'inherit', shell: false },
  );
  if (seedResult.status !== 0) process.exit(seedResult.status ?? 1);
  pass('Seed complete');

  // 4. Start BFF and any additional services for the requested target
  const profiles = targetToProfiles(target);
  const extra = additionalServices(target);
  compose(['up', '-d', '--wait', ...profiles, 'bff', ...extra]);

  log('');
  pass(`BFF is running on http://localhost:${BFF_PORT}`);
  if (extra.includes('web')) pass(`Web is running on http://localhost:${WEB_PORT}`);
  if (extra.includes('visualizer-3d')) pass('Visualizer is running on http://localhost:3002');
  log('');
  info(`Run ${c.bold('pnpm pg:dev')} for hot-reload (docker compose watch)`);
  info(`Run ${c.bold('pnpm pg:status')} to check service health`);
}

// ---------------------------------------------------------------------------
// dev — docker compose watch (hot-reload for bff + web)
// ---------------------------------------------------------------------------

async function dev() {
  log(c.bold('\nStarting dev stack (docker compose watch)...\n'));
  log(c.dim('Tip: run pnpm pg:up first so Postgres is healthy and migrations are applied.\n'));
  log(c.dim('Ctrl+C to stop.\n'));
  const result = spawnSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, '-f', COMPOSE_DEV_FILE, '--profile', 'web', 'watch'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ---------------------------------------------------------------------------
// dev:host — start development applications via Turborepo on the host
// ---------------------------------------------------------------------------

async function devHost() {
  log(c.bold('\nStarting development applications (host mode)...\n'));
  log(c.dim('Tip: run pnpm pg:up core first to ensure Postgres is available.\n'));
  log(c.dim('Ctrl+C to stop all processes.\n'));
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
  results.push(
    await check('GET  /visualization-data', async () => {
      const body = await fetchJson(`${API_BASE}/visualization-data`, {
        expectStatus: 200,
      });
      if (!Array.isArray(body?.items) || body.items.length === 0) {
        throw new Error('Expected non-empty items array');
      }
    }),
  );

  log('');
  const passed = results.filter(Boolean).length;
  const total  = results.length;

  if (passed === total) {
    log(c.green(`All ${total} smoke checks passed.`));
  } else {
    log(c.red(`${passed}/${total} smoke checks passed.`));
    log('');
    log(c.dim(`Ensure the BFF is running: pnpm pg:up`));
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
// seed — run prisma db seed
// ---------------------------------------------------------------------------

async function seed() {
  log(c.bold('\nSeed\n'));
  info('Running prisma db seed...');
  const result = spawnSync(
    'pnpm',
    ['--filter', '@mini-commerce/bff', 'exec', 'prisma', 'db', 'seed'],
    { stdio: 'inherit', shell: false },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  pass('Seed complete.');
}

// ---------------------------------------------------------------------------
// status — show running service health and ports
// ---------------------------------------------------------------------------

async function status() {
  log(c.bold('\nService Status\n'));
  try {
    const raw = capture(`docker compose -f ${COMPOSE_FILE} ps --format json`);
    const lines = raw.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      info('No services running. Run pnpm pg:up to start.');
      log('');
      return;
    }
    const services = lines.map((l) => JSON.parse(l));
    const col = (s, w) => String(s).padEnd(w).slice(0, w);
    log(`  ${c.bold(col('SERVICE', 20))} ${c.bold(col('STATUS', 12))} ${c.bold(col('HEALTH', 12))} PORTS`);
    for (const svc of services) {
      const health = svc.Health || '—';
      const ports = svc.Publishers
        ?.filter((p) => p.PublishedPort)
        .map((p) => `${p.PublishedPort}→${p.TargetPort}`)
        .join(', ') || '—';
      const statusColor = svc.State === 'running' ? c.green : c.red;
      log(`  ${col(svc.Service, 20)} ${statusColor(col(svc.State, 12))} ${col(health, 12)} ${ports}`);
    }
  } catch {
    warn('Could not reach Docker. Is Docker Desktop running?');
  }
  log('');
}

// ---------------------------------------------------------------------------
// reset — stop containers and explain volume removal
// ---------------------------------------------------------------------------

async function reset() {
  log(c.bold('\nResetting local environment...\n'));
  log(c.yellow('This stops all containers. Postgres data volumes are preserved.'));
  log(c.dim('To also remove volumes (destructive): docker compose --profile web --profile viz -f infra/docker/compose.yaml down -v\n'));
  compose(['down'], { profiles: ['web', 'viz'] });
  log('');
  pass('All containers stopped.');
  info(`Run ${c.bold('pnpm pg:up')} to bring infrastructure back up.`);
}

// ---------------------------------------------------------------------------
// down — stop Docker Compose services
// ---------------------------------------------------------------------------

async function down() {
  log(c.bold('\nStopping services...\n'));
  compose(['down'], { profiles: ['web', 'viz'] });
  log('');
  pass('Services stopped.');
}

// ---------------------------------------------------------------------------
// restart — stop all services then bring them back up
// ---------------------------------------------------------------------------

async function restart() {
  const target = process.argv[3] ?? 'full';
  log(c.bold(`\nRestarting local app stack (${target})...\n`));
  compose(['down'], { profiles: ['web', 'viz'] });
  pass('Services stopped');
  log('');
  await up(target);
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
  log(`  Web app             ${c.green(`http://localhost:${WEB_PORT}`)}  (entry point — links every surface)`);
  log(`  BFF / API           ${c.green(`http://localhost:${BFF_PORT}`)}`);
  log(`  Health endpoint     ${c.green(`http://localhost:${BFF_PORT}/health`)}`);
  log(`  3D Visualizer       ${c.green(`http://localhost:${VIZ_PORT}`)}  (standalone; embedded at /visualizer, needs 'up viz' or 'up full')`);
  log(`  OTLP HTTP           ${c.dim('http://localhost:4318')}  (otel-collector)`);
  log(`  OTLP gRPC           ${c.dim('http://localhost:4317')}  (otel-collector)`);
  log('');
  log(c.dim('See docs/local-development.md for full setup instructions.'));
}

// ---------------------------------------------------------------------------
// perf:smoke — run the k6 smoke scenario via Docker Compose
// ---------------------------------------------------------------------------

async function perfSmoke() {
  log(c.bold('\nPerformance smoke (k6)\n'));

  // Default the in-container BASE_URL to the host gateway. Users can
  // override on the command line (e.g. BASE_URL=https://staging.example).
  const baseUrl = process.env.BASE_URL ?? 'http://host.docker.internal:3001';
  const scenario = 'scenarios/smoke/smoke.js';
  const summaryPath = '/scripts/reports/smoke-summary.json';

  info(`Target  : ${baseUrl}`);
  info(`Scenario: ${scenario}`);
  info(`Summary : ${PERF_REPORTS_DIR}/smoke-summary.json`);
  log('');

  if (platform() === 'linux') {
    info('Linux note: host.docker.internal is mapped via extra_hosts in compose.performance.yaml.');
  }

  // First-run hint: make sure the BFF is up before we spend Docker pull
  // time on a guaranteed-failure run.
  const bffUp = await portInUse(BFF_PORT);
  if (!bffUp && (baseUrl.includes('localhost') || baseUrl.includes('host.docker.internal'))) {
    warn(`BFF does not appear to be listening on :${BFF_PORT}. Start it with: pnpm pg:up`);
    log('');
  }

  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      PERF_COMPOSE_FILE,
      'run',
      '--rm',
      '-e',
      `BASE_URL=${baseUrl}`,
      'k6',
      'run',
      '--summary-export',
      summaryPath,
      `/scripts/${scenario}`,
    ],
    { stdio: 'inherit' },
  );

  log('');
  if (result.status === 0) {
    pass('k6 smoke completed.');
    info(`Summary written to ${PERF_REPORTS_DIR}/smoke-summary.json`);
  } else {
    fail(`k6 smoke failed (exit code ${result.status ?? 'unknown'}).`);
    info('Re-run with verbose output: docker compose -f infra/docker/compose.performance.yaml run --rm k6 run --verbose /scripts/scenarios/smoke/smoke.js');
    process.exit(result.status ?? 1);
  }
}

// perf:checkout-flow — run the k6 checkout-flow scenario via Docker Compose
// ---------------------------------------------------------------------------

async function perfCheckoutFlow() {
  log(c.bold('\nPerformance checkout-flow (k6)\n'));

  const baseUrl = process.env.BASE_URL ?? 'http://host.docker.internal:3001';
  const scenario = 'scenarios/checkout-flow/checkout-flow.js';
  const summaryPath = '/scripts/reports/checkout-flow-summary.json';

  info(`Target  : ${baseUrl}`);
  info(`Scenario: ${scenario}`);
  info(`Summary : ${PERF_REPORTS_DIR}/checkout-flow-summary.json`);
  log('');

  const bffUp = await portInUse(BFF_PORT);
  if (!bffUp && (baseUrl.includes('localhost') || baseUrl.includes('host.docker.internal'))) {
    warn(`BFF does not appear to be listening on :${BFF_PORT}. Start it with: pnpm pg:up`);
    log('');
  }

  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      PERF_COMPOSE_FILE,
      'run',
      '--rm',
      '-e',
      `BASE_URL=${baseUrl}`,
      'k6',
      'run',
      '--summary-export',
      summaryPath,
      `/scripts/${scenario}`,
    ],
    { stdio: 'inherit' },
  );

  log('');
  if (result.status === 0) {
    pass('k6 checkout-flow completed.');
    info(`Summary written to ${PERF_REPORTS_DIR}/checkout-flow-summary.json`);
  } else {
    fail(`k6 checkout-flow failed (exit code ${result.status ?? 'unknown'}).`);
    process.exit(result.status ?? 1);
  }
}

// perf:read-heavy — run the k6 read-heavy scenario via Docker Compose
// ---------------------------------------------------------------------------

async function perfReadHeavy() {
  log(c.bold('\nPerformance read-heavy (k6)\n'));

  const baseUrl = process.env.BASE_URL ?? 'http://host.docker.internal:3001';
  const scenario = 'scenarios/read-heavy/read-heavy.js';
  const summaryPath = '/scripts/reports/read-heavy-summary.json';

  info(`Target  : ${baseUrl}`);
  info(`Scenario: ${scenario}`);
  info(`Summary : ${PERF_REPORTS_DIR}/read-heavy-summary.json`);
  log('');

  const bffUp = await portInUse(BFF_PORT);
  if (!bffUp && (baseUrl.includes('localhost') || baseUrl.includes('host.docker.internal'))) {
    warn(`BFF does not appear to be listening on :${BFF_PORT}. Start it with: pnpm pg:up`);
    log('');
  }

  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      PERF_COMPOSE_FILE,
      'run',
      '--rm',
      '-e',
      `BASE_URL=${baseUrl}`,
      'k6',
      'run',
      '--summary-export',
      summaryPath,
      `/scripts/${scenario}`,
    ],
    { stdio: 'inherit' },
  );

  log('');
  if (result.status === 0) {
    pass('k6 read-heavy completed.');
    info(`Summary written to ${PERF_REPORTS_DIR}/read-heavy-summary.json`);
  } else {
    fail(`k6 read-heavy failed (exit code ${result.status ?? 'unknown'}).`);
    process.exit(result.status ?? 1);
  }
}

// ---------------------------------------------------------------------------
// perf:open-report — print the location of the latest k6 report
// ---------------------------------------------------------------------------

async function perfOpenReport() {
  log(c.bold('\nLatest k6 report\n'));

  if (!existsSync(PERF_REPORTS_DIR)) {
    warn(`${PERF_REPORTS_DIR} does not exist yet — run pnpm pg:perf:smoke first.`);
    return;
  }

  const entries = readdirSync(PERF_REPORTS_DIR).filter((f) => !f.startsWith('.'));
  if (entries.length === 0) {
    warn('No reports found — run pnpm pg:perf:smoke first.');
    return;
  }

  for (const name of entries.sort()) {
    info(`${PERF_REPORTS_DIR}/${name}`);
  }
  log('');
  log(c.dim('Tip: pipe a JSON summary through jq to inspect thresholds, e.g.:'));
  log(c.dim(`  jq '.metrics.http_req_duration' ${PERF_REPORTS_DIR}/smoke-summary.json`));
}

// ---------------------------------------------------------------------------
// perf:clean — remove generated performance reports
// ---------------------------------------------------------------------------

async function perfClean() {
  log(c.bold('\nCleaning k6 reports\n'));

  if (!existsSync(PERF_REPORTS_DIR)) {
    info(`${PERF_REPORTS_DIR} does not exist — nothing to clean.`);
    return;
  }

  let removed = 0;
  for (const name of readdirSync(PERF_REPORTS_DIR)) {
    if (name === '.gitkeep') continue;
    rmSync(`${PERF_REPORTS_DIR}/${name}`, { recursive: true, force: true });
    removed += 1;
  }

  pass(`Removed ${removed} report artifact${removed === 1 ? '' : 's'}.`);
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

// profiles must be passed here (not inside args) — docker compose requires
// --profile as a global flag before the subcommand, not after.
function compose(args, { profiles = [] } = {}) {
  const profileFlags = profiles.flatMap((p) => ['--profile', p]);
  const result = spawnSync(
    'docker',
    ['compose', ...profileFlags, '-f', COMPOSE_FILE, ...args],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    log(c.red(`\ndocker compose ${[...profileFlags, ...args].join(' ')} failed`));
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

function getPidOnPort(port) {
  try {
    return capture(`lsof -ti:${port}`).trim() || null;
  } catch { return null; }
}

function targetToProfiles(target) {
  const flags = [];
  if (target === 'web' || target === 'full') flags.push('--profile', 'web');
  if (target === 'viz' || target === 'full') flags.push('--profile', 'viz');
  return flags;
}

function additionalServices(target) {
  if (target === 'web') return ['web'];
  if (target === 'viz') return ['visualizer-3d'];
  if (target === 'full') return ['web', 'visualizer-3d'];
  return [];
}

// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error(c.red(`Error: ${err.message}`));
  process.exit(1);
});
