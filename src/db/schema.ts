import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  position: text("position"),
  role: varchar("role", { length: 20 }).notNull().default("staff"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  // Per-user permission overrides chosen by an administrator. null = inherit the role's permissions.
  permissions: jsonb("permissions").$type<string[] | null>(),
  // Self-service password reset (set by the user or an administrator).
  securityQuestion: text("security_question"),
  securityAnswerHash: text("security_answer_hash"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const records = pgTable(
  "records",
  {
    id: serial("id").primaryKey(),
    invoiceNo: text("invoice_no").notNull(),
    containerNo: text("container_no").notNull(),
    companyName: text("company_name"),
    // Clearing & Forwarding agent (chosen from the admin-managed list). Name is snapshotted so history survives deletes.
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    agentName: text("agent_name"),
    im7No: text("im7_no"),
    va: text("va"),
    im4No: text("im4_no"),
    exitNo: text("exit_no"),
    // IM7: issue date, validity used at calculation time, stored expiry
    im7IssueDate: date("im7_issue_date", { mode: "string" }),
    im7ValidityDays: integer("im7_validity_days"),
    im7ExpiryDate: date("im7_expiry_date", { mode: "string" }),
    im7CalculatedAt: ts("im7_calculated_at"),
    im4IssueDate: date("im4_issue_date", { mode: "string" }),
    im4ValidityDays: integer("im4_validity_days"),
    im4ExpiryDate: date("im4_expiry_date", { mode: "string" }),
    im4CalculatedAt: ts("im4_calculated_at"),
    exitIssueDate: date("exit_issue_date", { mode: "string" }),
    exitValidityDays: integer("exit_validity_days"),
    exitExpiryDate: date("exit_expiry_date", { mode: "string" }),
    exitCalculatedAt: ts("exit_calculated_at"),
    recordDate: date("record_date", { mode: "string" }).notNull(),
    currentStage: varchar("current_stage", { length: 50 }).notNull().default("CREATED"),
    // Next step status: pending | in_progress | completed | not_applicable
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    remarks: text("remarks"),
    // ADMIN ONLY — never returned to other roles (see lib/records.ts omitTransport / toView)
    transporter: text("transporter"),
    transportCost: numeric("transport_cost", { precision: 14, scale: 2 }),
    extraCharges: numeric("extra_charges", { precision: 14, scale: 2 }),
    chargesReason: text("charges_reason"),
    archived: boolean("archived").notNull().default(false),
    archivedAt: ts("archived_at"),
    archivedBy: integer("archived_by"),
    archiveReason: text("archive_reason"),
    createdBy: integer("created_by"),
    // snapshot of the creator's account credentials at the moment the record was entered
    createdByName: text("created_by_name"),
    createdByPosition: text("created_by_position"),
    createdByEmail: text("created_by_email"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("records_record_date_idx").on(t.recordDate),
    index("records_container_idx").on(t.containerNo),
    index("records_invoice_idx").on(t.invoiceNo),
    index("records_stage_idx").on(t.currentStage),
    index("records_agent_idx").on(t.agentId),
  ],
);

export const stageHistory = pgTable(
  "stage_history",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    previousStage: varchar("previous_stage", { length: 50 }),
    newStage: varchar("new_stage", { length: 50 }).notNull(),
    movedBy: integer("moved_by"),
    movedByName: text("moved_by_name"),
    movedByPosition: text("moved_by_position"),
    movedAt: ts("moved_at").notNull().defaultNow(),
    remarks: text("remarks"),
  },
  (t) => [index("stage_history_record_idx").on(t.recordId)],
);

export const validationErrors = pgTable(
  "validation_errors",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id"),
    userId: integer("user_id"),
    userName: text("user_name"),
    invoiceNo: text("invoice_no"),
    containerNo: text("container_no"),
    fieldName: varchar("field_name", { length: 50 }).notNull(),
    enteredValue: text("entered_value"),
    expectedFormat: text("expected_format"),
    errorMessage: text("error_message").notNull(),
    source: varchar("source", { length: 20 }).notNull().default("form"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedBy: integer("resolved_by"),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("validation_errors_created_idx").on(t.createdAt)],
);

export const expiryRules = pgTable("expiry_rules", {
  id: serial("id").primaryKey(),
  documentType: varchar("document_type", { length: 10 }).notNull().unique(),
  validityDays: integer("validity_days").notNull(),
  warning1Days: integer("warning_1_days").notNull(),
  warning2Days: integer("warning_2_days").notNull(),
  warning3Days: integer("warning_3_days").notNull(),
  active: boolean("active").notNull().default(true),
  updatedBy: integer("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const workflowStages = pgTable("workflow_stages", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  active: boolean("active").notNull().default(true),
  isFinal: boolean("is_final").notNull().default(false),
});

export const emailNotifications = pgTable(
  "email_notifications",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id"),
    documentType: varchar("document_type", { length: 10 }),
    notificationType: varchar("notification_type", { length: 30 }).notNull(),
    label: text("label"),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload"),
    dedupeKey: text("dedupe_key"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    sentAt: ts("sent_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("email_dedupe_idx").on(t.dedupeKey), index("email_created_idx").on(t.createdAt)],
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 30 }).notNull(),
  message: text("message").notNull(),
  link: text("link"),
  dedupeKey: text("dedupe_key").unique(),
  readBy: integer("read_by").array().notNull().default(sql`'{}'::integer[]`),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    userName: text("user_name"),
    recordId: integer("record_id"),
    action: varchar("action", { length: 50 }).notNull(),
    fieldName: varchar("field_name", { length: 50 }),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    ipAddress: text("ip_address"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_record_idx").on(t.recordId)],
);

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  settingName: varchar("setting_name", { length: 100 }).notNull().unique(),
  settingValue: text("setting_value").notNull(),
  updatedBy: integer("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ADMIN ONLY — payments made to transporters. Linked to a container record, or a general/lump-sum payment (recordId null).
export const transportPayments = pgTable(
  "transport_payments",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id").references(() => records.id, { onDelete: "set null" }),
    transporter: text("transporter").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    method: varchar("method", { length: 30 }).notNull(),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: integer("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tp_record_idx").on(t.recordId), index("tp_transporter_idx").on(t.transporter), index("tp_date_idx").on(t.paymentDate)],
);

// Clearing & Forwarding agents — managed by administrators only.
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  licenseNo: text("license_no"),
  tin: text("tin"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active | blocked
  blockedReason: text("blocked_reason"),
  blockedAt: ts("blocked_at"),
  createdBy: integer("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// Uploaded document files (stored in Supabase Storage; this table is the index).
export const recordDocuments = pgTable(
  "record_documents",
  {
    id: serial("id").primaryKey(),
    recordId: integer("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    // IM7 | IM4 | EXIT — or null for a general attachment
    docType: varchar("doc_type", { length: 10 }),
    fileName: text("file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: varchar("mime_type", { length: 150 }),
    sizeBytes: integer("size_bytes"),
    uploadedBy: integer("uploaded_by"),
    uploadedByName: text("uploaded_by_name"),
    uploadedByPosition: text("uploaded_by_position"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("record_documents_record_idx").on(t.recordId, t.createdAt)],
);
