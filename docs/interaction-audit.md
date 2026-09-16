# Interaction repair and page audit

## Scope of this release

The install sheet's closed wrapper had opacity 0 while its child backdrop explicitly had `visibility: visible`. The invisible backdrop could receive clicks above the entire storefront. The repair disables pointer events and makes closed overlays inert; the backdrop only becomes visible while the install sheet is open.

Additional repairs:

- Dialogs support Escape, keyboard focus containment and focus restoration.
- Navigation closes search, cart, install and mobile menu overlays.
- Query-string changes open inline personalization on the same product.
- Product state is keyed by listing; customer drafts are stored per listing for AI round trips.
- Different colours of the same size are separate cart lines.
- Footer stories/custom links and size guide work. Vault buttons explicitly lead to the current drop, not nonexistent archive details.
- Unimplemented actions are disabled/labeled; newsletter signup no longer claims an email was registered.
- Product/template save failures are visible errors, not success messages.
- The service-worker shell version is bumped; only this app's old shell caches are cleaned up.

## Verification

`npm test` covers 17 source-contract and save-handler regression tests. These are not a substitute for browser interaction tests.

Browser checks on local code: desktop filters, product cards, install open/close, size selection, add to bag, quantity changes, Escape, search results, same-product Custom, AI handoff/suggestion/back with draft, and cross-product state isolation. Mobile at 390 × 844: footer navigation, install open/close followed by navigation, menu logo/close, filters, sticky purchase/size finder, cart and footer size guide.

AI generation and checkout/payment transactions are intentionally not submitted during interaction QA. Admin writes to production data are not used as test actions.

Production verification: deployment `dpl_B9kGRuXJCHmoM1Qp7pxZzoLKmPoc` is READY and aliased to `https://extra-time-control-room.vercel.app`. Verified the install-sheet regression on mobile and 1280px desktop, product-card/back navigation, mobile menu, Standard → Custom reopening, listing-reference AI handoff/back, size selection and standard add-to-bag. No browser console errors were returned in the checked production session. Temporary viewport overrides were reset and the production tab returned to `/product/after-90` with the test bag empty.

## Page-by-page follow-up priorities

| Page | Main remaining limitation | Recommended improvement |
| --- | --- | --- |
| Home | Long editorial journey before enough product information; placeholder ratings and imagery | Shorten mobile storytelling; add verified product photography, material details and real evidence before conversion claims. |
| Shop | Static catalogue, colour-only filters | Read published products/variants from one source; add availability/size filters and persistent URL filters. |
| Product | Generic gallery/story reused across listings; fixed sizes/colours unrelated to admin variations | Listing-specific front/back/detail images and story; variant-driven price, stock and availability; show custom cost/lead time clearly. |
| Inline custom | Fields come from static listing definitions | Publish allowed fields from template schema; validate and snapshot custom details with actual orders. Keep AI optional. |
| AI Studio | Long suggestions take substantial mobile space | Condensed starter titles with expandable prompts, preview comparison, retry/history and explicit production approval. Keep exact listing-image reference. |
| Bag | In-memory only; checkout not implemented | Persistent cart keyed by variant/customization, edit links, then real server-validated checkout and order handling. |
| Vault | No archive detail pages | Add real stories or a clear path to current products; do not imply unavailable details exist. |
| Admin overview | Example metrics/activity | Real metrics, tasks requiring attention and connection health; label examples distinctly. |
| Theme Studio | Draft preview is separate from storefront rendering | Shared section renderer, real page-specific schemas, draft/publish/versioning, then undo/redo. |
| Menus | Editor not consumed by storefront; missing automatic validation | Publish navigation configuration into runtime, validate targets, support nested menu editing. |
| Collections | No public collection routes | Publish collection data and build a matching collection route before enabling preview. |
| Products/variations | Admin product data does not drive storefront | Unified media/variant schema, validation and transactional persistence; authenticated admin session. |
| Templates | Partial field controls; fixed artwork policy is not a complete print pipeline | Versioned editable zones/fields and order snapshots; distinguish AI visual direction from print-ready output. |
| Settings | Presence of environment keys is not a health check | Real connectivity checks, admin login/roles, configured integration URLs and publishable store settings. |

Highest priority after this interaction repair: authenticated admin → published data consumed by storefront → variant/media correctness → persistent cart and actual checkout. These are separate implementation work, not completed by disabling placeholder buttons.
