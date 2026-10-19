PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE "wallet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "wallet_owner_updated" ON "wallet"(user_id,updated_at);
CREATE TABLE "category" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "category_owner_updated" ON "category"(user_id,updated_at);
CREATE TABLE "entry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "wallet_id" TEXT NOT NULL,
  "category_id" TEXT,
  "kind" TEXT NOT NULL,
  "amount" INTEGER NOT NULL CHECK (typeof("amount") = 'integer'),
  "occurred_on" TEXT NOT NULL,
  "transfer_id" TEXT,
  "payment_id" TEXT,
  "skill_id" TEXT,
  "note" TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY(user_id,"wallet_id") REFERENCES "wallet"(user_id,id),
  FOREIGN KEY(user_id,"category_id") REFERENCES "category"(user_id,id),
  FOREIGN KEY(user_id,"skill_id") REFERENCES "skill"(user_id,id)
);
CREATE INDEX "entry_owner_updated" ON "entry"(user_id,updated_at);
CREATE TABLE "transfer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "from_wallet_id" TEXT NOT NULL,
  "to_wallet_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL CHECK (typeof("amount") = 'integer'),
  "occurred_on" TEXT NOT NULL,
  "out_id" TEXT NOT NULL,
  "in_id" TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY(user_id,"from_wallet_id") REFERENCES "wallet"(user_id,id),
  FOREIGN KEY(user_id,"to_wallet_id") REFERENCES "wallet"(user_id,id)
);
CREATE INDEX "transfer_owner_updated" ON "transfer"(user_id,updated_at);
CREATE TABLE "budget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "category_id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "limit" INTEGER NOT NULL CHECK (typeof("limit") = 'integer'),
  UNIQUE (user_id, id),
  UNIQUE (user_id, "category_id", "month"),
  FOREIGN KEY(user_id,"category_id") REFERENCES "category"(user_id,id)
);
CREATE INDEX "budget_owner_updated" ON "budget"(user_id,updated_at);
CREATE TABLE "budget_alert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "budget_id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "budget_id", "month", "level"),
  FOREIGN KEY(user_id,"budget_id") REFERENCES "budget"(user_id,id)
);
CREATE INDEX "budget_alert_owner_updated" ON "budget_alert"(user_id,updated_at);
CREATE TABLE "skill" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "name" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "weekly_minutes" INTEGER NOT NULL,
  "course_cost" INTEGER NOT NULL CHECK (typeof("course_cost") = 'integer'),
  UNIQUE (user_id, id)
);
CREATE INDEX "skill_owner_updated" ON "skill"(user_id,updated_at);
CREATE TABLE "milestone" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "skill_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "completed" INTEGER NOT NULL,
  "weight" INTEGER NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY(user_id,"skill_id") REFERENCES "skill"(user_id,id)
);
CREATE INDEX "milestone_owner_updated" ON "milestone"(user_id,updated_at);
CREATE TABLE "study_session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "skill_id" TEXT NOT NULL,
  "started_at" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY(user_id,"skill_id") REFERENCES "skill"(user_id,id)
);
CREATE INDEX "study_session_owner_updated" ON "study_session"(user_id,updated_at);
CREATE TABLE "loan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "name" TEXT NOT NULL,
  "lender_type" TEXT NOT NULL,
  "lender_name" TEXT NOT NULL,
  "principal" INTEGER NOT NULL CHECK (typeof("principal") = 'integer'),
  "interest" INTEGER NOT NULL CHECK (typeof("interest") = 'integer'),
  "remainder" INTEGER NOT NULL CHECK (typeof("remainder") = 'integer'),
  "annual_rate_bps" INTEGER NOT NULL,
  "accrued_on" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "schedule_json" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "loan_owner_updated" ON "loan"(user_id,updated_at);
