\set ON_ERROR_STOP on
BEGIN;
INSERT INTO inquiries.inquiries(id,kind,locale,full_name,email,message,idempotency_key,request_hash)
VALUES('b3000000-0000-4000-8000-000000000001','CONTACT','ckb','تاقیکردنەوە','test@example.invalid','Synthetic inquiry','b3000000-0000-4000-8000-000000000002',decode(repeat('44',32),'hex'));
INSERT INTO inquiries.notification_deliveries(inquiry_id) VALUES('b3000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    INSERT INTO inquiries.inquiries(kind,locale,full_name,email,message,idempotency_key,request_hash)
    VALUES('CONTACT','ar','test','test@example.invalid','test','b3000000-0000-4000-8000-000000000002',decode(repeat('44',32),'hex'));
    RAISE EXCEPTION 'TEST FAILED: duplicate submission';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO inquiries.inquiries(kind,locale,full_name,message,idempotency_key,request_hash)
    VALUES('CONTACT','ar','test','test',gen_random_uuid(),decode(repeat('44',32),'hex'));
    RAISE EXCEPTION 'TEST FAILED: no contact method';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO inquiries.inquiries(kind,locale,full_name,email,message,product_id,idempotency_key,request_hash)
    VALUES('QUOTE','en','test','test@example.invalid','test',gen_random_uuid(),gen_random_uuid(),decode(repeat('44',32),'hex'));
    RAISE EXCEPTION 'TEST FAILED: product snapshot missing';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE inquiries.notification_deliveries SET status='SENDING' WHERE inquiry_id='b3000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: sending without recipient';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;
UPDATE inquiries.inquiries SET deleted_at=clock_timestamp() WHERE id='b3000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM inquiries.notification_deliveries WHERE inquiry_id='b3000000-0000-4000-8000-000000000001' AND status<>'CANCELLED') THEN RAISE EXCEPTION 'TEST FAILED: notification not cancelled'; END IF;
  BEGIN
    UPDATE inquiries.inquiries SET deleted_at=NULL WHERE id='b3000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'TEST FAILED: inquiry restoration';
  EXCEPTION WHEN check_violation THEN NULL; END;
END; $$;
ROLLBACK;
\echo 'Inquiries runtime checks passed.'
