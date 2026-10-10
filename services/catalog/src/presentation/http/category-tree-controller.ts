import type { IncomingMessage } from 'node:http';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApplicationError,
  locale,
  uuid,
  version,
  revisionPrecondition,
} from '@business-platform/contracts';
import type {
  AuthenticatedActor,
  BreadcrumbPage,
  CategoryCollectionPage,
  MoveDestinationPage,
  SessionAuthenticator,
} from '@business-platform/contracts';
import { staffRequest } from '@business-platform/platform';
import type { ReadCategoryNavigation } from '../../application/use-cases/read-category-navigation.js';
import type { MoveCategory } from '../../application/use-cases/move-category.js';
import type { ReorderCategories } from '../../application/use-cases/reorder-categories.js';
import { STAFF_AUTHENTICATOR } from './admin-categories-controller.js';
import {
  decodeCursor,
  encodeCursor,
  explicitParent,
  listCursor,
  listQuery,
  pageSize,
  strictRecord,
} from './category-query.js';
export const CATEGORY_NAVIGATION = Symbol('ReadCategoryNavigation'),
  MOVE_CATEGORY = Symbol('MoveCategory'),
  REORDER_CATEGORIES = Symbol('ReorderCategories');
@Controller('api/v1/admin/categories')
export class CategoryTreeController {
  constructor(
    @Inject(CATEGORY_NAVIGATION)
    private readonly read: ReadCategoryNavigation,
    @Inject(MOVE_CATEGORY)
    private readonly move: MoveCategory,
    @Inject(REORDER_CATEGORIES)
    private readonly reorder: ReorderCategories,
    @Inject(STAFF_AUTHENTICATOR)
    private readonly authentication: SessionAuthenticator,
  ) {}
  @Get()
  async list(
    @Query()
    value: unknown,
    @Req()
    request: IncomingMessage,
  ): Promise<CategoryCollectionPage> {
    const actor = await this.authentication.authenticate(staffRequest(request, false));
    const { rootRevision: _rootRevision, ...page } = await this.children(value, null, actor);
    return page;
  }
  private async children(
    value: unknown,
    movingId: ReturnType<typeof uuid> | null,
    actor: AuthenticatedActor,
  ): Promise<
    CategoryCollectionPage & {
      readonly rootRevision: string | null;
    }
  > {
    const input = listQuery(value, movingId),
      result = await this.read.list({ ...input, limit: input.limit + 1 }, actor),
      items = result.items.slice(0, input.limit),
      last = items.at(-1);
    return {
      parentId: input.parentId,
      listRevision: result.revision,
      items,
      nextCursor:
        result.items.length > input.limit && last
          ? listCursor(input.parentId, input.locale, movingId, last, result.revision)
          : null,
      rootRevision: result.rootRevision,
    };
  }
  @Get(':id/move-destinations')
  async destinations(
    @Param('id')
    id: string,
    @Query()
    value: unknown,
    @Req()
    request: IncomingMessage,
  ): Promise<MoveDestinationPage> {
    const actor = await this.authentication.authenticate(staffRequest(request, false));
    const result = await this.children(value, uuid(id), actor);
    if (!result.rootRevision)
      throw new ApplicationError('INTERNAL_ERROR', 'Root category scope is unavailable.');
    const { rootRevision, ...page } = result;
    return { ...page, rootDestination: { parentId: null, listRevision: rootRevision } };
  }
  @Get(':id/breadcrumbs')
  async breadcrumbs(
    @Param('id')
    id: string,
    @Query()
    value: unknown,
    @Req()
    request: IncomingMessage,
  ): Promise<BreadcrumbPage> {
    const actor = await this.authentication.authenticate(staffRequest(request, false)),
      query = strictRecord(value, ['locale', 'limit', 'cursor']),
      categoryId = uuid(id),
      language = locale(query['locale']),
      limit = pageSize(query['limit']),
      cursor = decodeCursor(query['cursor']);
    let afterDepth = '-1',
      expectedRevision: string | null = null;
    if (cursor) {
      if (
        Object.keys(cursor).some(
          (key) => !['kind', 'id', 'locale', 'depth', 'revision'].includes(key),
        ) ||
        cursor['kind'] !== 'breadcrumbs' ||
        cursor['id'] !== categoryId ||
        cursor['locale'] !== language ||
        typeof cursor['depth'] !== 'string' ||
        !/^(?:0|[1-9][0-9]{0,18})$/.test(cursor['depth']) ||
        BigInt(cursor['depth']) > 9223372036854775807n
      )
        throw new ApplicationError(
          'VALIDATION_FAILED',
          'Cursor does not match this category path.',
        );
      afterDepth = cursor['depth'];
      expectedRevision = revisionPrecondition(cursor['revision']);
    }
    const result = await this.read.breadcrumbs(
        categoryId,
        language,
        afterDepth,
        limit + 1,
        expectedRevision,
        actor,
      ),
      items = result.items.slice(0, limit),
      lastDepth = result.depths[items.length - 1];
    return {
      items,
      pathRevision: result.revision,
      nextCursor:
        result.items.length > limit && lastDepth !== undefined
          ? encodeCursor({
              kind: 'breadcrumbs',
              id: categoryId,
              locale: language,
              depth: lastDepth,
              revision: result.revision,
            })
          : null,
    };
  }
  @Post('reorder')
  @HttpCode(200)
  async ordering(
    @Body()
    value: unknown,
    @Req()
    request: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(request, true)),
      input = strictRecord(value, ['parentId', 'orderedIds', 'expectedListRevision']);
    if (!Array.isArray(input['orderedIds']) || input['orderedIds'].length > 500)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Supply an ordered array of at most 500 sibling IDs.',
      );
    return this.reorder.execute(
      {
        parentId: explicitParent(input['parentId']),
        orderedIds: input['orderedIds'].map((id: unknown) => uuid(id)),
        expectedListRevision: revisionPrecondition(input['expectedListRevision']),
      },
      actor,
    );
  }
  @Post(':id/move')
  @HttpCode(200)
  async moving(
    @Param('id')
    id: string,
    @Body()
    value: unknown,
    @Req()
    request: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(request, true)),
      input = strictRecord(value, [
        'parentId',
        'beforeId',
        'expectedVersion',
        'expectedSourceRevision',
        'expectedDestinationRevision',
      ]);
    return this.move.execute(
      uuid(id),
      {
        parentId: explicitParent(input['parentId']),
        beforeId: explicitParent(input['beforeId']),
        expectedVersion: version(input['expectedVersion']),
        expectedSourceRevision: revisionPrecondition(input['expectedSourceRevision']),
        expectedDestinationRevision: revisionPrecondition(input['expectedDestinationRevision']),
      },
      actor,
    );
  }
  @Get(':id')
  async detail(
    @Param('id')
    id: string,
    @Query()
    value: unknown,
    @Req()
    request: IncomingMessage,
  ) {
    const actor = await this.authentication.authenticate(staffRequest(request, false)),
      query = strictRecord(value, ['locale']);
    return this.read.detail(uuid(id), locale(query['locale']), actor);
  }
}
