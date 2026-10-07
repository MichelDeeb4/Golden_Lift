# UI/UX refinement baseline

Inspected 2026-10-06 against the existing S1 and Admin implementations, AGENTS.md, design/visitor guides, completion evidence, OpenAPI 0.6.0 and shared frontend packages. Existing uncommitted startup/documentation changes belong to the preceding task and are retained.

## Existing behavior

Public Expo routes use a shared shell, typed Catalog/Media adapters, generic specifications and labeled demo content. Admin has live Identity guards, separate role navigation, bounded collections, schema-driven attributes, section saves, reviewed mutations and private B5 Media. Existing tests exercise actual staff HTTP workflows with disposable databases. Tokens, fonts, accessible controls, dialogs/drawers and keyboard tabs are already shared.

## Weaknesses and planned refinement

| Before | Refinement |
| --- | --- |
| Full-background hero and repeated regular grids | Deliberate 45/55 split hero, framed illustration, editorial category arrangement and contrasting engineering statement |
| Similar visual weight across page titles/cards/metadata | Clear page headers, technical metadata, aligned specifications and stronger image framing |
| Product editor starts with all translations, then model/category/type | Identity → Content → Specifications → Media → Visibility with explicit sections and persistent section actions |
| Three simultaneous translation grids | Keyboard-accessible language tabs that retain independent drafts and input direction |
| Media rows emphasize identifiers and many inline actions | Cover composition and kind-specific gallery/video/document sections, tiles and focused action menus |
| Product collection spreads identity across nine columns | Primary name/model/thumbnail, compact context/status columns and a focused filter toolbar |
| Flat navigation | Overview, Catalog, Media and Account groups; Super Admin Staff/Account groups |
| Configuration metadata/constraints/state interleaved | Identity, type-specific constraints, display, assignments/options, impact and state sections |

## Constraints and risks

- No backend/domain changes are planned. Existing contracts have name/description translations, not a separate short-description property; the UI must not invent an unsupported field.
- Statistics expose Media jobs, not complete active-catalog totals. Show actual operational data and bounded recent/product context without fabricated counts.
- Preserve record/schema versions, decimal/bigint strings, independent saves, unsaved guards, reviewed confirmations and soft deletion.
- Language-tab changes require updating E2E interactions to select the desired language while keeping all prior assertions.
- Reordering Media within visual kind sections must retain the existing global association order and accessible earlier/later controls.
- Snapshot baselines will change intentionally only after screenshot review. Check English/Arabic/Sorani and desktop/tablet/mobile.
- Public demo mode remains explicit; complete public list/search API integration and real B5 providers remain outside this presentation refinement.

Verification will include build/types/format/architecture, frontend unit tests, existing public/Admin browser journeys, new composition/tab/menu checks, reviewed visual baselines and a dated evidence report. Existing historical reports will not be rewritten as current results.
