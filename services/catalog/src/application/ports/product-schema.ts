import type {
  AttributeDefinitionDto,
  AttributeGroupDto,
  AttributeKind,
  AttributeOptionDto,
  CatalogTranslation,
  EffectiveTypeSchema,
  EffectiveCategorySchema,
  ProductTypeDto,
  UnitDto,
  Uuid,
  Version,
} from '@golden-lift/contracts';
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
export interface AssignmentDraft {
  readonly definitionId: Uuid;
  readonly groupPlacementId: Uuid | null;
  readonly sortOrder: string;
  readonly required: boolean;
  readonly public: boolean;
  readonly searchable: boolean;
  readonly filterable: boolean;
  readonly comparable: boolean;
}
export interface ProductTypeRepository {
  find(id: Uuid): Promise<ProductTypeDto | null>;
  list(after: Uuid | null, limit: number): Promise<readonly ProductTypeDto[]>;
  create(id: Uuid, input: NamedDraft): Promise<void>;
  schema(id: Uuid): Promise<EffectiveTypeSchema>;
  putMetadata(id: Uuid, input: readonly CatalogTranslation[]): Promise<void>;
  deprecate(id: Uuid): Promise<void>;
  softDelete(id: Uuid): Promise<void>;
  putAssignment(typeId: Uuid, id: Uuid, input: AssignmentDraft): Promise<void>;
  removeAssignment(id: Uuid): Promise<void>;
  putGroup(typeId: Uuid, id: Uuid, groupId: Uuid, sortOrder: string): Promise<void>;
  removeGroup(id: Uuid, moveTo: Uuid | null): Promise<void>;
  order(typeId: Uuid, kind: 'groups' | 'attributes', orderedIds: readonly Uuid[]): Promise<void>;
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
  | { readonly kind: 'type.metadata'; readonly translations: readonly CatalogTranslation[] }
  | { readonly kind: 'type.deprecate' | 'type.delete' }
  | {
      readonly kind: 'assignment.put';
      readonly assignmentId: Uuid | null;
      readonly assignment: AssignmentDraft;
    }
  | { readonly kind: 'assignment.remove'; readonly assignmentId: Uuid }
  | {
      readonly kind: 'group.place';
      readonly placementId: Uuid | null;
      readonly groupId: Uuid;
      readonly sortOrder: string;
    }
  | {
      readonly kind: 'group.remove';
      readonly placementId: Uuid;
      readonly moveAssignmentsTo: Uuid | null;
    }
  | {
      readonly kind: 'type.order';
      readonly collection: 'groups' | 'attributes';
      readonly orderedIds: readonly Uuid[];
    }
  | {
      readonly kind: 'type.copy';
      readonly sourceTypeId: Uuid;
      readonly expectedSourceSchemaRevision: Version;
    }
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
  | { readonly resource: 'types' | 'definitions' | 'options' | 'groups'; readonly id: Uuid }
  | { readonly resource: 'units'; readonly id: string };
export interface ConfigurationPreconditions {
  readonly expectedVersion: Version;
  readonly expectedSchemaRevision: Version | null;
}
export interface SchemaChangeFacts {
  readonly target:
    ProductTypeDto | AttributeDefinitionDto | AttributeOptionDto | AttributeGroupDto | UnitDto;
  readonly schemas: readonly (EffectiveTypeSchema | EffectiveCategorySchema)[];
  readonly products: readonly import('@golden-lift/contracts').ProductDto[];
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
