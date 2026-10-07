import {
  AttributeKind,
  AttributeConstraints,
  AttributeVisibility,
} from './attribute-definition-fields';
import { ReviewedChange } from './reviewed-change';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { namedSchema, pageSchema } from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
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
  GLActionMenu,
} from '@golden-lift/ui';
import { useStaffApi, useUnsaved, StaffError } from './context';
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
export function Configuration({
  resource,
  id: initialId,
}: {
  resource: ConfigurationResource;
  id?: string;
}) {
  const [id, setId] = useState(initialId),
    [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const [editPending, setEditPending] = useState(false);
  const [editPrecondition, setEditPrecondition] = useState<{
    version: string;
    schemaRevision: string | null;
  } | null>(null);
  const api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation(),
    action = useAction('configuration'),
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
  const router = useRouter(),
    filters = useLocalSearchParams<{
      q?: string;
      kind?: string;
      visibility?: string;
      state?: string;
    }>();
  const [constraintsBaseline, setConstraintsBaseline] = useState<string | null>(null);
  const form = useForm<TranslationForm>({ defaultValues: structuredClone(emptyTranslations) });

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
  useUnsaved(form.formState.isDirty || constraintsDirty || Boolean(definitionId || groupId));
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
  const typeField = <AttributeKind kind={kind} setKind={setKind} />;
  const constraintsFields = (
    <AttributeConstraints
      {...{
        kind,
        unit,
        minimum,
        maximum,
        multiple,
        multiline,
        maxLength,
        setUnit,
        setMinimum,
        setMaximum,
        setMultiple,
        setMultiline,
        setMaxLength,
        units,
      }}
    />
  );
  const visibilityFields = <AttributeVisibility {...{ pub, filterable, setPub, setFilterable }} />;
  return (
    <>
      <GLPageHeader
        title={title}
        actions={
          <GLButton
            onClick={() => {
              action.reset();
              setCreate(true);
            }}
          >
            {t(
              resource === 'attributes'
                ? 'createAttribute'
                : resource === 'product-types'
                  ? 'createType'
                  : resource === 'units'
                    ? 'createUnit'
                    : 'createGroup',
            )}
          </GLButton>
        }
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
      <p className="gl-muted">{t('loadedPageFilters')}</p>
      <div className="gl-admin-toolbar">
        <GLInput
          label={t('search')}
          value={filters.q ?? ''}
          onChange={(event) => router.setParams({ q: event.target.value })}
        />
        {resource === 'attributes' && (
          <>
            <GLSelect
              label={t('type')}
              value={filters.kind ?? ''}
              onChange={(kind) => router.setParams({ kind })}
              options={[
                { value: '', label: t('all') },
                ...['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE'].map((value) => ({
                  value,
                  label: t(value.toLowerCase() as 'number' | 'boolean' | 'text' | 'choice'),
                })),
              ]}
            />
            <GLSelect
              label={t('visibility')}
              value={filters.visibility ?? ''}
              onChange={(visibility) => router.setParams({ visibility })}
              options={[
                { value: '', label: t('all') },
                { value: 'public', label: t('public') },
                { value: 'internal', label: t('internal') },
              ]}
            />
          </>
        )}
        <GLSelect
          label={t('state')}
          value={filters.state ?? ''}
          onChange={(state) => router.setParams({ state })}
          options={[
            { value: '', label: t('all') },
            { value: 'active', label: t('active') },
            { value: 'deprecated', label: t('deprecated') },
          ]}
        />
        <GLButton
          variant="ghost"
          onClick={() => router.setParams({ q: '', kind: '', visibility: '', state: '' })}
        >
          {t('clear')}
        </GLButton>
      </div>
      <div
        className={
          'gl-master-detail' + (resource === 'attributes' || !id ? ' gl-configuration-list' : '')
        }
      >
        <aside className="gl-master-list" aria-label={title}>
          <TableState pending={list.isPending} error={list.error} empty={!list.data?.items.length}>
            <table>
              <thead>
                <tr>
                  <th>{t('name')}</th>
                  <th>{t('code')}</th>
                  {resource === 'attributes' && (
                    <>
                      <th>{t('type')}</th>
                      <th>{t('unit')}</th>
                      <th>{t('visibility')}</th>
                    </>
                  )}
                  <th>{t('status')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items
                  .filter(
                    (row) =>
                      (!filters.q ||
                        (row.code + ' ' + row.translations.map((value) => value.name).join(' '))
                          .toLocaleLowerCase()
                          .includes(filters.q.toLocaleLowerCase())) &&
                      (!filters.kind || ('kind' in row && row.kind === filters.kind)) &&
                      (!filters.visibility ||
                        ('public' in row && row.public === (filters.visibility === 'public'))) &&
                      (!filters.state || row.deprecated === (filters.state === 'deprecated')),
                  )
                  .map((row) => (
                    <tr key={row.code} aria-selected={id === ('id' in row ? row.id : row.code)}>
                      <td>
                        <a
                          aria-current={
                            id === ('id' in row ? row.id : row.code) ? 'page' : undefined
                          }
                          href={`/admin/${resource}/${'id' in row ? row.id : row.code}`}
                          data-local-selection
                          onClick={(event) => {
                            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
                              return;
                            event.preventDefault();
                            if (
                              !(form.formState.isDirty || constraintsDirty) ||
                              window.confirm(t('unsaved'))
                            ) {
                              if (id !== ('id' in row ? row.id : row.code)) {
                                form.reset(structuredClone(emptyTranslations));
                                setConstraintsBaseline(null);
                              }
                              setId('id' in row ? row.id : row.code);
                            }
                          }}
                        >
                          {(
                            row.translations.find((x) => x.locale === locale) ?? row.translations[0]
                          )?.name ?? row.code}
                        </a>
                      </td>
                      <td>{row.code}</td>
                      {resource === 'attributes' && 'kind' in row && (
                        <>
                          <td>{row.kind}</td>
                          <td>{row.unit?.symbol ?? '—'}</td>
                          <td>{row.public ? t('public') : t('internal')}</td>
                        </>
                      )}
                      <td>{row.deprecated ? t('deprecated') : t('active')}</td>
                      <td>
                        <GLActionMenu
                          label={t('actions') + ' — ' + row.code}
                          items={[
                            {
                              label: t('edit'),
                              onSelect: () => {
                                if (
                                  !(form.formState.isDirty || constraintsDirty) ||
                                  window.confirm(t('unsaved'))
                                ) {
                                  if (id !== ('id' in row ? row.id : row.code)) {
                                    form.reset(structuredClone(emptyTranslations));
                                    setConstraintsBaseline(null);
                                    setEditPrecondition(null);
                                  }
                                  setId('id' in row ? row.id : row.code);
                                  setEditing(true);
                                }
                              },
                            },
                          ]}
                        />
                      </td>
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
              <GLHeading level={2} role="heading4">
                {(
                  detail.data.translations.find((row) => row.locale === locale) ??
                  detail.data.translations[0]
                )?.name ?? detail.data.code}
              </GLHeading>
              <GLButton
                variant="secondary"
                onClick={() => {
                  setEditPrecondition({
                    version: detail.data!.version,
                    schemaRevision: detail.data!.schemaRevision ?? null,
                  });
                  setEditing(true);
                }}
              >
                {t('edit')}
              </GLButton>
              <FocusedEditor
                dialog
                open={editing}
                pending={editPending}
                dirty={form.formState.isDirty || constraintsDirty}
                title={t('edit')}
                onClose={() => setEditing(false)}
              >
                {detail.error && (
                  <StaffError error={detail.error} reload={() => void detail.refetch()} />
                )}
                <GLFormSection title={t('identity')}>
                  <div className="gl-admin-grid">
                    <GLInput label={t('code')} value={detail.data.code} disabled />
                    {resource === 'attributes' && typeField}
                  </div>
                </GLFormSection>
                <TranslationFields form={form} labelsOnly={resource === 'units'} />
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
                    onPending={setEditPending}
                    path={`/admin/${resource}/${id}`}
                    version={editPrecondition?.version ?? detail.data.version}
                    schemaRevision={editPrecondition?.schemaRevision ?? null}
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
                      setEditing(false);
                    }}
                    reload={async () => {
                      const latest = await detail.refetch();
                      if (latest.data) {
                        form.reset(translationDefaults(latest.data.translations));
                        setEditPrecondition({
                          version: latest.data.version,
                          schemaRevision: latest.data.schemaRevision ?? null,
                        });
                        if ('kind' in latest.data) {
                          const d = latest.data;
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
                    }}
                  />
                </GLActionBar>
                <GLButton
                  variant="secondary"
                  disabled={editPending}
                  onClick={() => {
                    if (
                      !(form.formState.isDirty || constraintsDirty) ||
                      window.confirm(t('unsaved'))
                    )
                      setEditing(false);
                  }}
                >
                  {t('cancel')}
                </GLButton>
              </FocusedEditor>
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
                  onSaved={() => {
                    form.reset(structuredClone(emptyTranslations));
                    setId(undefined);
                  }}
                />
              </GLFormSection>
            </>
          )}
          <ConfigurationCreate
            resource={resource}
            open={create}
            onClose={() => setCreate(false)}
            onCreated={(value) => {
              const record = response.parse(value);
              const key = 'id' in record ? record.id : record.code;
              queryClient.setQueryData(['staff', 'configuration', resource, key], record);
              if (!(form.formState.isDirty || constraintsDirty || definitionId || groupId)) {
                form.reset(structuredClone(emptyTranslations));
                setConstraintsBaseline(null);
                setId(key);
              }
            }}
          />
        </div>
      </div>
    </>
  );
}

function ConfigurationCreate({
  resource,
  open,
  onClose,
  onCreated,
}: {
  resource: ConfigurationResource;
  open: boolean;
  onClose: () => void;
  onCreated: (value: unknown) => void;
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction('configuration');
  const form = useForm<TranslationForm>({ defaultValues: structuredClone(emptyTranslations) });
  const [code, setCode] = useState(''),
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
    [dimension, setDimension] = useState('');
  const units = useStaffOptions('/admin/units', unitSchema, open && resource === 'attributes');
  const dirty =
    form.formState.isDirty ||
    Boolean(
      code ||
      symbol ||
      dimension ||
      unit ||
      minimum ||
      maximum ||
      pub ||
      filterable ||
      multiple ||
      multiline,
    ) ||
    kind !== 'NUMBER' ||
    maxLength !== '4000';
  useUnsaved(dirty);
  const definitionInput = {
    code,
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
  const typeField = <AttributeKind kind={kind} setKind={setKind} />;
  const constraintsFields = (
    <AttributeConstraints
      {...{
        kind,
        unit,
        minimum,
        maximum,
        multiple,
        multiline,
        maxLength,
        setUnit,
        setMinimum,
        setMaximum,
        setMultiple,
        setMultiline,
        setMaxLength,
        units,
      }}
    />
  );
  const visibilityFields = <AttributeVisibility {...{ pub, filterable, setPub, setFilterable }} />;
  return (
    <>
      {' '}
      <ActionFeedback action={action} />
      <FocusedEditor
        dialog
        open={open}
        dirty={dirty}
        pending={action.isPending}
        onClose={onClose}
        title={t(
          resource === 'attributes'
            ? 'createAttribute'
            : resource === 'product-types'
              ? 'createType'
              : resource === 'units'
                ? 'createUnit'
                : 'createGroup',
        )}
      >
        <form
          onSubmit={form.handleSubmit((v) => {
            action.mutate(
              () =>
                api.request(
                  `/admin/${resource}`,
                  jsonResponse,
                  resource === 'attributes'
                    ? { ...definitionInput, code, translations: translationInput(v) }
                    : resource === 'units'
                      ? { code, symbol, dimension, translations: translationInput(v) }
                      : { code, translations: translationInput(v) },
                  'POST',
                ),
              {
                onSuccess: (value) => {
                  onCreated(value);
                  form.reset(structuredClone(emptyTranslations));
                  setCode('');
                  setKind('NUMBER');
                  setUnit('');
                  setMinimum('');
                  setMaximum('');
                  setPub(false);
                  setFilterable(false);
                  setMultiple(false);
                  setMultiline(false);
                  setMaxLength('4000');
                  setSymbol('');
                  setDimension('');
                  onClose();
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
          {resource === 'attributes' && (
            <GLFormSection title={t('type')}>{typeField}</GLFormSection>
          )}
          <TranslationFields form={form} labelsOnly={resource === 'units'} />
          {resource === 'attributes' && (
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
          <GLActionBar>
            <GLButton type="submit" loading={action.isPending}>
              {t('save')}
            </GLButton>
            <GLButton
              variant="secondary"
              disabled={action.isPending}
              onClick={() => {
                if (!dirty || window.confirm(t('unsaved'))) onClose();
              }}
            >
              {t('cancel')}
            </GLButton>
          </GLActionBar>
        </form>
      </FocusedEditor>
    </>
  );
}
