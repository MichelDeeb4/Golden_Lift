\set ON_ERROR_STOP on
-- Run ONLY against golden_lift_identity, as a migration owner.
\ir 00_common.sql
CREATE SCHEMA identity;
REVOKE ALL ON SCHEMA identity FROM PUBLIC;

-- Authenticated staff only; anonymous visitors have no account row.
CREATE TABLE identity.staff_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (length(btrim(email)) > 0),
  email_key text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  role text NOT NULL CHECK (role IN ('ADMIN','SUPER_ADMIN')),
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','DISABLED')),
  password_hash text,
  auth_version bigint NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (email_key),
  CHECK (status <> 'ACTIVE' OR password_hash IS NOT NULL)
);
CREATE INDEX staff_active_directory_idx ON identity.staff_accounts (role, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON identity.staff_accounts FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON identity.staff_accounts FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Server-side sessions using a digest of a high-entropy opaque token.
CREATE TABLE identity.staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES identity.staff_accounts(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  auth_version bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_account_active_idx ON identity.staff_sessions (staff_id, expires_at, id) WHERE deleted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON identity.staff_sessions (expires_at, id) WHERE deleted_at IS NULL AND revoked_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON identity.staff_sessions FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON identity.staff_sessions FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

-- Expiring, single-use invitation and password-reset tokens.
CREATE TABLE identity.staff_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES identity.staff_accounts(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('INVITATION','PASSWORD_RESET')),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (expires_at > created_at)
);
CREATE INDEX staff_tokens_open_idx ON identity.staff_tokens (staff_id, purpose, expires_at) WHERE deleted_at IS NULL AND consumed_at IS NULL AND revoked_at IS NULL;
CREATE TRIGGER a_update_guard BEFORE UPDATE ON identity.staff_tokens FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();
CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON identity.staff_tokens FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();

CREATE FUNCTION identity.account_auth_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    NEW.auth_version := OLD.auth_version + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_auth_version BEFORE UPDATE ON identity.staff_accounts
FOR EACH ROW EXECUTE FUNCTION identity.account_auth_change();

CREATE FUNCTION identity.revoke_account_credentials() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, identity, ops AS $$
BEGIN
  IF NEW.auth_version IS DISTINCT FROM OLD.auth_version THEN
    UPDATE identity.staff_sessions SET revoked_at = clock_timestamp()
      WHERE staff_id = NEW.id AND revoked_at IS NULL AND deleted_at IS NULL;
    UPDATE identity.staff_tokens SET revoked_at = clock_timestamp()
      WHERE staff_id = NEW.id AND revoked_at IS NULL AND consumed_at IS NULL AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_revoke_credentials AFTER UPDATE ON identity.staff_accounts
FOR EACH ROW EXECUTE FUNCTION identity.revoke_account_credentials();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity FROM PUBLIC;

