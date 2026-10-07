# 011 — Editorial public composition and section-based staff workspaces

Date: 2026-10-06. Status: implemented. Supersedes the composition choices in [decision 010](010-ui-ux-refinement.md); its authorization, persistence and independent-save constraints remain.

## Problem and decision

The previous refinement improved density without replacing the repeated cards, framed hero, long editor and modal-first category/configuration workflows. The [baseline audit](../implementation/major-redesign-baseline.md) records those problems before implementation.

Replace public page composition with an immersive 40/60 hero, indexed collection mosaic, one featured system, image-dominant three-column collection, 60/40 product gallery/information split and numbered technical dossier. Keep the existing semantic tokens, fonts, typed data sources and Media capabilities. A light command bar and 240px dark sidebar frame the staff workspace. Category and configuration editing use an inline master/detail canvas; focused impact and destructive confirmations remain dialogs.

Introduce `GLWorkspace` and `GLWorkspacePanel` in the existing shared UI package. The controlled section rail, central canvas and read-only inspector solve the demonstrated long-product-editor problem. Overview, Translations, Specifications, Media and Visibility panels remain mounted while hidden, preserving independent drafts. At widths below 1300px the inspector opens in a drawer; below 768px the section rail scrolls horizontally. The shell sidebar moves into a drawer below 1100px.

## Tradeoffs and boundaries

- Navigation selects a section rather than scrolling through all fields. Native buttons, associated region IDs, current-step state and visible focus make the interaction explicit without claiming a tab-widget keyboard contract. The existing language tabs retain their own keyboard contract.
- Basics remain one existing mutation covering identity, translations and specification values. Media and publication remain separate mutations. The presentation cannot offer an atomic all-section save without a new backend contract. Dirty indicators distinguish these drafts; existing version/schema conflicts preserve input and require review.
- Shared `GLHeading` gains an opt-in `fluid` rendering path. Semantic HTML inherits the existing locale font and allows page CSS to set editorial display sizes; the default token-sized Tamagui implementation remains available. This resolves atomic font-size precedence discovered in actual rendered review, without replacing the component library.
- Shared overlays gain opt-in `keepMounted`. Only the upload drawer uses it to retain the existing resumable transfer while closed. The closed native dialog is hidden in shared CSS. Navigating away/reloading still discards in-memory transfer state and grants; no capability or secret is persisted.
- Media is grid-first with a drawer inspector. Filename search is explicitly **Search loaded assets**, applying only to the bounded loaded page. Kind/status filters remain server filters. Gallery drag/drop and accessible earlier/later alternatives operate on the existing global association order, including video/PDF positions. Detachment retains shared bytes.
- Dashboard links, bounded first-page product/Media selections and actual pending Media jobs replace empty navigation tiles. These selections are labeled as a page selection, not global recent activity. Contracts do not supply global active totals or chronological activity ordering; none are fabricated.
- Categories keep bounded recursive paths/children, reviewed moves, sibling revision checks and child-or-product invariants. Configuration lists remain available alongside details; schema impact, assignments, options and retirement stay owned by Catalog.
- Super Admin uses the same workspace shell with only Staff/Account permissions. Invitation delivery and captured-version lifecycle confirmation are unchanged. No credentials or action links enter documentation or screenshots.
- Public demo content remains explicitly labeled. Public collection/search/filter APIs, short-description fields and public specification group labels remain unavailable. No backend, SQL, OpenAPI or service changes are needed for this redesign.

## Acceptance process

Capture current screens before editing, render replacements into a separate review directory, and review composition, hierarchy, imagery, responsive/RTL behavior and task clarity before updating regression baselines. Initial review corrections included heading-size precedence, mobile locale overlap, category mosaic geometry and destructive-action placement. Snapshot equality is stability evidence, not design-quality evidence.

Actual commands, before/after captures, final comparisons and provider limitations are recorded in the [completion report](../implementation/major-redesign-completed-work.md). No production mail, scanner, codec, broker, S3, hosted CI or external accessibility certification is implied by local browser fixtures.
