CREATE TABLE tenant_registry (
 id uuid PRIMARY KEY, lifecycle text NOT NULL CHECK(lifecycle IN ('PROVISIONING','READY','ACTIVE','SUSPENDED','FAILED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage_database (
 id text PRIMARY KEY CHECK(id ~ '^bp_[a-z0-9_]+$'), mode text NOT NULL CHECK(mode IN ('pooled','dedicated')),
 credential_ref text NOT NULL CHECK(length(credential_ref)>0), schema_version integer NOT NULL DEFAULT 0,
 state text NOT NULL CHECK(state IN ('ALLOCATING','MIGRATING','READY','FAILED')), last_error text,
 revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage_assignment (
 tenant_id uuid PRIMARY KEY REFERENCES tenant_registry(id), database_id text NOT NULL REFERENCES storage_database(id),
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provisioning_operation (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant_registry(id), idempotency_key text NOT NULL UNIQUE,
 database_id text NOT NULL, mode text NOT NULL CHECK(mode IN ('pooled','dedicated')),
 state text NOT NULL CHECK(state IN ('REQUESTED','ALLOCATING','MIGRATING','SEEDING','VERIFYING','READY','FAILED')),
 attempt integer NOT NULL DEFAULT 1 CHECK(attempt>0), last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE registry_change (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenant_registry(id),
 action text NOT NULL, revision bigint NOT NULL, operation_id uuid NOT NULL REFERENCES provisioning_operation(id),
 occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(operation_id,action,revision)
);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON tenant_registry,storage_database,storage_assignment,provisioning_operation TO control_runtime;
GRANT SELECT,INSERT ON registry_change TO control_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO control_runtime;
