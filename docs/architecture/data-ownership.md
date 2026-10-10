# Data ownership

Date: 2026-10-10. Current tables have service ownership and global single-company behavior, not implemented tenant/company ownership. Proposed assignments below require a reviewed data manifest and complete contract/FK analysis before migration.

## Ownership rules

| Data family                                                            | Current authority          | Proposed scope and sharing                                                                                                                                                     |
| ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Users, login credentials, sessions, action tokens                      | Identity                   | Global user authority; no duplicated tenant login. Access associations/lifecycle are separately scoped                                                                         |
| Tenant registry, memberships, storage/domain assignments               | Absent                     | Focused Identity access/control-plane module proposed; explicit IDs and versions                                                                                               |
| Companies/branches/departments/warehouses                              | Absent                     | Organization authority; company belongs to tenant; branches/warehouses inherit company                                                                                         |
| Categories/products/translations/content/settings                      | Catalog                    | Company-owned initially. Sharing uses explicit approved projections/copies, never implicit global mutability                                                                   |
| Definitions/options/groups/units and translations                      | Catalog                    | Tenant-owned reusable master definitions proposed; explicit company applicability/overrides. Cross-company changes require complete impact review                              |
| Product typed values/media references                                  | Catalog                    | Company-owned, referencing same-company product/Media and allowed tenant definitions through composite relationships                                                           |
| Technical sheets/sources/observations, retired classification/bindings | Catalog                    | Preserve proven original tenant+company evidence. No inferred backfill or removal just because runtime callers retired                                                         |
| Assets/variants/uploads/jobs and bytes                                 | Media                      | Company-owned initially; scope metadata, keys, leases, grants and owner usage together. Sharing needs independently owned copies unless separately approved                    |
| Inquiry snapshots and notification records                             | Inquiries                  | Company-owned after proven legacy assignment. Customer/partner master ownership is a future Foundation decision                                                                |
| Inbox/outbox/deletion operations                                       | Owning service             | Tenant plus applicable company and aggregate authority; global Identity events remain explicitly global. Definition deletion can be tenant-wide, not mislabelled company-local |
| Write gate and integrity scans                                         | Catalog                    | Replace global gate with reviewed tenant gate while preserving cross-company shared-definition integrity. Do not merely filter a trigger or weaken deferred validation         |
| Immutable templates, permission vocabulary                             | Future platform/Foundation | Global read-only templates may be copied; no writable tenant data in shared platform adapters                                                                                  |
| Ledgers, taxes, invoices, stock and payments                           | Absent                     | Legal-company-owned in future modules; cross-company relationships explicitly authorized                                                                                       |

The existing [schema manifest](../../database/schema-manifest.json) is version 1.5 with 71 tables; [Prisma parity checker](../../scripts/verify-orm.mjs) confirms its models and installed SQL. Technical relationships, retired tables and physical-delete compatibility blockers remain. Permanent deletion follows the existing [policy](../../documentation/architecture/deletion-policy.md); tenancy backfill does not authorize removing retained evidence.

## Keys, references and ownership transitions

Use tenant-inclusive unique keys/FKs. Company records additionally enforce company equality, while tenant-owned definitions require an explicit same-tenant relationship and permitted company applicability. ID uniqueness alone is not proof of ownership. Global actor ID is valid only through a scoped membership check. Cross-service references remain external IDs with contract/event validation, not foreign keys across databases.

Backfill records and bytes only from a reviewed legacy tenant+legal-company manifest, including technical provenance, deleted records, inbox/outbox and orphan evidence. Unknown/mixed ownership blocks migration; report exact records without silently mapping or discarding them. Compare hashes/counts and registration/usage/byte equality before switch. Store credentials/backups in private ignored locations.

## Complete current model register

The following register is extracted from all four inspected Prisma schemas. Scope is proposed, not implemented. Ops records require aggregate-aware scope; retained models require provenance review. This register does not grant permission to delete any model.

