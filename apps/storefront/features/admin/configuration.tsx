import { ReviewedChange } from './reviewed-change';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { namedSchema, pageSchema } from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
import { useRouter } from 'expo-router';
import {
  GLButton,
  GLCheckbox,
  GLHeading,
  GLInput,
  GLModal,
  GLSelect,
  GLPageHeader,
  GLFormSection,
  GLActionBar,
} from '@golden-lift/ui';
import { useStaffApi, useUnsaved } from './context';
import { useAdminTranslation } from './translations';
import {
  FocusedEditor,
  ActionFeedback,
  TableState,
  TranslationFields,
  emptyTranslations,
  jsonResponse,
  translationDefaults,
  translationInput,
  useAction,
  useStaffOptions,
  MoreOptions,
} from './common';
import type { TranslationForm } from './common';
import { AssignmentEditor, OptionEditor, OrderEditor } from './configuration-editors';
import { AddChoiceOption } from './choice-options';
export type ConfigurationResource = 'product-types' | 'attributes' | 'attribute-groups' | 'units';
const optionSchema = namedSchema.extend({
  definitionId: z.string().uuid(),
  sortOrder: z.string(),
  deprecated: z.boolean(),
});
const definitionSchema = namedSchema.extend({
  kind: z.enum(['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE']),
  unit: z.object({ code: z.string(), symbol: z.string() }).nullable(),
  minimum: z.string().nullable(),
  maximum: z.string().nullable(),
  allowMultiple: z.boolean(),
  public: z.boolean(),
  filterable: z.boolean(),
  deprecated: z.boolean(),
  textMultiline: z.boolean(),
  textMaxLength: z.number(),
  options: z.array(optionSchema),
});
const unitSchema = namedSchema
  .omit({ id: true })
  .extend({ symbol: z.string(), dimension: z.string() });
