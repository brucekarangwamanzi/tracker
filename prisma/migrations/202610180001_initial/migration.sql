CREATE SCHEMA IF NOT EXISTS life;
SET search_path TO life;
CREATE TABLE "wallet" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
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
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "category_owner_updated" ON "category"(user_id,updated_at);
CREATE TABLE "entry" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "wallet_id" UUID NOT NULL,
  "category_id" UUID,
  "kind" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "occurred_on" TEXT NOT NULL,
  "transfer_id" UUID,
  "payment_id" UUID,
  "skill_id" UUID,
  "note" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "entry_owner_updated" ON "entry"(user_id,updated_at);
CREATE TABLE "transfer" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "from_wallet_id" UUID NOT NULL,
  "to_wallet_id" UUID NOT NULL,
  "amount" BIGINT NOT NULL,
  "occurred_on" TEXT NOT NULL,
  "out_id" UUID NOT NULL,
  "in_id" UUID NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "transfer_owner_updated" ON "transfer"(user_id,updated_at);
CREATE TABLE "budget" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "category_id" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "limit" BIGINT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "category_id", "month")
);
CREATE INDEX "budget_owner_updated" ON "budget"(user_id,updated_at);
CREATE TABLE "budget_alert" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "budget_id" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "budget_id", "month", "level")
);
CREATE INDEX "budget_alert_owner_updated" ON "budget_alert"(user_id,updated_at);
CREATE TABLE "skill" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "name" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "weekly_minutes" INTEGER NOT NULL,
  "course_cost" BIGINT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "skill_owner_updated" ON "skill"(user_id,updated_at);
CREATE TABLE "milestone" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "skill_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL,
  "weight" INTEGER NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "milestone_owner_updated" ON "milestone"(user_id,updated_at);
CREATE TABLE "study_session" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "skill_id" UUID NOT NULL,
  "started_at" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "study_session_owner_updated" ON "study_session"(user_id,updated_at);
CREATE TABLE "loan" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "name" TEXT NOT NULL,
  "lender_type" TEXT NOT NULL,
  "lender_name" TEXT NOT NULL,
  "principal" BIGINT NOT NULL,
  "interest" BIGINT NOT NULL,
  "remainder" BIGINT NOT NULL,
  "annual_rate_bps" INTEGER NOT NULL,
  "accrued_on" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "schedule_json" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "loan_owner_updated" ON "loan"(user_id,updated_at);
CREATE TABLE "loan_payment" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "loan_id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "amount" BIGINT NOT NULL,
  "principal" BIGINT NOT NULL,
  "interest" BIGINT NOT NULL,
  "paid_on" TEXT NOT NULL,
  "expense_id" UUID NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "loan_payment_owner_updated" ON "loan_payment"(user_id,updated_at);
CREATE TABLE "note" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "content" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "note_owner_updated" ON "note"(user_id,updated_at);
CREATE TABLE "setting" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
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
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "kind" TEXT NOT NULL,
  "target_id" UUID,
  "due_on" TEXT,
  "time_local" TEXT NOT NULL,
  "zone" TEXT NOT NULL,
  "quiet_start" TEXT NOT NULL,
  "quiet_end" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "reminder_owner_updated" ON "reminder"(user_id,updated_at);
CREATE TABLE "device" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "token" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "device_owner_updated" ON "device"(user_id,updated_at);
CREATE TABLE "reminder_log" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "reminder_id" UUID NOT NULL,
  "occurrence" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "next_attempt_at" TEXT NOT NULL,
  "lease_until" TEXT,
  "ticket_id" TEXT,
  "expires_at" TEXT NOT NULL,
  "device_id" UUID NOT NULL,
  "message_json" TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "reminder_id", "occurrence", "device_id")
);
CREATE INDEX "reminder_log_owner_updated" ON "reminder_log"(user_id,updated_at);
CREATE TABLE "snapshot" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "day" TEXT NOT NULL,
  "assets" BIGINT NOT NULL,
  "liabilities" BIGINT NOT NULL,
  "net" BIGINT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "day")
);
CREATE INDEX "snapshot_owner_updated" ON "snapshot"(user_id,updated_at);
CREATE TABLE "sync_state" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "sequence" BIGINT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id)
);
CREATE INDEX "sync_state_owner_updated" ON "sync_state"(user_id,updated_at);
CREATE TABLE "sync_change" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "sequence" BIGINT NOT NULL,
  "table_name" TEXT NOT NULL,
  "row_id" UUID NOT NULL,
  "record_json" TEXT NOT NULL,
  UNIQUE (user_id, id),
  UNIQUE (user_id, "sequence")
);
CREATE INDEX "sync_change_owner_updated" ON "sync_change"(user_id,updated_at);
CREATE TABLE "sync_receipt" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "fingerprint" TEXT NOT NULL,
  "result_json" TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "sync_receipt_owner_updated" ON "sync_receipt"(user_id,updated_at);