CREATE TABLE "loan_payment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "loan_id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL CHECK (typeof("amount") = 'integer'),
  "principal" INTEGER NOT NULL CHECK (typeof("principal") = 'integer'),
  "interest" INTEGER NOT NULL CHECK (typeof("interest") = 'integer'),
  "paid_on" TEXT NOT NULL,
  "expense_id" TEXT NOT NULL,
  UNIQUE (user_id, id),
  FOREIGN KEY(user_id,"loan_id") REFERENCES "loan"(user_id,id),
  FOREIGN KEY(user_id,"wallet_id") REFERENCES "wallet"(user_id,id),
  FOREIGN KEY(user_id,"category_id") REFERENCES "category"(user_id,id)
);
CREATE INDEX "loan_payment_owner_updated" ON "loan_payment"(user_id,updated_at);
CREATE TABLE "note" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "content" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "note_owner_updated" ON "note"(user_id,updated_at);
CREATE TABLE "setting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "key" TEXT NOT NULL,
  "value_json" TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "key")
);
CREATE INDEX "setting_owner_updated" ON "setting"(user_id,updated_at);
CREATE TABLE "reminder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "kind" TEXT NOT NULL,
  "target_id" TEXT,
  "due_on" TEXT,
  "time_local" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "quiet_start" TEXT NOT NULL,
  "quiet_end" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "reminder_owner_updated" ON "reminder"(user_id,updated_at);
CREATE TABLE "device" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "token" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "device_owner_updated" ON "device"(user_id,updated_at);
CREATE TABLE "reminder_log" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "reminder_id" TEXT NOT NULL,
  "occurrence" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "next_attempt_at" TEXT NOT NULL,
  "lease_until" TEXT,
  "ticket_id" TEXT,
  "expires_at" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "message_json" TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "reminder_id", "occurrence", "device_id"),
  FOREIGN KEY(user_id,"reminder_id") REFERENCES "reminder"(user_id,id),
  FOREIGN KEY(user_id,"device_id") REFERENCES "device"(user_id,id)
);
CREATE INDEX "reminder_log_owner_updated" ON "reminder_log"(user_id,updated_at);
CREATE TABLE "snapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "day" TEXT NOT NULL,
  "assets" INTEGER NOT NULL CHECK (typeof("assets") = 'integer'),
  "liabilities" INTEGER NOT NULL CHECK (typeof("liabilities") = 'integer'),
  "net" INTEGER NOT NULL CHECK (typeof("net") = 'integer'),
  UNIQUE (user_id, id),
  UNIQUE (user_id, "day")
);
CREATE INDEX "snapshot_owner_updated" ON "snapshot"(user_id,updated_at);
CREATE TABLE "sync_state" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "sequence" INTEGER NOT NULL CHECK (typeof("sequence") = 'integer'),
  UNIQUE (user_id, id),
  UNIQUE (user_id)
);
CREATE INDEX "sync_state_owner_updated" ON "sync_state"(user_id,updated_at);
CREATE TABLE "sync_change" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "sequence" INTEGER NOT NULL CHECK (typeof("sequence") = 'integer'),
  "table_name" TEXT NOT NULL,
  "row_id" TEXT NOT NULL,
  "record_json" TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "sequence")
);
CREATE INDEX "sync_change_owner_updated" ON "sync_change"(user_id,updated_at);
CREATE TABLE "sync_receipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "fingerprint" TEXT NOT NULL,
  "result_json" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "sync_receipt_owner_updated" ON "sync_receipt"(user_id,updated_at);
CREATE TABLE "sync_conflict" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "table_name" TEXT NOT NULL,
  "row_id" TEXT NOT NULL,
  "server_json" TEXT NOT NULL,
  "client_json" TEXT NOT NULL,
  "resolved" INTEGER NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "sync_conflict_owner_updated" ON "sync_conflict"(user_id,updated_at);
CREATE TABLE local_outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL, deleted_at TEXT, command_json TEXT NOT NULL, local_revision INTEGER NOT NULL, queue_sequence INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'dirty', affected_json TEXT NOT NULL);
CREATE TABLE local_cursor (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL, deleted_at TEXT, cursor TEXT NOT NULL);
CREATE TABLE local_shadow (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL, deleted_at TEXT, table_name TEXT NOT NULL, row_id TEXT NOT NULL, record_json TEXT NOT NULL);
