import type {
  AttributeDefinitionDto,
  AttributeGroupDto,
  AttributeKind,
  AttributeOptionDto,
  CatalogTranslation,
  EffectiveCategorySchema,
  UnitDto,
  Uuid,
  Version,
} from '@business-platform/contracts';
export interface NamedDraft {
  readonly code: string;
  readonly translations: readonly CatalogTranslation[];
}
export interface DefinitionDraft extends NamedDraft {
  readonly kind: AttributeKind;
  readonly unitCode: string | null;
  readonly minimum: string | null;
  readonly maximum: string | null;
  readonly allowMultiple: boolean;
  readonly public: boolean;
  readonly filterable: boolean;
  readonly textMultiline: boolean;
  readonly textMaxLength: number;
}
export interface UnitDraft extends NamedDraft {
  readonly symbol: string;
  readonly dimension: string;
}
export interface OptionDraft extends NamedDraft {
  readonly sortOrder: string;
}
export interface AttributeDefinitionRepository {
  find(id: Uuid): Promise<AttributeDefinitionDto | null>;
  list(after: Uuid | null, limit: number): Promise<readonly AttributeDefinitionDto[]>;
  create(id: Uuid, input: DefinitionDraft): Promise<void>;
  update(id: Uuid, input: DefinitionDraft): Promise<void>;
  deprecate(id: Uuid): Promise<void>;
  softDelete(id: Uuid): Promise<void>;
  option(id: Uuid): Promise<AttributeOptionDto | null>;
  createOption(definitionId: Uuid, id: Uuid, input: OptionDraft): Promise<void>;
  updateOption(id: Uuid, input: OptionDraft): Promise<void>;
  deprecateOption(id: Uuid): Promise<void>;
  softDeleteOption(id: Uuid): Promise<void>;
}
export interface AttributeGroupRepository {
  find(id: Uuid): Promise<AttributeGroupDto | null>;
  list(after: Uuid | null, limit: number): Promise<readonly AttributeGroupDto[]>;
  create(id: Uuid, input: NamedDraft): Promise<void>;
  update(id: Uuid, input: readonly CatalogTranslation[]): Promise<void>;
  softDelete(id: Uuid): Promise<void>;
}
export interface UnitRepository {
  find(code: string): Promise<UnitDto | null>;
  list(after: string | null, limit: number): Promise<readonly UnitDto[]>;
  create(input: UnitDraft): Promise<void>;
  update(code: string, input: readonly CatalogTranslation[]): Promise<void>;
  softDelete(code: string): Promise<void>;
}
export type ConfigurationChange =
  | { readonly kind: 'definition.update'; readonly definition: DefinitionDraft }
  | { readonly kind: 'definition.deprecate' | 'definition.delete' }
  | { readonly kind: 'option.update'; readonly option: OptionDraft }
  | { readonly kind: 'option.deprecate' | 'option.delete' }
  | {
      readonly kind: 'group.metadata' | 'unit.metadata';
      readonly translations: readonly CatalogTranslation[];
    }
  | { readonly kind: 'group.delete' | 'unit.delete' };
export type ConfigurationTarget =
  | { readonly resource: 'definitions' | 'options' | 'groups'; readonly id: Uuid }
  | { readonly resource: 'units'; readonly id: string };
export interface ConfigurationPreconditions {
  readonly expectedVersion: Version;
  readonly expectedSchemaRevision: Version | null;
}
export interface SchemaChangeFacts {
  readonly target: AttributeDefinitionDto | AttributeOptionDto | AttributeGroupDto | UnitDto;
  readonly schemas: readonly EffectiveCategorySchema[];
  readonly products: readonly import('@business-platform/contracts').ProductDto[];
  readonly retainedSemanticUse: boolean;
  readonly activeReferenceCount: string;
  readonly downloadableDocumentCount: string;
  readonly technicalBounds: readonly string[];
  readonly state: string;
}
export interface SchemaChangeReader {
  facts(target: ConfigurationTarget): Promise<SchemaChangeFacts>;
  precondition(scope: unknown, state: string): string;
}
