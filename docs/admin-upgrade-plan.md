# Admin upgrade delivery plan

The approved scope is delivered sequentially. A stage is not complete merely because its UI exists.

1. Foundation: real admin authentication, normalized data contracts, unique listing IDs, atomic product/variant saves, stale-write protection, honest loading/error/empty states. Migration must be tested and applied before live writes are enabled.
2. Listing manager: unified storefront catalogue, listing media, variant matrix and bulk editing, listing duplication and publish validation.
3. Custom operations: versioned field rules, request inbox, proof approval, production snapshots, AI job tracking using the listing's exact primary image.
4. CMS: shared page renderer, published collections/navigation, versioned theme content, imports and reporting.

Release requirements: unit/database regression tests, production build, browser checks, and explicit reporting of anything requiring operator setup. Do not silently use demo records when a configured database request fails. Do not bypass RLS to make a save appear successful.

Current delivery: foundation code and the first variant matrix are implemented; 36 regression tests pass, including an isolated PostgreSQL migration/rollback/RLS test. Login and the matrix component were checked in-browser. The approved migration is now applied to the live Supabase project; catalogue integrity and anonymous RPC denial were verified. The explicitly approved account now has an Extra Time-specific admin claim while its existing role is preserved; scoped RLS/RPC tests pass. A fresh authenticated end-to-end save verification is still required before promoting the preview. The public storefront, custom operations and shared CMS remain later stages; do not label the overall plan complete.

Design: preserve Extra Time's ink (#0a0a0a), chalk (#f4f3ee), white (#ffffff), line (#d4d3cd), acid (#f8f04a) and red (#d72c2c). Manrope for working UI; Barlow Condensed for restrained titles. Left-aligned forms, 14px input/body text and clear action/error states; no decorative oversized slogans in new operational screens.
