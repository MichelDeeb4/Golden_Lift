-- Read repository templates, not migrations. No raw evidence or private entry_basis is returned.

PREPARE product_technical_card(uuid,text) AS

SELECT l.sheet_id, coalesce(st.title,sa.title) AS sheet_title,
       l.relation_kind AS relation_kind, coalesce(st.applicability_note,sa.applicability_note) AS applicability_note,
       c.id AS configuration_id,coalesce(ct.label,ca.label) AS configuration_label,c.capacity_kg,c.passenger_count,
       k.id AS condition_id,k.condition_kind,k.speed_mps,coalesce(kt.label,ka.label) AS condition_label,
       g.id AS section_id,coalesce(gt.title,ga.title) AS section_title,
       m.id AS measurement_id,d.code,coalesce(dt.label,da.label) AS measurement_label,d.unit_code,
       m.qualifier,m.value_state,m.number_value,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'body',coalesce(nt.body,na.body)) ORDER BY n.sort_order,n.id)
         FROM catalog.public_technical_notes n
         JOIN catalog.technical_note_translations na ON na.note_id=n.id AND na.locale='ar' AND na.deleted_at IS NULL
         LEFT JOIN catalog.technical_note_translations nt ON nt.note_id=n.id AND nt.locale=$2 AND nt.deleted_at IS NULL
         WHERE n.sheet_id=m.sheet_id AND n.deleted_at IS NULL
           AND (n.measurement_id=m.id OR (n.measurement_id IS NULL
             AND (n.section_id IS NULL OR n.section_id=m.section_id)
             AND (n.configuration_id IS NULL OR n.configuration_id=m.configuration_id)
             AND (n.condition_id IS NULL OR n.condition_id=m.condition_id)))),'[]'::jsonb) AS notes
FROM catalog.live_product_technical_sheets l
JOIN catalog.technical_sheet_translations sa ON sa.sheet_id=l.sheet_id AND sa.locale='ar' AND sa.deleted_at IS NULL
LEFT JOIN catalog.technical_sheet_translations st ON st.sheet_id=l.sheet_id AND st.locale=$2 AND st.deleted_at IS NULL
JOIN catalog.technical_configurations c ON c.sheet_id=l.sheet_id AND c.deleted_at IS NULL
JOIN catalog.technical_configuration_translations ca ON ca.configuration_id=c.id AND ca.locale='ar' AND ca.deleted_at IS NULL
LEFT JOIN catalog.technical_configuration_translations ct ON ct.configuration_id=c.id AND ct.locale=$2 AND ct.deleted_at IS NULL
JOIN catalog.public_technical_measurements m ON m.configuration_id=c.id AND m.deleted_at IS NULL
JOIN catalog.technical_conditions k ON k.id=m.condition_id AND k.deleted_at IS NULL
JOIN catalog.technical_condition_translations ka ON ka.condition_id=k.id AND ka.locale='ar' AND ka.deleted_at IS NULL
LEFT JOIN catalog.technical_condition_translations kt ON kt.condition_id=k.id AND kt.locale=$2 AND kt.deleted_at IS NULL
JOIN catalog.technical_sections g ON g.id=m.section_id AND g.deleted_at IS NULL
JOIN catalog.technical_section_translations ga ON ga.section_id=g.id AND ga.locale='ar' AND ga.deleted_at IS NULL
LEFT JOIN catalog.technical_section_translations gt ON gt.section_id=g.id AND gt.locale=$2 AND gt.deleted_at IS NULL
JOIN catalog.specification_definitions d ON d.id=m.definition_id AND d.deleted_at IS NULL
JOIN catalog.specification_translations da ON da.definition_id=d.id AND da.locale='ar' AND da.deleted_at IS NULL
LEFT JOIN catalog.specification_translations dt ON dt.definition_id=d.id AND dt.locale=$2 AND dt.deleted_at IS NULL
WHERE l.product_id=$1 AND $2 IN ('ar','en','ckb') AND (l.relation_kind='REFERENCE' OR EXISTS (
    SELECT 1 FROM catalog.product_technical_configurations x
    WHERE x.product_sheet_id=l.id AND x.configuration_id=c.id AND x.deleted_at IS NULL))
ORDER BY l.sort_order,l.id,c.sort_order,c.id,k.sort_order,k.id,g.sort_order,g.id,m.sort_order,m.id;

PREPARE category_technical_card(uuid,text) AS

SELECT l.sheet_id, coalesce(st.title,sa.title) AS sheet_title,
       'REFERENCE'::text AS relation_kind, coalesce(st.applicability_note,sa.applicability_note) AS applicability_note,
       c.id AS configuration_id,coalesce(ct.label,ca.label) AS configuration_label,c.capacity_kg,c.passenger_count,
       k.id AS condition_id,k.condition_kind,k.speed_mps,coalesce(kt.label,ka.label) AS condition_label,
       g.id AS section_id,coalesce(gt.title,ga.title) AS section_title,
       m.id AS measurement_id,d.code,coalesce(dt.label,da.label) AS measurement_label,d.unit_code,
       m.qualifier,m.value_state,m.number_value,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'body',coalesce(nt.body,na.body)) ORDER BY n.sort_order,n.id)
         FROM catalog.public_technical_notes n
         JOIN catalog.technical_note_translations na ON na.note_id=n.id AND na.locale='ar' AND na.deleted_at IS NULL
         LEFT JOIN catalog.technical_note_translations nt ON nt.note_id=n.id AND nt.locale=$2 AND nt.deleted_at IS NULL
         WHERE n.sheet_id=m.sheet_id AND n.deleted_at IS NULL
           AND (n.measurement_id=m.id OR (n.measurement_id IS NULL
             AND (n.section_id IS NULL OR n.section_id=m.section_id)
             AND (n.configuration_id IS NULL OR n.configuration_id=m.configuration_id)
             AND (n.condition_id IS NULL OR n.condition_id=m.condition_id)))),'[]'::jsonb) AS notes
