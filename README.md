# Container & Document Tracking System

Full-stack app (Next.js App Router · TypeScript · Tailwind · PostgreSQL via Drizzle ORM) for tracking containers,
IM7 / IM4 / Exit documents, expiry dates, workflow stages, errors, reports and e-mail alerts.

> Note: the platform this was built on is Next.js + Drizzle, so the "Express/Prisma" suggestion was implemented as
> Next.js route handlers + Drizzle. The layering is the same: data layer → business logic (`src/lib`) → API (`src/app/api`) → UI.

## Supabase setup (database)

This app uses Drizzle ORM over a plain Postgres connection, so Supabase works as the managed Postgres backend.

1. Copy the env template and fill it in:
   ```bash
   cp .env.example .env
   ```
2. Set `DATABASE_URL` to your Supabase connection string. **URL-encode special characters in the password**
   (`+` → `%2B`, `&` → `%26`, `@` → `%40`). Example:
   ```
   DATABASE_URL=postgresql://postgres:My%2BPa%26ss@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
   ```
   * Project ref for this app: `yjwgdqcyttsspi` → host `db.yjwgdqcyttsspi.supabase.co`.
   * If your network is IPv4-only, the direct host is not reachable — use **Connect → Session pooler** instead:
     `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
3. Create the schema in Supabase:
   ```bash
   npx drizzle-kit push
   ```
4. Start the app (`npm run dev`). On first boot it creates the first administrator (from `ADMIN_EMAIL` /
   `ADMIN_PASSWORD`) plus the default expiry rules and workflow stages. No sample data:
   ```bash
   npm run dev
   ```

Connection notes:
* TLS is enabled automatically for any non-local host. If your provider's certificate is not trusted by
  `node-postgres`, set `PGSSL_NO_VERIFY=1` in `.env`.
* The Supabase **publishable/anon key** is not required for the database connection (the app talks to Postgres
  directly); it is only listed for reference.

## Supabase setup (document storage)

Uploaded files (IM7 / IM4 / Exit scans, invoices, etc.) are stored in **Supabase Storage** and indexed in the
`record_documents` table.

1. In Supabase → **Storage**, create a **private** bucket (default name `documents`).
2. In Supabase → **Project Settings → API**, copy the `service_role` key and set it in `.env`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   SUPABASE_STORAGE_BUCKET=documents
   ```
   The service-role key is **server-side only** — never expose it to the browser.
3. Uploads are attached to a record from the record page (**Uploaded files** card). Viewing requires
   `records.view`; uploading / deleting requires `records.documents` (enabled for staff by default, configurable
   in Settings → Roles & Permissions). Downloads use short-lived signed URLs.

## First administrator
No demo or sample data is created. The first administrator is created on first start from the environment:
set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first run, then sign in with those credentials.
Additional users are created from **Users** by an administrator.

## Architecture (single source of truth = the database)
```
src/lib/validation.ts   shared rules (IM7→S, IM4→C, Exit→X), expiry math – used by browser AND server
src/lib/records.ts      create / edit / move / archive, duplicate check, expiry calculation, queries
src/lib/audit.ts        audit trail + validation-error log
src/lib/settings.ts     expiry rules, workflow stages, email settings, permission matrix
src/lib/jobs.ts         scheduler: daily/weekly/monthly reports + expiry reminders (once per period)
src/lib/email.ts        nodemailer transport + email_notifications history / retry
src/lib/reports.ts      dashboard, period, monthly and analytics data
src/lib/export.ts       Excel / CSV / PDF generation
src/app/api/**          REST API (all routes authenticated, permission-checked, rate-limited)
```

### Key business rules
* **Validation** – enforced in the form, `POST/PATCH /api/records`, Excel import. Failures are stored in `validation_errors`, audited and notified. Case sensitivity is a setting.
* **Expiry** – calculated **only on the server** from `expiry_rules`. Each record stores issue date, validity days used, expiry date and calculation timestamp. Changing a rule never touches existing records; editing a document number/issue date recalculates that document with the rule in force at that time (audited).
* **Status** – Active / Expiring Soon / Critical / Expired derived from the per-document warning thresholds (Warning 1 = expiring soon, Warning 3 = critical).
* **History** – `stage_history` and `audit_logs` are append-only from the app. Records are archived, not deleted; permanent delete requires archive first, permission and a reason.
* **Email** – reminders are generated from stored expiry dates; one email per document per reminder band (dedupe key `record:doc:expiry:band`). Every email is stored; failed ones can be retried (Email History).
* **Timezone** – Africa/Kampala (UTC+3) for dates, schedules and display.

