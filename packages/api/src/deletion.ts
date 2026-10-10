import { z } from 'zod';
const count = z.string().regex(/^(0|[1-9][0-9]*)$/);
const entity = z.enum(['PRODUCT', 'MEDIA', 'ATTRIBUTE', 'ATTRIBUTE_GROUP', 'UNIT', 'CATEGORY']);
export const deletionImpactSchema = z.object({
  allowed: z.boolean(),
  permanent: z.literal(true),
  entity: z.object({ id: z.string(), type: entity, displayName: z.string() }),
  blockingDependencies: z.array(
    z.object({
      type: z.string(),
      count,
      examples: z.array(z.object({ id: z.string(), displayName: z.string() })).optional(),
    }),
  ),
  cascadingDeletes: z.array(z.object({ type: z.string(), count })),
  detachedReferences: z.array(z.object({ type: z.string(), count })),
  unaffectedEntities: z.array(z.object({ type: z.string(), count: count.optional() })),
  warnings: z.array(z.string()),
  expectedVersion: z.string().regex(/^[1-9][0-9]{0,18}$/),
  impactRevision: z.string().regex(/^d1-[a-f0-9]{64}$/),
});
export const deletionOperationSchema = z.object({
  id: z.string().uuid(),
  entityType: entity,
  entityId: z.string(),
  status: z.enum(['MEDIA_CLEANUP', 'COMPLETED', 'RETRYABLE']),
  failureCode: z.string().nullable(),
  retryCount: z.number().int(),
  completedAt: z.string().nullable(),
});
export const deletionResultSchema = z.union([
  deletionOperationSchema,
  z.object({ status: z.literal('COMPLETED') }),
]);