CREATE TABLE "sync_conflict" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "updated_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "deleted_at" TEXT,
  "table_name" TEXT NOT NULL,
  "row_id" UUID NOT NULL,
  "server_json" TEXT NOT NULL,
  "client_json" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX "sync_conflict_owner_updated" ON "sync_conflict"(user_id,updated_at);
ALTER TABLE "entry" ADD CONSTRAINT "entry_wallet_id_owner_fk" FOREIGN KEY (user_id,"wallet_id") REFERENCES "wallet"(user_id,id);
ALTER TABLE "entry" ADD CONSTRAINT "entry_category_id_owner_fk" FOREIGN KEY (user_id,"category_id") REFERENCES "category"(user_id,id);
ALTER TABLE "entry" ADD CONSTRAINT "entry_skill_id_owner_fk" FOREIGN KEY (user_id,"skill_id") REFERENCES "skill"(user_id,id);
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_from_wallet_id_owner_fk" FOREIGN KEY (user_id,"from_wallet_id") REFERENCES "wallet"(user_id,id);
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_to_wallet_id_owner_fk" FOREIGN KEY (user_id,"to_wallet_id") REFERENCES "wallet"(user_id,id);
ALTER TABLE "budget" ADD CONSTRAINT "budget_category_id_owner_fk" FOREIGN KEY (user_id,"category_id") REFERENCES "category"(user_id,id);
ALTER TABLE "budget_alert" ADD CONSTRAINT "budget_alert_budget_id_owner_fk" FOREIGN KEY (user_id,"budget_id") REFERENCES "budget"(user_id,id);
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_skill_id_owner_fk" FOREIGN KEY (user_id,"skill_id") REFERENCES "skill"(user_id,id);
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_skill_id_owner_fk" FOREIGN KEY (user_id,"skill_id") REFERENCES "skill"(user_id,id);
ALTER TABLE "loan_payment" ADD CONSTRAINT "loan_payment_loan_id_owner_fk" FOREIGN KEY (user_id,"loan_id") REFERENCES "loan"(user_id,id);
ALTER TABLE "loan_payment" ADD CONSTRAINT "loan_payment_wallet_id_owner_fk" FOREIGN KEY (user_id,"wallet_id") REFERENCES "wallet"(user_id,id);
ALTER TABLE "loan_payment" ADD CONSTRAINT "loan_payment_category_id_owner_fk" FOREIGN KEY (user_id,"category_id") REFERENCES "category"(user_id,id);
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_reminder_id_owner_fk" FOREIGN KEY (user_id,"reminder_id") REFERENCES "reminder"(user_id,id);
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_device_id_owner_fk" FOREIGN KEY (user_id,"device_id") REFERENCES "device"(user_id,id);
ALTER TABLE "entry" ADD CHECK ("amount" >= 0);
ALTER TABLE "transfer" ADD CHECK ("amount" >= 0);
ALTER TABLE "budget" ADD CHECK ("limit" >= 0);
ALTER TABLE "loan" ADD CHECK ("principal" >= 0);
ALTER TABLE "loan" ADD CHECK ("interest" >= 0);
ALTER TABLE "loan" ADD CHECK ("remainder" >= 0);
ALTER TABLE "loan_payment" ADD CHECK ("amount" >= 0);
ALTER TABLE "loan_payment" ADD CHECK ("principal" >= 0);
ALTER TABLE "loan_payment" ADD CHECK ("interest" >= 0);
ALTER TABLE "skill" ADD CHECK ("course_cost" >= 0);
ALTER TABLE entry ADD CHECK(amount > 0);
ALTER TABLE entry ADD CHECK(kind IN ('income','expense','transfer_in','transfer_out'));
ALTER TABLE wallet ADD CHECK(currency = 'RWF');
ALTER TABLE transfer ADD CHECK(from_wallet_id <> to_wallet_id);
ALTER TABLE "wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "wallet" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "category" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entry" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "entry" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "transfer" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "budget" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "budget_alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget_alert" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "budget_alert" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "skill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skill" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "skill" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "milestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestone" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "milestone" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "study_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "study_session" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "loan" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "loan_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan_payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "loan_payment" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "note" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "note" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "setting" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "setting" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "reminder" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "device" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "reminder_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "reminder_log" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "snapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "snapshot" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "snapshot" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "sync_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_state" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "sync_state" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "sync_change" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_change" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "sync_change" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "sync_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "sync_receipt" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
ALTER TABLE "sync_conflict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_conflict" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner ON "sync_conflict" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
