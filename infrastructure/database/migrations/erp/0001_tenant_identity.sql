CREATE TABLE storage_binding (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 mode text NOT NULL CHECK(mode IN ('pooled','dedicated')),
 expected_tenant uuid,
 CHECK((mode='pooled' AND expected_tenant IS NULL) OR (mode='dedicated' AND expected_tenant IS NOT NULL))
);
CREATE FUNCTION scoped_tenant() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog,public AS $$
 SELECT CASE WHEN b.mode='pooled' OR b.expected_tenant = NULLIF(current_setting('app.tenant_id',true),'')::uuid
 THEN NULLIF(current_setting('app.tenant_id',true),'')::uuid ELSE NULL END FROM public.storage_binding b WHERE singleton
$$;
CREATE TABLE tenant_installation (
 tenant_id uuid PRIMARY KEY, generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
 active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE company_identity (
 tenant_id uuid NOT NULL, id uuid NOT NULL, code text NOT NULL CHECK(length(code) BETWEEN 1 AND 64),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code),
 FOREIGN KEY(tenant_id) REFERENCES tenant_installation(tenant_id)
);
ALTER TABLE tenant_installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_installation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON tenant_installation TO erp_runtime
 USING(tenant_id=public.scoped_tenant()) WITH CHECK(tenant_id=public.scoped_tenant());
ALTER TABLE company_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_identity FORCE ROW LEVEL SECURITY;
CREATE POLICY company_scope ON company_identity TO erp_runtime
 USING(tenant_id=public.scoped_tenant()) WITH CHECK(tenant_id=public.scoped_tenant());
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON FUNCTION scoped_tenant() FROM PUBLIC;
GRANT SELECT ON storage_binding TO erp_runtime;
GRANT EXECUTE ON FUNCTION scoped_tenant() TO erp_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON company_identity TO erp_runtime;
GRANT SELECT ON tenant_installation TO erp_runtime;

-- Operational bootstrap/migration authority, never granted to request/job login.
CREATE POLICY tenant_migration ON tenant_installation TO erp_migrator USING(true) WITH CHECK(true);
CREATE POLICY company_migration ON company_identity TO erp_migrator USING(true) WITH CHECK(true);
