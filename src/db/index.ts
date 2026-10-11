import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Supabase (and most managed Postgres) requires TLS. Local connections stay plain.
// Set PGSSL_NO_VERIFY=1 if your provider uses a certificate node-postgres does not trust
// (e.g. some Supabase pooler endpoints).
const isLocalHost = (u: string) => /@(localhost|127\.0\.0\.1|\[::1\]|::1)(:|\/)/.test(u);
const usesSsl = (u: string) => {
  if (isLocalHost(u)) return false;
  if (/sslmode=(disable|allow)/i.test(u)) return false;
  return true;
};

const sslConfig = usesSsl(databaseUrl)
  ? { ssl: { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== "1" } }
  : {};

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ...sslConfig,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    connectionTimeoutMillis: 15_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
