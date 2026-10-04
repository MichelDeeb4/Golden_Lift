import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError, uuid, version, revisionPrecondition } from '@golden-lift/contracts';
import {
  maximumReorderSize,
  orderedMembership,
  orderBetween,
  requireRevision,
} from '../src/domain/category-order.js';
import { MoveCategory } from '../src/application/use-cases/move-category.js';
import { ReorderCategories } from '../src/application/use-cases/reorder-categories.js';
import {
  DeleteCategoryBranch,
  PreviewCategoryDeletion,
} from '../src/application/use-cases/delete-category-branch.js';
import { ReadCategoryNavigation } from '../src/application/use-cases/read-category-navigation.js';
import type { CatalogUnitOfWork } from '../src/application/ports/catalog.js';
const id = uuid('ab000000-0000-4000-8000-000000000001'),
  other = uuid('ab000000-0000-4000-8000-000000000002'),
  token = 'l1-' + 'a'.repeat(64);
test('ordering uses exact bigint gaps, supports roots, and detects ties and boundaries', () => {
  assert.equal(orderBetween(null, null), '1024');
  assert.equal(orderBetween('9007199254740993', '9007199254740997'), '9007199254740995');
  assert.equal(orderBetween('5', '5'), null);
  assert.equal(orderBetween('5', '6'), null);
  assert.equal(orderBetween('9223372036854775807', null), null);
  assert.equal(orderBetween(null, '-9223372036854775808'), null);
  assert.equal(orderBetween(null, '1024'), '0');
});
test('complete reorder rejects duplicates, missing entries, wrong-parent membership and oversized requests', () => {
  orderedMembership([other, id], [id, other]);
  orderedMembership([], []);
  assert.throws(() => orderedMembership([id, id], [id, other]), { code: 'VALIDATION_FAILED' });
  assert.throws(() => orderedMembership([id], [id, other]), { code: 'INVALID_STATE' });
  assert.throws(() => orderedMembership([id], [other]), { code: 'INVALID_STATE' });
  assert.throws(
    () =>
      orderedMembership(
        Array.from({ length: maximumReorderSize + 1 }, () => id),
        [],
      ),
    { code: 'VALIDATION_FAILED' },
  );
});
test('scope preconditions validate shape and stale state is a user conflict', () => {
  assert.equal(revisionPrecondition(token), token);
  for (const value of [undefined, '1', 'l1-' + 'a'.repeat(63), 'b1-' + 'G'.repeat(64)])
    assert.throws(() => revisionPrecondition(value), { code: 'VALIDATION_FAILED' });
  assert.throws(() => requireRevision(token, 'l1-' + 'b'.repeat(64)), { code: 'VERSION_CONFLICT' });
});
test('all B4 use cases reject Super Admin before opening a transaction', async () => {
  const transactions: CatalogUnitOfWork = {
      execute: async () => {
        throw new Error('Must not open a transaction.');
      },
    },
    ids = { newUuid: () => id },
    clock = { now: () => '2026-10-04T00:00:00.000Z' },
    actor = { id, role: 'SUPER_ADMIN' as const, authVersion: version('1') };
  for (const run of [
    () => new ReadCategoryNavigation(transactions).detail(id, 'ar', actor),
    () =>
      new ReadCategoryNavigation(transactions).list(
        {
          parentId: null,
          locale: 'ar',
          limit: 20,
          after: null,
          expectedRevision: null,
          movingId: null,
        },
        actor,
      ),
    () => new ReadCategoryNavigation(transactions).breadcrumbs(id, 'ar', '-1', 20, null, actor),
    () =>
      new MoveCategory(transactions, ids, clock).execute(
        id,
        {
          parentId: null,
          beforeId: null,
          expectedVersion: version('1'),
          expectedSourceRevision: token,
          expectedDestinationRevision: token,
        },
        actor,
      ),
    () =>
      new ReorderCategories(transactions, ids, clock).execute(
        { parentId: null, orderedIds: [id], expectedListRevision: token },
        actor,
      ),
    () => new PreviewCategoryDeletion(transactions).execute(id, actor),
    () =>
      new DeleteCategoryBranch(transactions, ids, clock).execute(
        id,
        { confirm: true, expectedVersion: version('1'), previewPrecondition: token },
        actor,
      ),
  ])
    await assert.rejects(
      async () => run(),
      (error) => error instanceof ApplicationError && error.code === 'FORBIDDEN',
    );
});
