import type {
  AttributeDefinitionDto,
  AttributeGroupDto,
  UnitDto,
  AttributeKind,
} from '@golden-lift/contracts';
export interface ConfigurationCollectionQuery {
  readonly resource: 'definitions' | 'groups' | 'units';
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly kind?: AttributeKind;
  readonly public?: boolean;
  readonly deprecated?: boolean;
}
export interface ConfigurationCollectionReader {
  page(input: ConfigurationCollectionQuery): Promise<{
    readonly items: readonly (AttributeDefinitionDto | AttributeGroupDto | UnitDto)[];
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly nextCursor: null;
  }>;
}