FROM catalog.live_category_technical_sheets l
JOIN catalog.technical_sheet_translations sa ON sa.sheet_id=l.sheet_id AND sa.locale='ar' AND sa.deleted_at IS NULL
LEFT JOIN catalog.technical_sheet_translations st ON st.sheet_id=l.sheet_id AND st.locale=$2 AND st.deleted_at IS NULL
JOIN catalog.technical_configurations c ON c.sheet_id=l.sheet_id AND c.deleted_at IS NULL
JOIN catalog.technical_configuration_translations ca ON ca.configuration_id=c.id AND ca.locale='ar' AND ca.deleted_at IS NULL
LEFT JOIN catalog.technical_configuration_translations ct ON ct.configuration_id=c.id AND ct.locale=$2 AND ct.deleted_at IS NULL
JOIN catalog.public_technical_measurements m ON m.configuration_id=c.id AND m.deleted_at IS NULL
JOIN catalog.technical_conditions k ON k.id=m.condition_id AND k.deleted_at IS NULL
JOIN catalog.technical_condition_translations ka ON ka.condition_id=k.id AND ka.locale='ar' AND ka.deleted_at IS NULL
LEFT JOIN catalog.technical_condition_translations kt ON kt.condition_id=k.id AND kt.locale=$2 AND kt.deleted_at IS NULL
JOIN catalog.technical_sections g ON g.id=m.section_id AND g.deleted_at IS NULL
JOIN catalog.technical_section_translations ga ON ga.section_id=g.id AND ga.locale='ar' AND ga.deleted_at IS NULL
LEFT JOIN catalog.technical_section_translations gt ON gt.section_id=g.id AND gt.locale=$2 AND gt.deleted_at IS NULL
JOIN catalog.specification_definitions d ON d.id=m.definition_id AND d.deleted_at IS NULL
JOIN catalog.specification_translations da ON da.definition_id=d.id AND da.locale='ar' AND da.deleted_at IS NULL
LEFT JOIN catalog.specification_translations dt ON dt.definition_id=d.id AND dt.locale=$2 AND dt.deleted_at IS NULL
WHERE l.category_id=$1 AND $2 IN ('ar','en','ckb') 
ORDER BY l.sort_order,l.id,c.sort_order,c.id,k.sort_order,k.id,g.sort_order,g.id,m.sort_order,m.id;

-- All criteria refer to one selected configuration and one explicit EXACT_SPEED condition.
-- Parameters: capacity kg, speed m/s, first definition/value, second definition/value.
PREPARE product_technical_filter(numeric,numeric,uuid,numeric,uuid,numeric) AS
SELECT DISTINCT l.product_id
FROM catalog.live_product_technical_sheets l
JOIN catalog.product_technical_configurations x ON x.product_sheet_id=l.id AND x.deleted_at IS NULL
JOIN catalog.technical_configurations c ON c.id=x.configuration_id AND c.deleted_at IS NULL
JOIN catalog.technical_conditions k ON k.sheet_id=c.sheet_id AND k.deleted_at IS NULL
JOIN catalog.live_products p ON p.id=l.product_id
WHERE l.relation_kind='PRODUCT_SPECIFICATION' AND c.capacity_kg=$1
  AND EXISTS(SELECT 1 FROM catalog.product_type_specifications a JOIN catalog.specification_definitions d ON d.id=a.definition_id WHERE a.product_type_id=p.product_type_id AND a.definition_id=$3 AND a.deleted_at IS NULL AND a.is_public AND a.is_filterable AND d.is_public AND d.is_filterable AND d.deleted_at IS NULL)
  AND EXISTS(SELECT 1 FROM catalog.product_type_specifications a JOIN catalog.specification_definitions d ON d.id=a.definition_id WHERE a.product_type_id=p.product_type_id AND a.definition_id=$5 AND a.deleted_at IS NULL AND a.is_public AND a.is_filterable AND d.is_public AND d.is_filterable AND d.deleted_at IS NULL)
  AND k.condition_kind='EXACT_SPEED' AND k.speed_mps=$2
  AND EXISTS(SELECT 1 FROM catalog.public_technical_measurements m WHERE m.configuration_id=c.id AND m.condition_id=k.id
    AND m.definition_id=$3 AND m.qualifier='EXACT' AND m.value_state='KNOWN' AND m.number_value=$4 AND m.deleted_at IS NULL)
  AND EXISTS(SELECT 1 FROM catalog.public_technical_measurements m WHERE m.configuration_id=c.id AND m.condition_id=k.id
    AND m.definition_id=$5 AND m.qualifier='EXACT' AND m.value_state='KNOWN' AND m.number_value=$6 AND m.deleted_at IS NULL);