| Service   | Prisma model                       | Physical relation                            | Proposed ownership                                       |
| --------- | ---------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| identity  | StaffAccounts                      | identity.staff_accounts                      | Global Identity; ops envelope scope explicit             |
| identity  | StaffSessions                      | identity.staff_sessions                      | Global Identity; ops envelope scope explicit             |
| identity  | StaffTokens                        | identity.staff_tokens                        | Global Identity; ops envelope scope explicit             |
| identity  | InboxMessages                      | ops.inbox_messages                           | Global Identity; ops envelope scope explicit             |
| identity  | OutboxEvents                       | ops.outbox_events                            | Global Identity; ops envelope scope explicit             |
| catalog   | Categories                         | catalog.categories                           | Tenant + company                                         |
| catalog   | CategorySpecifications             | catalog.category_specifications              | Tenant + company                                         |
| catalog   | CategoryTechnicalSheets            | catalog.category_technical_sheets            | Tenant + company                                         |
| catalog   | CategoryTranslations               | catalog.category_translations                | Tenant + company                                         |
| catalog   | FaqItems                           | catalog.faq_items                            | Tenant + company                                         |
| catalog   | FaqTranslations                    | catalog.faq_translations                     | Tenant + company                                         |
| catalog   | MediaAssetRefs                     | catalog.media_asset_refs                     | Tenant + company                                         |
| catalog   | PageTranslations                   | catalog.page_translations                    | Tenant + company                                         |
| catalog   | Pages                              | catalog.pages                                | Tenant + company                                         |
| catalog   | ProductCodeReservations            | catalog.product_code_reservations            | Tenant + company                                         |
| catalog   | ProductMedia                       | catalog.product_media                        | Tenant + company                                         |
| catalog   | ProductMediaTranslations           | catalog.product_media_translations           | Tenant + company                                         |
| catalog   | ProductSpecificationChoices        | catalog.product_specification_choices        | Tenant + company                                         |
| catalog   | ProductSpecificationTexts          | catalog.product_specification_texts          | Tenant + company                                         |
| catalog   | ProductSpecificationValues         | catalog.product_specification_values         | Tenant + company                                         |
| catalog   | ProductTechnicalConfigurations     | catalog.product_technical_configurations     | Tenant + company                                         |
| catalog   | ProductTechnicalSheets             | catalog.product_technical_sheets             | Tenant + company                                         |
| catalog   | ProductTranslations                | catalog.product_translations                 | Tenant + company                                         |
| catalog   | Products                           | catalog.products                             | Tenant + company                                         |
| catalog   | SiteSettingTranslations            | catalog.site_setting_translations            | Tenant + company                                         |
| catalog   | SiteSettings                       | catalog.site_settings                        | Tenant + company                                         |
| catalog   | SocialLinks                        | catalog.social_links                         | Tenant + company                                         |
| catalog   | SpecificationDefinitions           | catalog.specification_definitions            | Tenant definition; explicit company applicability        |
| catalog   | SpecificationOptionTranslations    | catalog.specification_option_translations    | Tenant definition; explicit company applicability        |
| catalog   | SpecificationOptions               | catalog.specification_options                | Tenant definition; explicit company applicability        |
| catalog   | SpecificationTranslations          | catalog.specification_translations           | Tenant definition; explicit company applicability        |
| catalog   | TechnicalConditionTranslations     | catalog.technical_condition_translations     | Tenant + company                                         |
| catalog   | TechnicalConditions                | catalog.technical_conditions                 | Tenant + company                                         |
| catalog   | TechnicalConfigurationTranslations | catalog.technical_configuration_translations | Tenant + company                                         |
| catalog   | TechnicalConfigurations            | catalog.technical_configurations             | Tenant + company                                         |
| catalog   | TechnicalMeasurements              | catalog.technical_measurements               | Tenant + company                                         |
| catalog   | TechnicalNoteTranslations          | catalog.technical_note_translations          | Tenant + company                                         |
| catalog   | TechnicalNotes                     | catalog.technical_notes                      | Tenant + company                                         |
| catalog   | TechnicalSectionTranslations       | catalog.technical_section_translations       | Tenant + company                                         |
| catalog   | TechnicalSections                  | catalog.technical_sections                   | Tenant + company                                         |
| catalog   | TechnicalSheetSources              | catalog.technical_sheet_sources              | Tenant + company                                         |
| catalog   | TechnicalSheetTranslations         | catalog.technical_sheet_translations         | Tenant + company                                         |
| catalog   | TechnicalSheets                    | catalog.technical_sheets                     | Tenant + company                                         |
| catalog   | TechnicalSourceObservations        | catalog.technical_source_observations        | Tenant + company                                         |
| catalog   | Units                              | catalog.units                                | Tenant definition; explicit company applicability        |
| catalog   | InboxMessages                      | ops.inbox_messages                           | Tenant + aggregate company when applicable               |
| catalog   | OutboxEvents                       | ops.outbox_events                            | Tenant + aggregate company when applicable               |
| catalog   | SpecificationGroupTranslations     | catalog.specification_group_translations     | Tenant definition; explicit company applicability        |
| catalog   | SpecificationGroups                | catalog.specification_groups                 | Tenant definition; explicit company applicability        |
| catalog   | UnitTranslations                   | catalog.unit_translations                    | Tenant definition; explicit company applicability        |
| catalog   | WriteGate                          | catalog.write_gate                           | Tenant integrity gate, preserve cross-company invariants |
| catalog   | DeletionOperations                 | ops.deletion_operations                      | Tenant + aggregate company when applicable               |
| catalog   | AttributeGroupAttributes           | catalog.attribute_group_attributes           | Tenant definition; explicit company applicability        |
| catalog   | CategoryAttributeGroups            | catalog.category_attribute_groups            | Tenant + company                                         |
| catalog   | ProductTypeGroups                  | catalog.product_type_groups                  | Retained company evidence; reviewed provenance required  |
| catalog   | ProductTypeSpecifications          | catalog.product_type_specifications          | Retained company evidence; reviewed provenance required  |
| catalog   | ProductTypeTranslations            | catalog.product_type_translations            | Retained company evidence; reviewed provenance required  |
| catalog   | ProductTypes                       | catalog.product_types                        | Retained company evidence; reviewed provenance required  |
| catalog   | RetiredProductBindings             | catalog.retired_product_bindings             | Retained company evidence; reviewed provenance required  |
| media     | AssetVariants                      | media.asset_variants                         | Tenant + company                                         |
| media     | Assets                             | media.assets                                 | Tenant + company                                         |
| media     | ProcessingJobs                     | media.processing_jobs                        | Tenant + company                                         |
| media     | UploadSessions                     | media.upload_sessions                        | Tenant + company                                         |
| media     | InboxMessages                      | ops.inbox_messages                           | Tenant + aggregate company when applicable               |
| media     | OutboxEvents                       | ops.outbox_events                            | Tenant + aggregate company when applicable               |
| media     | DeletionOperations                 | ops.deletion_operations                      | Tenant + aggregate company when applicable               |
| inquiries | Inquiries                          | inquiries.inquiries                          | Tenant + company                                         |
| inquiries | NotificationDeliveries             | inquiries.notification_deliveries            | Tenant + company                                         |
| inquiries | NotificationSettings               | inquiries.notification_settings              | Tenant + company                                         |
| inquiries | InboxMessages                      | ops.inbox_messages                           | Tenant + aggregate company when applicable               |
| inquiries | OutboxEvents                       | ops.outbox_events                            | Tenant + aggregate company when applicable               |
