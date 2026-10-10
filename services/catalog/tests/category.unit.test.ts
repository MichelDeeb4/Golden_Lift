import assert from 'node:assert/strict';
import test from 'node:test';
import { uuid, version } from '@business-platform/contracts';
import { categoryDraft, requireContentAdmin } from '../src/domain/category.js';
const ar = {
  locale: 'ar' as const,
  name: 'Synthetic Arabic fixture',
  description: null,
  slug: null,
};
test('category rules require Arabic, unique locales and the parent expected version', () => {
  assert.equal(
    categoryDraft({ parentId: null, expectedParentVersion: null, translations: [ar] })
      .translations[0]?.name,
    ar.name,
  );
  assert.throws(() =>
    categoryDraft({
      parentId: null,
      expectedParentVersion: null,
      translations: [{ ...ar, locale: 'en' }],
    }),
  );
  assert.throws(() =>
    categoryDraft({ parentId: null, expectedParentVersion: null, translations: [ar, ar] }),
  );
  assert.throws(() =>
    categoryDraft({
      parentId: uuid('ab000000-0000-4000-8000-000000000001'),
      expectedParentVersion: null,
      translations: [ar],
    }),
  );
});
test('Super Admin does not inherit content-management capability', () => {
  const actor = {
    id: uuid('ab000000-0000-4000-8000-000000000001'),
    role: 'SUPER_ADMIN' as const,
    authVersion: version('1'),
  };
  assert.throws(() => requireContentAdmin(actor));
  assert.doesNotThrow(() => requireContentAdmin({ ...actor, role: 'ADMIN' }));
});
