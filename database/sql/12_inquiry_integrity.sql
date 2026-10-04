-- Keep stored inquiries independent of external delivery; cancel work not yet sent.
CREATE FUNCTION inquiries.cancel_deleted_inquiry_notifications() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,inquiries,ops AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE inquiries.notification_deliveries SET status='CANCELLED',locked_until=NULL,lease_token=NULL
    WHERE inquiry_id=NEW.id AND deleted_at IS NULL AND status IN ('PENDING','FAILED');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cancel_notifications AFTER UPDATE ON inquiries.inquiries
FOR EACH ROW EXECUTE FUNCTION inquiries.cancel_deleted_inquiry_notifications();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA inquiries FROM PUBLIC;
