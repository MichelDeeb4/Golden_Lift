\set ON_ERROR_STOP on
BEGIN;
INSERT INTO identity.staff_accounts(id,email,display_name,role,status,password_hash)
VALUES('b1000000-0000-4000-8000-000000000001','Test.Admin@example.invalid','Test Admin','ADMIN','ACTIVE','synthetic-hash');
INSERT INTO identity.staff_sessions(staff_id,token_hash,auth_version,expires_at)
VALUES('b1000000-0000-4000-8000-000000000001',decode(repeat('11',32),'hex'),1,clock_timestamp()+interval '1 hour');
INSERT INTO identity.staff_tokens(staff_id,purpose,token_hash,expires_at)
VALUES('b1000000-0000-4000-8000-000000000001','PASSWORD_RESET',decode(repeat('22',32),'hex'),clock_timestamp()+interval '1 hour');
UPDATE identity.staff_accounts SET status='DISABLED' WHERE id='b1000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM identity.staff_accounts WHERE id='b1000000-0000-4000-8000-000000000001' AND auth_version=2 AND version=2) THEN RAISE EXCEPTION 'TEST FAILED: auth/version advancement'; END IF;
  IF EXISTS(SELECT 1 FROM identity.staff_sessions WHERE staff_id='b1000000-0000-4000-8000-000000000001' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'TEST FAILED: session not revoked'; END IF;
  IF EXISTS(SELECT 1 FROM identity.staff_tokens WHERE staff_id='b1000000-0000-4000-8000-000000000001' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'TEST FAILED: action token not revoked'; END IF;
  BEGIN
    INSERT INTO identity.staff_accounts(email,display_name,role) VALUES(' test.admin@EXAMPLE.INVALID ','duplicate','ADMIN');
    RAISE EXCEPTION 'TEST FAILED: duplicate staff email';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE identity.staff_accounts SET role='USER' WHERE id='b1000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: customer role stored';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    DELETE FROM identity.staff_accounts;
    RAISE EXCEPTION 'TEST FAILED: runtime DELETE';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
UPDATE identity.staff_accounts SET deleted_at=clock_timestamp() WHERE id='b1000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  BEGIN
    UPDATE identity.staff_accounts SET deleted_at=NULL WHERE id='b1000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: staff restore';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO identity.staff_accounts(email,display_name,role) VALUES('test.admin@example.invalid','reuse','ADMIN');
    RAISE EXCEPTION 'TEST FAILED: deleted email reused';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END; $$;
ROLLBACK;
\echo 'Identity runtime checks passed.'
