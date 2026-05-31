import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";

const ADMIN_URL =
  process.env.INTEGRATION_ADMIN_URL ??
  "postgres://playground:playground@localhost:5432/postgres";

const TEST_DB = process.env.INTEGRATION_DB ?? "mini_commerce_integration";

export const INTEGRATION_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  `postgres://playground:playground@localhost:5432/${TEST_DB}`;

// Idempotently create the integration database on the running dev Postgres,
// then apply migrations via the BFF's `prisma migrate deploy`. The dev DB
// (`mini_commerce_playground`) is left untouched.
export async function ensureIntegrationDb(): Promise<string> {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB}"`);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (!/already exists/i.test(msg)) throw err;
  } finally {
    await admin.$disconnect();
  }

  await runMigrateDeploy(INTEGRATION_URL);
  return INTEGRATION_URL;
}

function runMigrateDeploy(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@mini-commerce/bff", "exec", "prisma", "migrate", "deploy"],
      {
        env: { ...process.env, DATABASE_URL: url },
        stdio: "inherit",
      },
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`prisma migrate deploy exited ${code}`)),
    );
    child.on("error", reject);
  });
}