export function Configuration({ resource, id }: { resource: ConfigurationResource; id?: string }) {
  const api = useStaffApi(),
    router = useRouter(),
    { locale } = useLocale(),
    t = useAdminTranslation(),
    action = useAction(),
    [cursor, setCursor] = useState(''),
    [create, setCreate] = useState(false),
    [code, setCode] = useState(''),
    [kind, setKind] = useState('NUMBER'),
    [unit, setUnit] = useState(''),
    [minimum, setMinimum] = useState(''),
    [maximum, setMaximum] = useState(''),
    [pub, setPub] = useState(false),
    [filterable, setFilterable] = useState(false),
    [multiple, setMultiple] = useState(false),
    [multiline, setMultiline] = useState(false),
    [maxLength, setMaxLength] = useState('4000'),
    [symbol, setSymbol] = useState(''),
    [dimension, setDimension] = useState(''),
    [definitionId, setDefinitionId] = useState(''),
    [required, setRequired] = useState(false),
    [groupPlacement, setGroupPlacement] = useState(''),
    [groupId, setGroupId] = useState('');
  const [constraintsBaseline, setConstraintsBaseline] = useState<string | null>(null);
  const form = useForm<TranslationForm>({ defaultValues: structuredClone(emptyTranslations) });
  const createForm = useForm<TranslationForm>({
    defaultValues: structuredClone(emptyTranslations),
  });
  const constraints = JSON.stringify([
    kind,
    unit,
    minimum,
    maximum,
    multiple,
    pub,
    filterable,
    multiline,
    maxLength,
  ]);
  const constraintsDirty = constraintsBaseline !== null && constraints !== constraintsBaseline;
  useUnsaved(
    form.formState.isDirty ||
      createForm.formState.isDirty ||
      constraintsDirty ||
      create ||
      Boolean(definitionId || groupId),
  );
  const title =
    resource === 'product-types'
      ? t('types')
      : resource === 'attributes'
        ? t('attributes')
        : resource === 'attribute-groups'
          ? t('groups')
          : t('units');
  const response =
    resource === 'attributes' ? definitionSchema : resource === 'units' ? unitSchema : namedSchema;
  const list = useQuery({
    queryKey: ['staff', 'configuration', resource, cursor],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/${resource}?limit=25${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
        pageSchema(response),
        undefined,
        'GET',
        signal,
      ),
  });
  const detail = useQuery({
    queryKey: ['staff', 'configuration', resource, id],
    queryFn: ({ signal }) =>
      api.request(`/admin/${resource}/${id}`, response, undefined, 'GET', signal),
    enabled: !!id,
  });
  const definitions = useStaffOptions(
    '/admin/attributes',
    definitionSchema,
    resource === 'product-types' && !!id,
  );
  const groups = useStaffOptions(
    '/admin/attribute-groups',
    namedSchema,
    resource === 'product-types' && !!id,
  );
  const units = useStaffOptions('/admin/units', unitSchema, resource === 'attributes');
  const schema = useQuery({
    queryKey: ['staff', 'configuration-schema', id, locale],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/product-types/${id}/schema?locale=${locale}`,
        z.object({
          configuration: z.object({
            groups: z.array(
              z.object({ id: z.string(), group: namedSchema, sortOrder: z.string() }),
            ),
            attributes: z.array(
              z.object({
                id: z.string(),
                definition: definitionSchema,
                groupPlacementId: z.string().nullable(),
                sortOrder: z.string(),
                required: z.boolean(),
                public: z.boolean(),
                filterable: z.boolean(),
                searchable: z.boolean(),
                comparable: z.boolean(),
              }),
            ),
          }),
        }),
        undefined,
        'GET',
        signal,
      ),
    enabled: resource === 'product-types' && !!id,
  });
  useEffect(() => {
    if (detail.data && !form.formState.isDirty && !constraintsDirty) {
      form.reset(translationDefaults(detail.data.translations));
      setCode(detail.data.code);
      if ('kind' in detail.data) {
        const d = detail.data;
        setKind(d.kind);
        setUnit(d.unit?.code ?? '');
        setMinimum(d.minimum ?? '');
        setMaximum(d.maximum ?? '');
        setMultiple(d.allowMultiple);
        setPub(d.public);
        setFilterable(d.filterable);
        setMultiline(d.textMultiline);
        setMaxLength(String(d.textMaxLength));
        setConstraintsBaseline(
          JSON.stringify([
            d.kind,
            d.unit?.code ?? '',
            d.minimum ?? '',
            d.maximum ?? '',
            d.allowMultiple,
            d.public,
            d.filterable,
            d.textMultiline,
            String(d.textMaxLength),
          ]),
        );
      }
    }
  }, [detail.data]);
  const changeKind =
    resource === 'product-types'
      ? 'type.metadata'
      : resource === 'attribute-groups'
        ? 'group.metadata'
        : resource === 'units'
          ? 'unit.metadata'
          : 'definition.update';
  const definitionInput = {
    code: id ? (detail.data?.code ?? code) : code,
    translations: translationInput(form.getValues()),
    kind,
    unitCode: kind === 'NUMBER' ? unit || null : null,
    minimum: kind === 'NUMBER' ? minimum || null : null,
    maximum: kind === 'NUMBER' ? maximum || null : null,
    allowMultiple: kind === 'CHOICE' && multiple,
    public: pub,
    filterable,
    textMultiline: kind === 'TEXT' && multiline,
    textMaxLength: kind === 'TEXT' ? Number(maxLength) : 4000,
  };
  const typeField = (
    <GLSelect
      label={t('type')}
      value={kind}
      onChange={setKind}
      options={['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE'].map((value) => ({
        value,
        label: t(value.toLowerCase() as 'number' | 'boolean' | 'text' | 'choice'),
      }))}
    />
  );
  const constraintsFields = (
    <GLFormSection title={t('constraints')}>
      <div className="gl-admin-grid">
        {kind === 'NUMBER' && (
          <>
            <GLSelect
              label={t('unit')}
              value={unit}
              onChange={setUnit}
              options={[
                { value: '', label: t('choose') },
                ...units.items.map((item) => ({
                  value: item.code,
                  label: `${item.code} (${item.symbol})`,
                })),
              ]}
            />
            <MoreOptions query={units} label={t('unit')} />
            <GLInput
              label={t('minimum')}
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
            <GLInput
              label={t('maximum')}
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
            />
          </>
        )}
        {kind === 'CHOICE' && (
          <GLCheckbox
            label={t('multiple')}
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
          />
        )}
        {kind === 'TEXT' && (
          <>
            <GLCheckbox
              label={t('multiline')}
              checked={multiline}
              onChange={(e) => setMultiline(e.target.checked)}
            />
            <GLInput
              label={t('maxLength')}
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value)}
            />
          </>
        )}
        {kind === 'BOOLEAN' && <p>{t('boolean')}</p>}
      </div>
    </GLFormSection>
  );
  const visibilityFields = (
    <GLFormSection title={t('visibility')}>
      <div className="gl-admin-grid">
        <GLCheckbox label={t('public')} checked={pub} onChange={(e) => setPub(e.target.checked)} />
        <GLCheckbox
          label={t('filterable')}
          checked={filterable}
          onChange={(e) => setFilterable(e.target.checked)}
        />
      </div>
    </GLFormSection>
  );
  return (
    <>
      <GLPageHeader
        title={title}
        breadcrumbs={[
          { label: t('dashboard'), href: '/admin' },
          { label: title, href: '/admin/' + resource },
        ]}
        context={
          detail.data && (
            <span>
              {detail.data.deprecated ? t('deprecated') : t('active')} · {t('version')}{' '}
              {detail.data.version}
            </span>
          )
        }
      />
      <ActionFeedback action={action} reload={() => void detail.refetch()} />
      <div className="gl-master-detail">
        <aside className="gl-master-list" aria-label={title}>
          {!id && (
            <GLButton
              onClick={() => {
                setCreate(true);
                createForm.reset(structuredClone(emptyTranslations));
              }}
            >
              {t('create')}
            </GLButton>
          )}
          <TableState pending={list.isPending} error={list.error} empty={!list.data?.items.length}>
            <table>
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('code')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <a
                        aria-current={id === ('id' in row ? row.id : row.code) ? 'page' : undefined}
                        href={`/admin/${resource}/${'id' in row ? row.id : row.code}`}
                      >
                        {(row.translations.find((x) => x.locale === locale) ?? row.translations[0])
                          ?.name ?? row.code}
                      </a>
                    </td>
                    <td>{row.code}</td>
                    <td>{row.deprecated ? t('deprecated') : t('active')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableState>
          {list.data?.nextCursor && (
            <GLButton onClick={() => setCursor(list.data!.nextCursor!)}>{t('next')}</GLButton>
          )}
        </aside>
        <div className="gl-detail-canvas">
          {!id && !create && (
            <p className="gl-muted">
              {t('choose')} — {title}
            </p>
          )}
          {id && detail.data && (
            <>
              <GLFormSection title={t('identity')}>
                <div className="gl-admin-grid">
                  <GLInput label={t('code')} value={detail.data.code} disabled />
                  {resource === 'attributes' && typeField}
                </div>
              </GLFormSection>
              <TranslationFields form={form} />
              {resource === 'units' && 'symbol' in detail.data && (
                <>
                  <GLInput label={t('symbol')} value={detail.data.symbol} disabled />
                  <GLInput label={t('dimension')} value={detail.data.dimension} disabled />
                </>
              )}
              {resource === 'attributes' && (
                <>
                  {constraintsFields}
                  {visibilityFields}
                </>
              )}
              <GLActionBar>
                <ReviewedChange
                  path={`/admin/${resource}/${id}`}
                  version={detail.data.version}
                  schemaRevision={detail.data.schemaRevision ?? null}
                  change={
                    resource === 'attributes'
                      ? {
                          kind: changeKind,
                          definition: {
                            ...definitionInput,
                            translations: translationInput(form.watch()),
                          },
                        }
                      : { kind: changeKind, translations: translationInput(form.watch()) }
                  }
                  label={t('save')}
                  onSaved={() => {
                    form.reset(form.getValues());
                    setConstraintsBaseline(constraints);
                  }}
                />
              </GLActionBar>
              {resource === 'attributes' &&
                'options' in detail.data &&
                detail.data.kind === 'CHOICE' && (
                  <section>
                    <GLHeading level={2} role="heading5">
                      {t('option')}
                    </GLHeading>
                    {detail.data.options.map((option) => (
                      <div key={option.id}>
                        <OptionEditor option={option} />
                        <span>
                          {option.translations.find((x) => x.locale === locale)?.name ??
                            option.code}
                        </span>
                        <ReviewedChange
                          path={`/admin/attribute-options/${option.id}`}
                          version={option.version}
                          schemaRevision={null}
                          change={{ kind: 'option.deprecate' }}
                          label={t('deprecated')}
                        />
                        <ReviewedChange
                          path={`/admin/attribute-options/${option.id}`}
                          version={option.version}
                          schemaRevision={null}
                          change={{ kind: 'option.delete' }}
                          label={t('remove')}
                        />
                      </div>
                    ))}
                    <AddChoiceOption key={id} definitionId={id!} options={detail.data.options} />
                  </section>
                )}
              {resource === 'product-types' && (
                <section>
                  <GLHeading level={2} role="heading5">
                    {t('schema')}
                  </GLHeading>
                  <MoreOptions query={definitions} label={t('attributes')} />
                  <MoreOptions query={groups} label={t('groups')} />
                  <div className="gl-schema-subsection">
                    <GLHeading level={3} role="heading6">
                      {t('groups')}
                    </GLHeading>{' '}
                    <GLSelect
                      label={t('groups')}
                      value={groupId}
                      onChange={setGroupId}
                      options={[
                        { value: '', label: t('choose') },
                        ...groups.items.map((x) => ({ value: x.id, label: x.code })),
                      ]}
                    />
                    <ReviewedChange
                      path={`/admin/product-types/${id}`}
                      version={detail.data.version}
                      schemaRevision={detail.data.schemaRevision!}
                      change={{
                        kind: 'group.place',
                        placementId: null,
                        groupId,
                        sortOrder: '1024',
                      }}
                      label={t('group')}
                      onSaved={() => setGroupId('')}
                    />
                  </div>
                  <GLHeading level={3} role="heading6">
                    {t('attributes')}
                  </GLHeading>
                  {schema.data?.configuration.attributes.map((a) => (
                    <div key={a.id}>
                      <AssignmentEditor
                        path={`/admin/product-types/${id}`}
                        version={detail.data!.version}
                        revision={detail.data!.schemaRevision!}
                        assignment={a}
                        groups={schema.data!.configuration.groups}
                      />
                      {a.definition.code} · {a.required ? t('required') : ''}
                      <ReviewedChange
                        path={`/admin/product-types/${id}`}
                        version={detail.data.version}
                        schemaRevision={detail.data.schemaRevision!}
                        change={{ kind: 'assignment.remove', assignmentId: a.id }}
                        label={t('remove')}
                      />
                    </div>
                  ))}
                  {schema.data && (
                    <>
                      <OrderEditor
                        path={`/admin/product-types/${id}`}
                        version={detail.data.version}
                        revision={detail.data.schemaRevision!}
                        collection="attributes"
                        items={schema.data.configuration.attributes.map((a) => ({
                          id: a.id,
                          label: a.definition.code,
                        }))}
                      />
                      <OrderEditor
                        path={`/admin/product-types/${id}`}
                        version={detail.data.version}
                        revision={detail.data.schemaRevision!}
                        collection="groups"
                        items={schema.data.configuration.groups.map((g) => ({
                          id: g.id,
                          label: g.group.code,
                        }))}
                      />
                      {schema.data.configuration.groups.map((group) => (
                        <ReviewedChange
                          key={group.id}
                          path={`/admin/product-types/${id}`}
                          version={detail.data!.version}
                          schemaRevision={detail.data!.schemaRevision!}
                          change={{
                            kind: 'group.remove',
                            placementId: group.id,
                            moveAssignmentsTo: null,
                          }}
                          label={`${t('remove')} — ${group.group.code}`}
                        />
                      ))}
                    </>
                  )}
                  <GLSelect
                    label={t('attributes')}
                    value={definitionId}
                    onChange={setDefinitionId}
                    options={[
                      { value: '', label: t('choose') },
                      ...definitions.items
                        .filter((x) => !x.deprecated)
                        .map((x) => ({ value: x.id, label: x.code })),
                    ]}
                  />
                  <GLSelect
                    label={t('group')}
                    value={groupPlacement}
                    onChange={setGroupPlacement}
                    options={[
                      { value: '', label: t('all') },
                      ...(schema.data?.configuration.groups ?? []).map((x) => ({
                        value: x.id,
                        label: x.group.code,
                      })),
                    ]}
                  />
                  <GLCheckbox
                    label={t('required')}
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                  />
                  <GLCheckbox
                    label={t('public')}
                    checked={pub}
                    onChange={(e) => setPub(e.target.checked)}
                  />
                  <GLCheckbox
                    label={t('filterable')}
                    checked={filterable}
                    onChange={(e) => setFilterable(e.target.checked)}
                  />
                  <ReviewedChange
                    path={`/admin/product-types/${id}`}
                    version={detail.data.version}
                    schemaRevision={detail.data.schemaRevision!}
                    change={{
                      kind: 'assignment.put',
                      assignmentId: null,
                      assignment: {
                        definitionId,
                        groupPlacementId: groupPlacement || null,
                        sortOrder: '1024',
                        required,
                        public: pub,
                        filterable,
                        searchable: false,
                        comparable: false,
                      },
                    }}
                    label={t('assign')}
                    onSaved={() => setDefinitionId('')}
                  />
                </section>
              )}
              <GLFormSection title={t('state')}>
                {' '}
                {['product-types', 'attributes'].includes(resource) && (
                  <ReviewedChange
                    path={`/admin/${resource}/${id}`}
                    version={detail.data.version}
                    schemaRevision={detail.data.schemaRevision ?? null}
                    change={{
                      kind:
                        resource === 'product-types' ? 'type.deprecate' : 'definition.deprecate',
                    }}
                    label={t('deprecated')}
                  />
                )}
                <ReviewedChange
                  path={`/admin/${resource}/${id}`}
                  version={detail.data.version}
                  schemaRevision={detail.data.schemaRevision ?? null}
                  change={{
                    kind:
                      resource === 'product-types'
                        ? 'type.delete'
                        : resource === 'attributes'
                          ? 'definition.delete'
                          : resource === 'units'
                            ? 'unit.delete'
                            : 'group.delete',
                  }}
                  label={t('remove')}
                  onSaved={() => router.replace(`/admin/${resource}`)}
                />
              </GLFormSection>
            </>
          )}
          <FocusedEditor open={create} onClose={() => setCreate(false)} title={t('create')}>
            <form
              onSubmit={createForm.handleSubmit((v) => {
                action.mutate(
                  () =>
                    api.request(
                      `/admin/${resource}`,
                      jsonResponse,
                      resource === 'attributes'
                        ? { ...definitionInput, translations: translationInput(v) }
                        : resource === 'units'
                          ? { code, symbol, dimension, translations: translationInput(v) }
                          : { code, translations: translationInput(v) },
                      'POST',
                    ),
                  {
                    onSuccess: () => {
                      createForm.reset(v);
                      setCreate(false);
                    },
                  },
                );
              })}
            >
              <GLInput
                label={t('code')}
                value={code}
                required
                onChange={(e) => setCode(e.target.value)}
              />
              {resource === 'attributes' && !id && (
                <GLFormSection title={t('type')}>{typeField}</GLFormSection>
              )}
              <TranslationFields form={createForm} />
              {resource === 'attributes' && !id && (
                <>
                  {constraintsFields}
                  {visibilityFields}
                </>
              )}
              {resource === 'units' && (
                <>
                  <GLInput
                    label={t('symbol')}
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                  />
                  <GLInput
                    label={t('dimension')}
                    value={dimension}
                    onChange={(e) => setDimension(e.target.value)}
                  />
                </>
              )}
              <ActionFeedback action={action} />
              <GLButton type="submit" loading={action.isPending}>
                {t('save')}
              </GLButton>
            </form>
          </FocusedEditor>
        </div>
      </div>
    </>
  );
}
