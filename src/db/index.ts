import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Supabase (and most managed Postgres) requires TLS. Local connections stay plain.
// libpq's "sslmode=require" encrypts the connection but does NOT verify the certificate
// authority (only "verify-ca"/"verify-full" do). node-postgres now treats "require" as full
// verification, which fails against the Supabase pooler chain ("self-signed certificate in
// certificate chain"). We restore libpq semantics: verify only when explicitly requested.
// Set PGSSL_NO_VERIFY=1 to force verification off (or verify-full to force it on).
const isLocalHost = (u: string) => /@(localhost|127\.0\.0\.1|\[::1\]|::1)(:|\/)/.test(u);
const usesSsl = (u: string) => {
  if (isLocalHost(u)) return false;
  if (/sslmode=(disable|allow)/i.test(u)) return false;
  return true;
};
const wantsVerify = (u: string) => /sslmode=(verify-ca|verify-full)/i.test(u);

const sslConfig = usesSsl(databaseUrl)
  ? { ssl: { rejectUnauthorized: process.env.PGSSL_NO_VERIFY === "1" ? false : wantsVerify(databaseUrl) } }
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
