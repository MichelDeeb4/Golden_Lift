# Major visual redesign — baseline

Date: 2026-10-06. Audited repository instructions, shared packages, OpenAPI, design guides, Admin/refinement completion reports and current screenshots. Earlier uncommitted work is retained. The current website was run and captured at 1440, 768 and 390px before presentation changes; staff baseline captures use real disposable service/PostgreSQL fixtures. Captures are in `documentation/assets/major-redesign/before`.

| Screen | Why the current design feels basic | Structural/visual replacement | Behavior retained |
| --- | --- | --- | --- |
| Public header | Utility strip and short generic nav feel detached from imagery | Integrated taller brand/navigation/language command row; slim scroll state; substantial mobile navigation | Links, locale, search, keyboard/drawer focus |
| Homepage | Small framed vector and repeated section/card rhythm | Immersive edge-bleeding 40/60 hero; indexed collection mosaic; one large featured system with supporting products; numbered engineering statement | Real/demo distinction, conditional data/resources, localization |
| Categories | Unequal cards still resemble a standard collection grid | Image-overlay editorial panels; detail cover/title composition; children-or-products distinction | Recursive category invariant, paths, pagination |
| Listing | Four modest boxed products with timid heading | Oversized collection heading; three-column image-dominant grid; quiet integrated toolbar | Supported filters, URL/history, result count and pagination |
| Product detail | Generic split and small information tabs | Immersive 60/40 gallery; desktop thumbnail rail; numbered overview/specification/media/document sections | Capability delivery, keyboard/touch/fullscreen, generic ordered attributes |
| Admin shell | White sidebar and black horizontal bar frame a pile of cards | Dark 240px grouped navigation, light command bar, unboxed workspace | Live authorization and separate roles, sessions, dirty navigation guard |
| Dashboard | Three equal quick-link boxes and one metric | Operational launch area plus real recent product/Media feed | Supported real data, no fabricated totals |
| Product list | Six equal table columns and large flat toolbar | Identity-heavy rows, compact context/state, focused filters and overflow | Bounded server filtering, cursors, private thumbnail grants |
| Product editor | Five stacked bordered panels, no contextual navigation | Section rail / focused editing canvas / read-only summary inspector; tablet inspector drawer; sticky section commands | Mounted drafts, independent saves, versions/schema, precision, reviewed changes |
| Category editor | Primary workflow is a large translation modal | Recursive path/master-detail workspace with inline create/edit canvas | Parent/product invariants, reviewed move/delete/order and cover eligibility |
| Media library | Upload-first layout and filename tiles | Grid-first visual library, upload drawer and asset detail inspector | Resumable upload, private previews, usage/lifecycle/version policies |
| Types/attributes | Detail page and large create modal detached from list | Bounded master list beside inline create/detail workspace | Schema/group/assignment/options/impact reviews and type validation |
| Super Admin | Plain invitation form above directory | Shared workspace shell, focused invitation section and quieter identity directory | Captured-version confirmation, live session revocation, mail behavior |

## Constraints and review gates

Keep palette/font/token ownership; introduce no heavy library. Preserve existing domain/API contracts, soft deletion and Media retention. Do not invent short description, specification group labels, global statistics or unsupported server filters. Category/configuration lists remain bounded and load further pages explicitly.

Each major screen is rendered and captured to an `after` review directory before screenshot baselines change. Review asks whether composition is structurally different, task hierarchy stronger, imagery appropriately dominant and responsive/RTL behavior intentional. Regression snapshots are stability evidence; visual judgment is documented separately. Current screenshots remain preserved as before evidence.
