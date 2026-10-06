# Admin dashboard repository baseline

Inspected 2026-10-06 before implementation. Root AGENTS.md applies; no nested AGENTS.md was found. Read project progress, architecture, current OpenAPI, Identity/category/product controllers, Gateway forwarding, shared frontend packages and Media operations. Existing uncommitted storefront scrolling fixes are preserved.

## Existing foundation

The npm workspace has `apps/storefront`, six shared frontend packages, Expo Router, React Native Web, Tamagui, TanStack Query, React Hook Form, Zod and Arabic/English/Sorani localization. Public UI includes reusable controls, tables, modals/drawers, catalog media components and the component lab. There is no Admin application or staff frontend API client. Backend ownership remains Identity, Catalog, Media and Inquiries with separate databases; Gateway has no business database.

Identity implements cookie-based staff sessions, live account/session verification, mutation CSRF and approved Origin checks. Role names are not a permission hierarchy: ADMIN manages Catalog/Media; SUPER_ADMIN manages Admin accounts. Login/session/logout and password change are available. Active-session directory/revocation UI APIs are not exposed.

## Actual supported HTTP contracts

All JSON routes below are Gateway-relative `/api/v1` routes. Exact inputs and DTOs remain defined by OpenAPI and owning controllers; the frontend must not manufacture additional fields.

| Area | Existing routes |
| --- | --- |
| Authentication | POST `/auth/login`; GET `/auth/session`; POST `/auth/logout`; POST `/auth/password/change` |
| Invitations/password actions | POST `/auth/invitations/accept`, `/auth/password/reset-request`, `/auth/password/reset` |
| Staff management | GET/POST `/staff/admins`; GET/PATCH/DELETE `/staff/admins/:id`; POST `/:id/enable`, `/:id/disable`, `/:id/invitation` |
| Categories | GET/POST `/admin/categories`; GET/PATCH/DELETE `/:id`; GET `/:id/breadcrumbs`, `/:id/move-destinations`, `/:id/deletion-preview`; POST `/:id/move`, `/reorder` |
| Dynamic configuration | GET/POST `/admin/product-types`, `/admin/attributes`, `/admin/attribute-groups`, `/admin/units`; GET their detail routes; POST supported resources `/:id/changes/preview` and `/:id/changes`; POST `/admin/attributes/:id/options` |
| Product schemas | GET `/admin/product-types/:id/schema`; GET `/admin/products/:id/edit-schema` |
| Products | POST `/admin/products`; GET/PATCH `/:id`; POST `/:id/placement`, `/:id/type-change/preview`, `/:id/type-change` |
| Media control | GET `/admin/media/capabilities`; POST `/uploads`; GET `/uploads/:id`; POST `/uploads/:id/authorize`, `/complete`, `/cancel` |
| Media library | GET `/admin/media/assets`, `/assets/:id`, `/assets/:id/usage`, `/statistics`; POST asset `/retry`, `/reprocess`, `/retire`, `/block` |
| Staff preview | GET `/admin/media/assets/:id/variants/:profile/authorization` |

Upload part bytes go to the returned Media capability URL, not the Gateway JSON proxy. Staff preview capabilities must be refreshed, never stored as record data. Removing a product association must use Catalog; it must not retire a shared asset.

## Gaps at the original inspection

1. No GET `/admin/products` collection, search/filter/pagination contract.
2. No product activation/deactivation, featured or manual-order mutation API. Existing product create/edit inputs reject these fields.
3. No product soft-delete API or product deletion-impact contract.
4. No Catalog API to list/attach/detach/reorder gallery images, videos or product PDFs. The existing product write can choose a cover, but this is not a gallery/document editor.
5. ProductDto omits publication/featured/order and media-association state. Frontend cannot infer these from media usage.
6. No category active toggle; B4 currently models active retained branches through deletion rather than an exposed activation workflow.
7. No operational active-product/category totals API. Media statistics exist; other dashboard counts must not be invented.

The database contains additional fields/associations, but their presence does not establish an HTTP contract or authorization/transaction policy. Completing the mandatory product workflows requires focused Catalog application ports/use cases, Prisma transaction adapters, HTTP/Gateway contracts and real PostgreSQL/process regressions. It does not require a new service/database or an architecture redesign.

## Implementation boundary

The user authorized adding the missing APIs and delivering the full dashboard. The implementation adds focused Catalog management ports/use cases, transaction-scoped Prisma persistence, Gateway contracts and reviewed SQL 21/22. Product collections, publication, soft deletion and ordered Media associations now have owning-service APIs. Categories continue their existing B4 lifecycle; dashboard counts use actual Media statistics. This section preserves the original inspection rather than describing current blockers. Current scope and verification are documented in the [dashboard guide](../admin-dashboard.md) and dated validation report.

## External acceptance limits

B5 production acceptance still requires actual ClamAV, FFmpeg/Poppler, RabbitMQ recovery, chosen private S3 provider and Linux isolation verification. An Admin UI or test mock cannot satisfy these gates. No live database migrations or production service/provider validation was performed by this inspection.
