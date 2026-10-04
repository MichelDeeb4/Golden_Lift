-- Shared operational schema. Apply once to EACH separate service database.
-- Reference PostgreSQL DDL; execution against a PostgreSQL server is still required.
CREATE SCHEMA ops;
REVOKE ALL ON SCHEMA ops FROM PUBLIC;

CREATE FUNCTION ops.guard_row_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Soft-deleted rows cannot be edited or restored' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) -> 'id') IS DISTINCT FROM (to_jsonb(OLD) -> 'id') THEN
    RAISE EXCEPTION 'Identifiers are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at is immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE FUNCTION ops.reject_physical_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Physical DELETE/TRUNCATE is prohibited; use deleted_at' USING ERRCODE = '23514';
END;
$$;

CREATE FUNCTION ops.immutable_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE i integer;
BEGIN
  FOR i IN 0..TG_NARGS-1 LOOP
    IF (to_jsonb(NEW) -> TG_ARGV[i]) IS DISTINCT FROM (to_jsonb(OLD) -> TG_ARGV[i]) THEN
      RAISE EXCEPTION 'Field % is immutable on %', TG_ARGV[i], TG_TABLE_NAME USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TABLE ops.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  aggregate_version bigint,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_until timestamptz,
  lease_token uuid,
  last_error text,
  deleted_at timestamptz
);
CREATE INDEX outbox_pending_idx ON ops.outbox_events (available_at, created_at, id)
WHERE deleted_at IS NULL AND published_at IS NULL;
CREATE TRIGGER outbox_no_delete BEFORE DELETE OR TRUNCATE ON ops.outbox_events
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

CREATE TABLE ops.inbox_messages (
  consumer_name text NOT NULL,
  message_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consumer_name, message_id)
);
CREATE TRIGGER inbox_no_delete BEFORE DELETE OR TRUNCATE ON ops.inbox_messages
FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();
-- Insert inbox row and local business effect in ONE transaction. Keep dedup keys.
-- Operational expiration/completion is a state transition, not physical deletion.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ops FROM PUBLIC;
