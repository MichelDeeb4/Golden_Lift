\set ON_ERROR_STOP on
-- Run ONLY against golden_lift_inquiries, as a migration owner.
\ir 00_common.sql
CREATE SCHEMA inquiries;
REVOKE ALL ON SCHEMA inquiries FROM PUBLIC;

-- Anonymous contact and quotation requests; no customer account.
CREATE TABLE inquiries.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('CONTACT','QUOTE')),
  locale text NOT NULL CHECK (locale IN ('ar','en','ckb')),
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  email text CHECK (email IS NULL OR length(btrim(email)) > 0),
  phone text CHECK (phone IS NULL OR length(btrim(phone)) > 0),
  message text NOT NULL CHECK (length(btrim(message)) > 0),
  product_id uuid,
  product_name_snapshot text,
  product_model_code_snapshot text,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PROGRESS','CLOSED')),
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK ((product_id IS NULL AND product_name_snapshot IS NULL AND product_model_code_snapshot IS NULL) OR (product_id IS NOT NULL AND product_name_snapshot IS NOT NULL AND length(btrim(product_name_snapshot)) > 0))
);
CREATE INDEX inquiries_inbox_live_idx ON inquiries.inquiries (status, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX inquiries_recent_live_idx ON inquiries.inquiries (created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX inquiries_product_live_idx ON inquiries.inquiries (product_id, created_at DESC, id) WHERE deleted_at IS NULL AND product_id IS NOT NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON inquiries.inquiries FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON inquiries.inquiries FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Durable email notification state, separate from storing the inquiry.
CREATE TABLE inquiries.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES inquiries.inquiries(id) ON DELETE RESTRICT,
  notification_kind text NOT NULL DEFAULT 'NEW_INQUIRY' CHECK (notification_kind = 'NEW_INQUIRY'),
  recipient_email text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_until timestamptz,
  lease_token uuid,
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (inquiry_id, notification_kind),
  CHECK (status NOT IN ('SENDING','SENT') OR recipient_email IS NOT NULL)
);
CREATE INDEX notifications_pending_idx ON inquiries.notification_deliveries (next_attempt_at, id) WHERE deleted_at IS NULL AND status = 'PENDING';
CREATE INDEX notifications_stale_lease_idx ON inquiries.notification_deliveries (locked_until, id) WHERE deleted_at IS NULL AND status = 'SENDING';
CREATE TRIGGER a_update_guard BEFORE UPDATE ON inquiries.notification_deliveries FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON inquiries.notification_deliveries FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- A local, versioned projection of Catalog sales notification configuration.
CREATE TABLE inquiries.notification_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  sales_email text,
  source_version bigint NOT NULL CHECK (source_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TRIGGER a_update_guard BEFORE UPDATE ON inquiries.notification_settings FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON inquiries.notification_settings FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

\ir 12_inquiry_integrity.sql
