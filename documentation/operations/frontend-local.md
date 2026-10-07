# Storefront local operations

S1 adds a web-only Expo Router storefront in the existing npm workspace. Use Node 24 and the root package-lock.json. B1–B5 remain separate backend services; no frontend database migration is required.

## Run and review

From the repository root:

```powershell
npm.cmd ci --ignore-scripts --no-audit
npm.cmd run storefront:dev
```

Open `http://localhost:8081`. The component reference is `http://localhost:8081/component-lab`. Arabic is the initial language; change to English or Kurdish Sorani using the header switcher. Preferences persist locally.

Review routes: `/`, `/categories`, `/categories/cabins`, `/categories/systems`, `/products`, `/products/aurum-01`, `/search`, `/about`, `/contact`, `/component-lab`, and an unknown route for the branded 404.

For the exported preview:

```powershell
npm.cmd run storefront:build
npm.cmd run storefront:preview
```

Open `http://127.0.0.1:8082`. The preview server serves only exported public files with SPA route fallback. It is a local review tool, not a production host. Do not run a second preview process on that port during browser tests.

## Data configuration

Copy values from `apps/storefront/.env.example` into an ignored app `.env.local`, or set process environment variables before starting/exporting. Restart Metro/rebuild after changing public configuration.

| Variable | Values |
| --- | --- |
| `EXPO_PUBLIC_APP_DATA_MODE` | `api` (default) or explicitly `demo` |
| `EXPO_PUBLIC_API_URL` | Explicit public Gateway origin; HTTPS outside localhost/127.0.0.1 |

Demo mode is visibly labeled and runs without backend credentials. It supplies localized categories/products/specifications and original illustrations/PDF through a dedicated data source. No contact details or company facts are fabricated.

API mode uses live category covers, category/detail/children endpoints and the bounded public product collection/detail API. Search, sort, pagination and schema-derived public dynamic filters use PostgreSQL through Gateway and Catalog. It never replaces failed API calls with fixtures. Ordinary product PDF associations remain private; only permitted technical-source originals are projected for public download. See [local development](local-development.md) for the shared runtime configuration and native Media setup.

For live API mode, configure the existing Gateway/Media approved web origins and a same-origin reverse proxy or reviewed CORS arrangement. Frontend public variables are bundled and must not contain runtime DB credentials, service tokens or signing secrets. B5 authorizes public media with exact context and fresh decisions; its private provider/scanner/broker acceptance gates remain unchanged.

## Verification commands

```powershell
npm.cmd run check
npm.cmd run test:frontend
npm.cmd run storefront:build
npm.cmd run test:storefront
```

`check` builds the existing backend, typechecks backend and frontend, checks formatting/ownership and runs established backend unit tests. `test:frontend` checks tokens/contrast, actual Sorani glyph coverage, demo invariants and a real local HTTP adapter fixture. It does not start the production backend.

`test:storefront` starts the exported preview and uses installed Microsoft Edge. It checks controls, modal focus, mobile drawer, localization, gallery/tabs/pagination, responsive overflow and four screenshot baselines. This configuration was validated on Windows; install an appropriate browser and review new platform baselines before using it elsewhere. Do not update baselines merely to silence an unexplained regression.

`node scripts/s1-dev-smoke.mjs` checks the running development site in Edge. Screenshots for review are in `.local/s1-screenshots`; versioned Windows comparison baselines are under `tests/frontend.browser.test.ts-snapshots`.

## Current limitations

This is a client-visible visual shell, not production readiness. It uses client-side SPA rendering; a deployed host needs route fallback, TLS/security headers and a reviewed caching policy. SSR/SEO and route-bundle optimization require deployment work. The exported JavaScript and font sizes are recorded in S1 validation; no Lighthouse performance score is claimed.

Admin and Super Admin are implemented web workspaces backed by the owning services. Android/iOS applications, commerce/customer routes and inquiry submission remain outside this phase. Contact/About still require approved company content. Native local video/PDF processing is tested separately from explicit demo screenshots; cloud delivery remains a deployment gate.

Expo may initialize caches outside the repository and download optional React Native DevTools. Restricted terminals may require permission. Its fallback DevTools warning does not imply failure of the web application; the actual development browser smoke determines application behavior.
