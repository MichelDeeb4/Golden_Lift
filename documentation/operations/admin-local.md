# Admin local operations

Use Node 24 and the root npm workspace. Install/build using the existing backend and frontend guides. Staff views require actual Identity, Catalog, Media and Gateway services; public demo mode does not supply staff fixtures.

## Database preparation

For an existing database, follow reviewed Dynamic Catalog and B5 migration procedures first, with coordinated backups and a reviewed target. Then inspect the additive Admin upgrade:

```powershell
npm.cmd run db:admin
npm.cmd run db:admin -- apply --reviewed
```

The second command explicitly applies SQL 21 as the Catalog owning migration role and refreshes runtime grants. Do not execute against an unreviewed live database. New disposable Catalog fixtures use SQL 22. Runtime roles retain no migration privileges. No installed project database was upgraded during this implementation.

## Web and service configuration

Start the existing five-service development composition after database preparation. Initialize private local service credentials with `npm.cmd run auth:setup` if absent. Bootstrap Super Admin using the existing Identity operator flow; there is no default password. Invitations and resets require the configured mail transport.

Set `STAFF_APP_URL=http://localhost:8081/admin/` for Metro, or `http://localhost:8082/admin/` for an exported preview, before starting Identity. Set `ALLOWED_ORIGINS` to the matching origin for Gateway and owning HTTP services. Cookies are SameSite=Strict, so use the same hostname consistently across web, Gateway and Media; do not mix localhost with 127.0.0.1.

Frontend public variables:

| Variable | Default |
| --- | --- |
| `EXPO_PUBLIC_ADMIN_API_URL` | `http://localhost:3000` |
| `EXPO_PUBLIC_MEDIA_ORIGIN` | `http://localhost:3003` |

Configure `MEDIA_PUBLIC_ORIGIN` consistently for returned binary/delivery URLs. Only public origins belong in bundled variables; service credentials belong exclusively in backend configuration. Rebuild/restart Metro after changing frontend configuration.

For an exported preview, inject the browser-facing origins explicitly before starting the backend (the root `.env.example` documents values; `dev` does not load it automatically):

```powershell
$env:STAFF_APP_URL='http://localhost:8082/admin/'
$env:ALLOWED_ORIGINS='http://localhost:8082'
$env:MEDIA_PUBLIC_ORIGIN='http://localhost:3003'
npm.cmd run dev
```

Run `npm.cmd run storefront:dev`, then open `/admin/login`. Admin lands at `/admin`; Super Admin lands at `/super-admin/admins`. For export, run `npm.cmd run storefront:build` and `npm.cmd run storefront:preview`, then open `http://localhost:8082/admin/login`.

## Verification

```powershell
npm.cmd run check
npm.cmd run test:frontend
npm.cmd run storefront:build
npm.cmd run test:integration
npm.cmd run test:storefront
npm.cmd run test:admin
```

Integration/browser tests must point `GL_DATABASE_CONFIG_FILE` to an isolated validation cluster. Browser fixtures create disposable service-owned databases, random credentials and private test files, start actual HTTP applications on Gateway 3000/Media 3003 and remove their own fixtures. Those ports must be free; do not stop unrelated services to make tests run. The browser harness imports the compiled database fixture produced by backend tests and service builds.

On Windows, start the exported preview in a separate terminal before browser tests. The existing preview can be reused, avoiding runner-owned preview shutdown issues. Admin browser tests use localhost; public tests use 127.0.0.1. Test-only security/processing adapters publish image/video/PDF derivatives; video bytes are actual browser-recorded MP4 and raster fixtures are synthetic. These adapters are confined to the harness and do not close production B5 scanner, codec, broker or storage acceptance gates. Stop disposable clusters with process visibility; the cleanup helper rejects a retained PostgreSQL process marker before removing files.