## Environment variables
Set these in `.env` (see `.env.example`).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Supabase direct or session-pooler URL) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (for optional client features) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key (optional) |
| `PGSSL_NO_VERIFY` | set to `1` if the managed DB uses an untrusted TLS certificate |
| `SESSION_SECRET` | JWT signing secret (auto-generated and stored if omitted; set it in production) |
| `SMTP_PASSWORD` (or `EMAIL_API_KEY`) | SMTP password / Resend / SendGrid API key – **never stored in DB or sent to the browser** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first administrator (seed) |
| `CRON_SECRET` | optional; enables `GET/POST /api/cron` (header `x-cron-secret`) as an external trigger |
| `APP_URL` | optional; adds links in e-mails |

Other e-mail settings (host, port, user, from, recipients, schedule) are edited in **Settings → Email**.
Providers: Custom SMTP, Resend (`smtp.resend.com`, user `resend`), SendGrid (`smtp.sendgrid.net`, user `apikey`), Amazon SES SMTP.

## Running
```bash
npm install
npx drizzle-kit push        # create/upgrade tables (drizzle.config.json)
npm run build && npm start  # creates the first admin, default rules and stages on first start (no sample data)
```
The scheduler starts with the server (`src/instrumentation.ts`) and checks every minute; it is catch-up safe
(state in `system_settings.job_state`). Run a single instance, or use `/api/cron` from one external scheduler.

## Deployment checklist
1. Provision PostgreSQL, set `DATABASE_URL`, `SESSION_SECRET`, `SMTP_PASSWORD`, `APP_URL`.
2. Serve behind HTTPS (reverse proxy sending `x-forwarded-proto: https` – the session cookie becomes `Secure`).
3. Run `npx drizzle-kit push` (or generate migrations with `drizzle-kit generate` for controlled releases).
4. Sign in as admin, configure Settings → Expiry Rules / Email / Workflow, then create users.

## Backups & data safety
* Nightly: `pg_dump -Fc "$DATABASE_URL" > /backups/cts_$(date +%F).dump`; copy off-server; keep 30 daily + 12 monthly; restore-test quarterly (`pg_restore -d newdb file.dump`).
* Enable WAL archiving / managed point-in-time recovery if your host offers it.
* Application safeguards: archive instead of delete, append-only history/audit, transactions for multi-table writes.

## API overview (all under `/api`, JSON, cookie session)
| Endpoint | Description |
| --- | --- |
| `POST /auth/login`, `POST /auth/logout` | session |
| `GET /config` | rules, active stages, permissions for the current user |
| `GET/POST /records`, `GET/PATCH/DELETE /records/:id` | list (filters: q, invoice, container, stage, processing, expiry, doc, withinDays, from, to, month, year, user, archived), create, detail, edit (needs `reason` for significant changes), permanent delete |
| `POST /records/:id/move`, `POST /records/:id/archive` | workflow movement, archive / restore |
| `GET /expiry` | expiry monitoring (`preset`=today\|next3\|next7\|next14\|next30\|expired\|custom, `doc`, `status`, `from`, `to`) |
| `GET /reports/period\|monthly\|analytics` | report data |
| `GET /export?type=records\|expiry\|errors\|audit\|emails&format=xlsx\|csv\|pdf&…filters` | exports respecting filters |
| `POST /import/parse`, `POST /import` | Excel parse, validate/preview/commit |
| `GET /errors`, `PATCH /errors/:id` | error log / resolve |
| `GET /audit`, `GET /emails`, `POST /emails/:id/retry` | audit + email history |
| `GET/POST /users`, `PATCH /users/:id` | user management |
| `GET/PUT /settings/:expiry\|stages\|email\|validation\|permissions`, `POST /settings/email/test` | administration |
| `POST /jobs/run` | run expiry check or a report now |
| `GET /notifications`, `POST /notifications` | in-app notifications / mark read |
