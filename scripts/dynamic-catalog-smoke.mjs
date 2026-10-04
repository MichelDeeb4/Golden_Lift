import assert from 'node:assert/strict';
export async function exerciseDynamicCatalog({
  request,
  adminSession,
  superSession,
  registerImage,
  retainedResources,
}) {
  const names = [
    { locale: 'ar', name: 'Synthetic dynamic process content', description: 'Arabic fallback' },
  ];
  const call = async (method, path, body, expected = 200) => {
    const result = await request(method, path, body, adminSession);
    assert.equal(result.response.status, expected, method + ' ' + path);
    return result.body;
  };
  const base = '/api/v1/admin',
    type = await call(
      'POST',
      base + '/product-types',
      { code: 'synthetic-process-type', translations: names },
      201,
    ),
    group = await call(
      'POST',
      base + '/attribute-groups',
      { code: 'synthetic-process-group', translations: names },
      201,
    );
  const definition = async (kind, publicValue, code) =>
    call(
      'POST',
      base + '/attributes',
      {
        code,
        translations: names,
        kind,
        unitCode: null,
        minimum: kind === 'NUMBER' ? '0' : null,
        maximum: null,
        allowMultiple: false,
        public: publicValue,
        filterable: publicValue,
        textMultiline: false,
        textMaxLength: 4000,
      },
      201,
    );
  const number = await definition('NUMBER', true, 'synthetic-process-number'),
    hidden = await definition('BOOLEAN', false, 'synthetic-process-private'),
    choice = await definition('CHOICE', true, 'synthetic-process-choice'),
    text = await definition('TEXT', true, 'synthetic-process-text');
  const option = await call(
    'POST',
    base + '/attributes/' + choice.id + '/options',
    {
      code: 'synthetic-choice',
      sortOrder: '1024',
      translations: names.map((t) => ({ ...t, description: null })),
    },
    201,
  );
  const schema = () => call('GET', base + '/product-types/' + type.id + '/schema');
  const change = async (path, change, version, schemaRevision = null) => {
    const body = { change, expectedVersion: version, expectedSchemaRevision: schemaRevision },
      preview = await call('POST', path + '/changes/preview', body);
    assert.deepEqual(preview.blockers, []);
    return call('POST', path + '/changes', {
      ...body,
      confirm: true,
      precondition: preview.precondition,
    });
  };
  let current = await schema();
  await change(
    base + '/product-types/' + type.id,
    { kind: 'group.place', placementId: null, groupId: group.id, sortOrder: '1024' },
    current.configuration.type.version,
    current.form.schemaRevision,
  );
  current = await schema();
  const placement = current.configuration.groups[0].id;
  for (const d of [number, hidden, choice, text]) {
    current = await schema();
    await change(
      base + '/product-types/' + type.id,
      {
        kind: 'assignment.put',
        assignmentId: null,
        assignment: {
          definitionId: d.id,
          groupPlacementId: placement,
          sortOrder: '1024',
          required: d.id === number.id,
          public: true,
          searchable: false,
          filterable: false,
          comparable: false,
        },
      },
      current.configuration.type.version,
      current.form.schemaRevision,
    );
  }
  current = await schema();
  assert.equal(current.form.fields.length, 4);
  assert.equal(
    current.form.fields.find((f) => f.definitionId === choice.id).options[0].id,
    option.id,
  );
  const category = await call('POST', base + '/categories', { translations: names }, 201),
    coverAssetId = await registerImage();
  const product = await call(
    'POST',
    base + '/products',
    {
      categoryId: category.id,
      productTypeId: type.id,
      coverAssetId,
      translations: names,
      modelCode: 'SYNTHETIC-DYNAMIC-PROCESS',
      expectedSchemaRevision: current.form.schemaRevision,
      expectedCategoryVersion: category.version,
      values: [
        { definitionId: number.id, value: { kind: 'NUMBER', number: '90071992547409.123456' } },
        { definitionId: hidden.id, value: { kind: 'BOOLEAN', boolean: false } },
        { definitionId: choice.id, value: { kind: 'CHOICE', optionIds: [option.id] } },
        {
          definitionId: text.id,
          value: { kind: 'TEXT', translations: [{ locale: 'ar', text: 'Synthetic Arabic text' }] },
        },
      ],
    },
    201,
  );
  assert.equal(
    (await call('GET', base + '/products/' + product.id + '/edit-schema')).form.fields.length,
    4,
  );
  let publicResponse = await request('GET', '/api/v1/products/' + product.id + '?locale=ckb');
  assert.equal(publicResponse.response.status, 200);
  assert.equal(publicResponse.body.attributes.length, 3);
  assert.equal(JSON.stringify(publicResponse.body).includes(hidden.id), false);
  assert.equal(
    publicResponse.body.attributes.find((v) => v.definitionId === number.id).value.number,
    '90071992547409.123456',
  );
  assert.equal(
    publicResponse.body.attributes.find((v) => v.definitionId === text.id).value
      .resolvedValueLocale,
    'ar',
  );
  await change(
    base + '/attributes/' + number.id,
    {
      kind: 'definition.update',
      definition: {
        code: number.code,
        translations: [{ ...names[0], name: 'Changed shared label' }],
        kind: 'NUMBER',
        unitCode: null,
        minimum: '0',
        maximum: null,
        allowMultiple: false,
        public: true,
        filterable: true,
        textMultiline: false,
        textMaxLength: 4000,
      },
    },
    number.version,
  );
  await call(
    'PATCH',
    base + '/products/' + product.id,
    {
      expectedVersion: product.version,
      expectedSchemaRevision: product.schemaRevision,
      values: [],
    },
    409,
  );
  const destination = await call('POST', base + '/categories', { translations: names }, 201),
    categoryDetail = await call('GET', base + '/categories/' + category.id),
    rootList = await call('GET', base + '/categories'),
    childList = await call('GET', base + '/categories?parentId=' + destination.id);
  await call('POST', base + '/categories/' + category.id + '/move', {
    parentId: destination.id,
    beforeId: null,
    expectedVersion: categoryDetail.version,
    expectedSourceRevision: rootList.listRevision,
    expectedDestinationRevision: childList.listRevision,
  });
  const moved = await call('GET', base + '/products/' + product.id);
  assert.equal(moved.productTypeId, type.id);
  assert.equal(
    moved.values.find((v) => v.definitionId === number.id).value.number,
    '90071992547409.123456',
  );
  for (const path of [
    '/product-types',
    '/attributes',
    '/attribute-groups',
    '/units',
    '/products/' + product.id,
  ]) {
    assert.equal((await request('GET', base + path, undefined, superSession)).response.status, 403);
    assert.equal((await request('GET', base + path)).response.status, 401);
  }
  assert.equal(
    (await request('POST', base + '/product-types', {}, adminSession, { 'x-csrf-token': '' }))
      .response.status,
    403,
  );
  const preview = await call('GET', base + '/categories/' + destination.id + '/deletion-preview');
  assert.equal(preview.impact.productCount, '1');
  await call('DELETE', base + '/categories/' + destination.id, {
    confirm: true,
    expectedVersion: preview.category.version,
    previewPrecondition: preview.previewPrecondition,
  });
  publicResponse = await request('GET', '/api/v1/products/' + product.id);
  assert.equal(publicResponse.response.status, 404);
  const retained = await retainedResources();
  assert.ok(
    retained.types >= 1 &&
      retained.definitions >= 4 &&
      retained.groups >= 1 &&
      retained.assets >= 1,
  );
  console.log(
    'PASS dynamic configuration -> translated form -> verified-cover product -> public privacy/fallback -> stale schema -> category move -> retained soft deletion',
  );
  return {
    dynamicFormSchema: true,
    dynamicProductWorkflow: true,
    dynamicPublicPrivacy: true,
    dynamicSchemaConflict: true,
    dynamicCategoryCompatibility: true,
  };
}
