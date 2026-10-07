\set ON_ERROR_STOP on
-- Additive expansion. The old classification remains authoritative until reviewed cutover.
-- Apply with Catalog owner credentials; never with the service runtime role.
ALTER TABLE catalog.categories ADD COLUMN schema_revision bigint NOT NULL DEFAULT 1
  CHECK (schema_revision > 0);

CREATE TABLE catalog.category_attribute_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES catalog.categories(id) ON DELETE RESTRICT,
  group_id uuid NOT NULL REFERENCES catalog.specification_groups(id) ON DELETE RESTRICT,
  sort_order bigint NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX category_group_live_uq ON catalog.category_attribute_groups(category_id,group_id) WHERE deleted_at IS NULL;
CREATE INDEX category_group_order_live_idx ON catalog.category_attribute_groups(category_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX category_group_reverse_live_idx ON catalog.category_attribute_groups(group_id,category_id) WHERE deleted_at IS NULL;

CREATE TABLE catalog.attribute_group_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES catalog.specification_groups(id) ON DELETE RESTRICT,
  definition_id uuid NOT NULL REFERENCES catalog.specification_definitions(id) ON DELETE RESTRICT,
  sort_order bigint NOT NULL DEFAULT 1024,
  is_required boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT true,
  is_searchable boolean NOT NULL DEFAULT false,
  is_filterable boolean NOT NULL DEFAULT false,
  is_comparable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (is_public OR NOT (is_searchable OR is_filterable OR is_comparable))
);
CREATE UNIQUE INDEX group_attribute_live_uq ON catalog.attribute_group_attributes(group_id,definition_id) WHERE deleted_at IS NULL;
CREATE INDEX group_attribute_order_live_idx ON catalog.attribute_group_attributes(group_id,sort_order,id) WHERE deleted_at IS NULL;
CREATE INDEX group_attribute_reverse_live_idx ON catalog.attribute_group_attributes(definition_id,group_id) WHERE deleted_at IS NULL;

-- Relational equivalent of the application resolver: one eligible row per category/definition.
-- Requiredness is OR; disclosure capabilities are AND. First group/member owns presentation.
CREATE VIEW catalog.category_effective_attributes AS
WITH candidates AS (
  SELECT c.category_id,a.definition_id,a.id,a.group_id,c.id AS category_group_id,
    a.sort_order,a.version,
    bool_or(a.is_required) OVER scope AS is_required,
    bool_and(a.is_public AND d.is_public) OVER scope AS is_public,
    bool_and(a.is_searchable AND a.is_public AND d.is_public) OVER scope AS is_searchable,
    bool_and(a.is_filterable AND a.is_public AND d.is_public AND d.is_filterable) OVER scope AS is_filterable,
    bool_and(a.is_comparable AND a.is_public AND d.is_public) OVER scope AS is_comparable,
    row_number() OVER (PARTITION BY c.category_id,a.definition_id ORDER BY c.sort_order,c.id,a.sort_order,a.id) AS position
  FROM catalog.category_attribute_groups c
  JOIN catalog.specification_groups g ON g.id=c.group_id AND g.deleted_at IS NULL
  JOIN catalog.attribute_group_attributes a ON a.group_id=g.id AND a.deleted_at IS NULL
  JOIN catalog.specification_definitions d ON d.id=a.definition_id AND d.deleted_at IS NULL
  WHERE c.deleted_at IS NULL
  WINDOW scope AS (PARTITION BY c.category_id,a.definition_id)
)
SELECT category_id,definition_id,id,group_id,category_group_id,sort_order,version,
  is_required,is_public,is_searchable,is_filterable,is_comparable
FROM candidates WHERE position=1;

CREATE FUNCTION catalog.assert_valid_category_relationships() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM catalog.category_attribute_groups a
    JOIN catalog.categories c ON c.id=a.category_id
    JOIN catalog.specification_groups g ON g.id=a.group_id
    WHERE a.deleted_at IS NULL AND (c.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM catalog.categories child WHERE child.parent_id=c.id AND child.deleted_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'Specification groups require a live leaf category and live group' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM catalog.attribute_group_attributes a
    JOIN catalog.specification_groups g ON g.id=a.group_id
    JOIN catalog.specification_definitions d ON d.id=a.definition_id
    WHERE a.deleted_at IS NULL AND (g.deleted_at IS NOT NULL OR d.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Group attributes require live groups and definitions' USING ERRCODE='23514';
  END IF;
END;
$$;
CREATE FUNCTION catalog.validate_category_relationships() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  PERFORM catalog.assert_valid_category_relationships();
  RETURN NULL;
END;
$$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['category_attribute_groups','attribute_group_attributes'] LOOP
    EXECUTE format('CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION ops.guard_row_update()',name);
    EXECUTE format('CREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.%I FOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete()',name);
    EXECUTE format('CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.%I FOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement()',name);
    EXECUTE format('CREATE CONSTRAINT TRIGGER category_relationship_integrity AFTER INSERT OR UPDATE ON catalog.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_category_relationships()',name);
  END LOOP;
  FOREACH name IN ARRAY ARRAY['categories','specification_groups','specification_definitions'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER category_relationship_integrity AFTER INSERT OR UPDATE ON catalog.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_category_relationships()',name);
  END LOOP;
END; $$;
CREATE TRIGGER category_group_identity_immutable BEFORE UPDATE ON catalog.category_attribute_groups
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('category_id','group_id');
CREATE TRIGGER group_attribute_identity_immutable BEFORE UPDATE ON catalog.attribute_group_attributes
FOR EACH ROW EXECUTE FUNCTION ops.immutable_fields('group_id','definition_id');

CREATE FUNCTION catalog.soft_delete_category_relationships() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,catalog,ops AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF TG_TABLE_NAME='categories' THEN
      UPDATE catalog.category_attribute_groups SET deleted_at=NEW.deleted_at WHERE category_id=NEW.id AND deleted_at IS NULL;
    ELSIF TG_TABLE_NAME='specification_groups' THEN
      UPDATE catalog.category_attribute_groups SET deleted_at=NEW.deleted_at WHERE group_id=NEW.id AND deleted_at IS NULL;
      UPDATE catalog.attribute_group_attributes SET deleted_at=NEW.deleted_at WHERE group_id=NEW.id AND deleted_at IS NULL;
    ELSE
      UPDATE catalog.attribute_group_attributes SET deleted_at=NEW.deleted_at WHERE definition_id=NEW.id AND deleted_at IS NULL;
    END IF;
  END IF;
  RETURN NULL;
END; $$;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['categories','specification_groups','specification_definitions'] LOOP
    EXECUTE format('CREATE TRIGGER category_relationship_retention AFTER UPDATE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.soft_delete_category_relationships()',name);
  END LOOP;
END; $$;
SELECT catalog.assert_valid_category_relationships();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog FROM PUBLIC;
