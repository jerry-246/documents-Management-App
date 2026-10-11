-- Container & Document Tracking System — schema for Supabase Postgres
-- Run in Supabase Dashboard → SQL Editor, or push with `npx drizzle-kit push`.

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "position" text,
  "role" varchar(20) NOT NULL DEFAULT 'staff',
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agents" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "license_no" text,
  "tin" text,
  "contact_person" text,
  "phone" text,
  "email" text,
  "address" text,
  "notes" text,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "blocked_reason" text,
  "blocked_at" timestamp with time zone,
  "created_by" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "records" (
  "id" serial PRIMARY KEY,
  "invoice_no" text NOT NULL,
  "container_no" text NOT NULL,
  "company_name" text,
  "agent_id" integer REFERENCES "agents"("id") ON DELETE SET NULL,
  "agent_name" text,
  "im7_no" text,
  "va" text,
  "im4_no" text,
  "exit_no" text,
  "im7_issue_date" date,
  "im7_validity_days" integer,
  "im7_expiry_date" date,
  "im7_calculated_at" timestamp with time zone,
  "im4_issue_date" date,
  "im4_validity_days" integer,
  "im4_expiry_date" date,
  "im4_calculated_at" timestamp with time zone,
  "exit_issue_date" date,
  "exit_validity_days" integer,
  "exit_expiry_date" date,
  "exit_calculated_at" timestamp with time zone,
  "record_date" date NOT NULL,
  "current_stage" varchar(50) NOT NULL DEFAULT 'CREATED',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "remarks" text,
  "transporter" text,
  "transport_cost" numeric(14, 2),
  "extra_charges" numeric(14, 2),
  "charges_reason" text,
  "archived" boolean NOT NULL DEFAULT false,
  "archived_at" timestamp with time zone,
  "archived_by" integer,
  "archive_reason" text,
  "created_by" integer,
  "created_by_name" text,
  "created_by_position" text,
  "created_by_email" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "records_record_date_idx" ON "records" ("record_date");
CREATE INDEX IF NOT EXISTS "records_container_idx" ON "records" ("container_no");
CREATE INDEX IF NOT EXISTS "records_invoice_idx" ON "records" ("invoice_no");
CREATE INDEX IF NOT EXISTS "records_stage_idx" ON "records" ("current_stage");
CREATE INDEX IF NOT EXISTS "records_agent_idx" ON "records" ("agent_id");

CREATE TABLE IF NOT EXISTS "stage_history" (
  "id" serial PRIMARY KEY,
  "record_id" integer NOT NULL REFERENCES "records"("id") ON DELETE CASCADE,
  "previous_stage" varchar(50),
  "new_stage" varchar(50) NOT NULL,
  "moved_by" integer,
  "moved_by_name" text,
  "moved_by_position" text,
  "moved_at" timestamp with time zone NOT NULL DEFAULT now(),
  "remarks" text
);

CREATE INDEX IF NOT EXISTS "stage_history_record_idx" ON "stage_history" ("record_id");

CREATE TABLE IF NOT EXISTS "validation_errors" (
  "id" serial PRIMARY KEY,
  "record_id" integer,
  "user_id" integer,
  "user_name" text,
  "invoice_no" text,
  "container_no" text,
  "field_name" varchar(50) NOT NULL,
  "entered_value" text,
  "expected_format" text,
  "error_message" text NOT NULL,
  "source" varchar(20) NOT NULL DEFAULT 'form',
  "ip_address" text,
  "user_agent" text,
  "resolved" boolean NOT NULL DEFAULT false,
  "resolved_by" integer,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "validation_errors_created_idx" ON "validation_errors" ("created_at");

CREATE TABLE IF NOT EXISTS "expiry_rules" (
  "id" serial PRIMARY KEY,
  "document_type" varchar(10) NOT NULL UNIQUE,
  "validity_days" integer NOT NULL,
  "warning_1_days" integer NOT NULL,
  "warning_2_days" integer NOT NULL,
  "warning_3_days" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "updated_by" integer,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "workflow_stages" (
  "id" serial PRIMARY KEY,
  "key" varchar(50) NOT NULL UNIQUE,
  "label" text NOT NULL,
  "position" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "is_final" boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "email_notifications" (
  "id" serial PRIMARY KEY,
  "record_id" integer,
  "document_type" varchar(10),
  "notification_type" varchar(30) NOT NULL,
  "label" text,
  "recipient" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "payload" jsonb,
  "dedupe_key" text,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "error_message" text,
  "retry_count" integer NOT NULL DEFAULT 0,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "email_dedupe_idx" ON "email_notifications" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "email_created_idx" ON "email_notifications" ("created_at");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY,
  "kind" varchar(30) NOT NULL,
  "message" text NOT NULL,
  "link" text,
  "dedupe_key" text UNIQUE,
  "read_by" integer[] NOT NULL DEFAULT '{}'::integer[],
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY,
  "user_id" integer,
  "user_name" text,
  "record_id" integer,
  "action" varchar(50) NOT NULL,
  "field_name" varchar(50),
  "old_value" text,
  "new_value" text,
  "reason" text,
  "ip_address" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "audit_record_idx" ON "audit_logs" ("record_id");

CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" serial PRIMARY KEY,
  "setting_name" varchar(100) NOT NULL UNIQUE,
  "setting_value" text NOT NULL,
  "updated_by" integer,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "transport_payments" (
  "id" serial PRIMARY KEY,
  "record_id" integer REFERENCES "records"("id") ON DELETE SET NULL,
  "transporter" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "payment_date" date NOT NULL,
  "method" varchar(30) NOT NULL,
  "reference" text,
  "notes" text,
  "created_by" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tp_record_idx" ON "transport_payments" ("record_id");
CREATE INDEX IF NOT EXISTS "tp_transporter_idx" ON "transport_payments" ("transporter");
CREATE INDEX IF NOT EXISTS "tp_date_idx" ON "transport_payments" ("payment_date");

CREATE TABLE IF NOT EXISTS "record_documents" (
  "id" serial PRIMARY KEY,
  "record_id" integer NOT NULL REFERENCES "records"("id") ON DELETE CASCADE,
  "file_name" text NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" varchar(150),
  "size_bytes" integer,
  "uploaded_by" integer,
  "uploaded_by_name" text,
  "uploaded_by_position" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "record_documents_record_idx" ON "record_documents" ("record_id", "created_at");
