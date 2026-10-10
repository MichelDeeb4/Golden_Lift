import { ApplicationError } from '@business-platform/contracts';
import type {
  AttributeDefinitionDto,
  AttributeOptionDto,
  EffectiveCategorySchema,
} from '@business-platform/contracts';
import type { ConfigurationChange, SchemaChangeFacts } from '../ports/product-schema.js';
const invalid = (message: string): never => {
  throw new ApplicationError('INVALID_STATE', message);
};
export function evolvedSchemas(
  facts: SchemaChangeFacts,
  change: ConfigurationChange,
): readonly EffectiveCategorySchema[] {
  return facts.schemas.map((schema) => {
    let attributes = [...schema.attributes],
      groups = [...schema.groups];
    switch (change.kind) {
      case 'definition.update':
        attributes = attributes.map((a) =>
          a.definition.id === (facts.target as AttributeDefinitionDto).id
            ? {
                ...a,
                definition: {
                  ...a.definition,
                  kind: change.definition.kind,
                  minimum: change.definition.minimum,
                  maximum: change.definition.maximum,
                  allowMultiple: change.definition.allowMultiple,
                  public: change.definition.public,
                  filterable: change.definition.filterable,
                  textMultiline: change.definition.textMultiline,
                  textMaxLength: change.definition.textMaxLength,
                  translations: change.definition.translations,
                },
              }
            : a,
        );
        break;
      case 'definition.deprecate':
        attributes = attributes.map((a) =>
          a.definition.id === (facts.target as AttributeDefinitionDto).id
            ? { ...a, definition: { ...a.definition, deprecated: true } }
            : a,
        );
        break;
      case 'option.deprecate':
      case 'option.delete': {
        if (!('definitionId' in facts.target)) invalid('Expected option configuration.');
        const id = (facts.target as AttributeOptionDto).id;
        attributes = attributes.map((a) => ({
          ...a,
          definition: {
            ...a.definition,
            options:
              change.kind === 'option.delete'
                ? a.definition.options.filter((o) => o.id !== id)
                : a.definition.options.map((o) => (o.id === id ? { ...o, deprecated: true } : o)),
          },
        }));
        break;
      }
      default:
        break;
    }
    if (
      attributes.some(
        (a) =>
          a.required &&
          (a.definition.deprecated ||
            (a.definition.kind === 'CHOICE' && !a.definition.options.some((o) => !o.deprecated))),
      )
    )
      invalid('Required fields must remain available for new values.');
    return { ...schema, groups, attributes };
  });
}
