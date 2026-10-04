import { ApplicationError } from '@golden-lift/contracts';
import type {
  AttributeDefinitionDto,
  AttributeOptionDto,
  EffectiveTypeSchema,
  TypeAttributeDto,
} from '@golden-lift/contracts';
import type { ConfigurationChange, SchemaChangeFacts } from '../ports/product-schema.js';
const invalid = (message: string): never => {
  throw new ApplicationError('INVALID_STATE', message);
};
export function evolvedSchemas(
  facts: SchemaChangeFacts,
  change: ConfigurationChange,
): readonly EffectiveTypeSchema[] {
  return facts.schemas.map((schema) => {
    let attributes = [...schema.attributes],
      groups = [...schema.groups];
    switch (change.kind) {
      case 'assignment.put': {
        const draft = change.assignment,
          previous = attributes.find((a) => a.id === change.assignmentId);
        if (change.assignmentId && !previous) invalid('Assignment does not belong to this type.');
        if (previous && previous.definition.id !== draft.definitionId)
          invalid('Replace attribute membership explicitly; its definition identity is stable.');
        if (draft.groupPlacementId && !groups.some((g) => g.id === draft.groupPlacementId))
          invalid('Assignment group must belong to this type.');
        if (!draft.public && (draft.searchable || draft.filterable || draft.comparable))
          invalid('Search/filter/comparison flags require assignment visibility.');
        const definition = previous?.definition ?? (facts.target as AttributeDefinitionDto);
        if (!previous && attributes.some((a) => a.definition.id === draft.definitionId))
          invalid('Attribute is already assigned.');
        const assignment: TypeAttributeDto = {
          id: previous?.id ?? draft.definitionId,
          definition,
          groupPlacementId: draft.groupPlacementId,
          sortOrder: draft.sortOrder,
          version: previous?.version ?? schema.type.version,
          required: draft.required,
          public: draft.public,
          searchable: draft.searchable,
          filterable: draft.filterable,
          comparable: draft.comparable,
        };
        attributes = previous
          ? attributes.map((a) => (a.id === previous.id ? assignment : a))
          : [...attributes, assignment];
        if (attributes.length > 500)
          invalid('Type schema supports at most 500 active assignments.');
        break;
      }
      case 'assignment.remove':
        if (!attributes.some((a) => a.id === change.assignmentId))
          invalid('Assignment does not belong to this type.');
        else attributes = attributes.filter((a) => a.id !== change.assignmentId);
        break;
      case 'group.remove': {
        if (
          !groups.some((g) => g.id === change.placementId) ||
          change.moveAssignmentsTo === change.placementId ||
          (change.moveAssignmentsTo && !groups.some((g) => g.id === change.moveAssignmentsTo))
        )
          invalid('Group removal requires an explicit valid reassignment target.');
        groups = groups.filter((g) => g.id !== change.placementId);
        attributes = attributes.map((a) =>
          a.groupPlacementId === change.placementId
            ? { ...a, groupPlacementId: change.moveAssignmentsTo }
            : a,
        );
        break;
      }
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
