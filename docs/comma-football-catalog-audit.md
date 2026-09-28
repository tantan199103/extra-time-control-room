# Comma Football catalogue compatibility audit

Audit date: 2026-09-28

Source: [Comma Football](https://commafootball.com/), its public [agent instructions](https://commafootball.com/agents.md), [product sitemap](https://commafootball.com/sitemap.xml), Shopify product JSON and collection JSON.

## Executive decision

The product shape is compatible with Jersevo's existing listing model. A second product model is not needed.

- Reuse `Soccer Jersey` and `Fan Apparel` product groups.
- Reuse existing league and club routes for Premier League, La Liga, Serie A, Bundesliga and Ligue 1.
- Add only three structured browse intents: World Cup jerseys, national team jerseys and football legends.
- Do not reproduce all source collections. The source has 123 public collection records, many of which are sale, pre-order, restock, delay, bundle or campaign mechanics rather than durable customer taxonomy.
- The importer itself only creates `DRAFT` products and zero-stock `DRAFT` variants. A separate, source-scoped launch command is required to make a commercial decision.
- Do not publish branded, player-likeness or copied-media products without documented resale/content rights and an operator review. The launch record retains this review flag; it does not make an “official” or “licensed” claim.

## Source catalogue profile

The public Shopify snapshot contained:

| Dimension | Observed |
| --- | ---: |
| Published product JSON rows | 180 |
| Jerseys | 164 |
| T-shirts | 16 |
| Product vendors | 168 Comma Football, 12 ODMPOD |
| Options | One `Size` option on every product |
| Size range | `2XS`, `XS`, `S`, `M`, `L`, `XL`, `2XL`, `3XL` |
| Variants/product | 4–8, average 7.63 |
| Images/product | 1–14, average 7.35 |
| Public collection records | 123 |

High-volume source signals include World Cup, 2026 World Cup, Legends, International, national teams, named players, Premier League, La Liga, UCL, New Arrival and Pre-order. Source tags also contain internal operations such as inventory tracking, restock dates, sellout risk, delays, priority and campaign labels. Those internal signals are filtered out of public Jersevo tags.

Collection `products_count` values can exceed the current 180-row public product snapshot. This is a Shopify source-state detail, not evidence that Jersevo should invent or import missing products. Import membership is therefore calculated from the product rows actually fetched in the current run.

## Compatibility matrix

| Source field | Jersevo destination | Decision |
| --- | --- | --- |
| Shopify product ID | Stable hashed listing ID | Compatible and idempotent |
| Shopify variant ID | Stable hashed variant ID | Compatible and idempotent |
| Source SKU | Private import audit only | Never trusted as Jersevo SKU |
| Product type `Jersey` | `Soccer Jersey` | Existing catalogue route reused |
| Product type `T-Shirt` | `Fan Apparel` | Existing catalogue route reused |
| Size option | Listing option/variants | `XXS→2XS`, `XXL→2XL`, `XXXL→3XL` normalized |
| AUD price | Private `ai_metadata.sourcePricing` | Explicit conversion required; default public draft price is `0` |
| Variant availability | Private source-state signal | Never converted into sellable stock automatically |
| Source inventory | Not exposed by public JSON | Imported stock is `0` |
| Body HTML | Sanitized text/content blocks | No source HTML rendered |
| Product images | Private download queue, then Supabase media | Only with explicit media permission; optimized and uploaded to owned storage |
| Image filename clues | Media role | Front, back, sleeve and detail roles inferred deterministically |
| Alt text | Media alt | Source alt used when present; otherwise meaningful deterministic alt generated |
| Country tags | `taxonomy.nationalTeam`, `taxonomy.country` | New controlled dimension |
| Player tags | `taxonomy.player`, `taxonomy.playerName` | New controlled dimension; not a new product model |
| World Cup/UCL/league tags | `taxonomy.competition` | New controlled dimension |
| Fit tags | `taxonomy.fit` | New controlled dimension |
| Pre-order text/tags | `taxonomy.lifecycle=pre-order` | Informational only; still Draft and stock 0 |
| Historic year | `taxonomy.year` | Search/filter signal |
| Source provenance | Private `pod_catalog_imports` + private `ai_metadata` | Removed from storefront model by existing public projection |

## Canonical catalogue structure

Existing routes remain primary:

- `/category/soccer-jerseys`
- `/category/fan-apparel`
- `/league/epl`, `/league/laliga`, `/league/seriea`, `/league/bundesliga`, `/league/ligue1`
- Existing compatible club pages such as Arsenal, Liverpool, Barcelona, Real Madrid, Bayern Munich and Paris Saint-Germain

Added structured routes:

- `/category/world-cup-jerseys`
- `/category/national-team-jerseys`
- `/category/football-legends`

The importer also plans three matching `DRAFT` collections for editorial control. They are not published automatically. Source collections such as BFCM, price-drop bands, delays, restocks, end-of-season campaigns and pre-order logistics are not mirrored.

## Import safety contract

`scripts/import-comma-catalog.mjs` is read-only by default.

Dry-run audit:

```powershell
npm run import:comma
```

The JSON report is written to `artifacts/comma-import-report.json` and includes product, variant, image, taxonomy, lifecycle and source-collection classification counts.

Write mode requires a deliberate authorization switch and server-only Supabase credentials:

```powershell
$env:COMMA_SOURCE_AUTHORIZED='true'
npm run sync:comma -- --price-mode ZERO
```

This creates only non-sellable drafts. It does not download images unless `--media` is provided.

For a documented AUD→USD rate (the 2026-09-23 RBA reference used for the first launch was `1 AUD = 0.7102 USD`):

```powershell
$env:COMMA_SOURCE_AUTHORIZED='true'
npm run sync:comma -- --price-mode AUD_TO_USD --usd-rate 0.66
```

`AUD_AS_USD` exists only for an explicit 1:1 commercial policy and is never the default.

Media import must be separately authorized by the operator's rights decision:

```powershell
$env:COMMA_SOURCE_AUTHORIZED='true'
npm run sync:comma -- --price-mode AUD_TO_USD --usd-rate 0.66 --media --media-limit 12
```

Images are processed sequentially per listing with bounded global concurrency, converted to efficient AVIF where safe, capped by a run-level storage budget, and stored under deterministic listing/media paths. Existing Content Credentials/provenance markers are preserved rather than targeted for removal.

## Completed launch run

The authorized production sync on 2026-09-28 used:

```powershell
$env:COMMA_SOURCE_AUTHORIZED='true'
$env:COMMA_MEDIA_BUDGET_BYTES='1073741824'
npm run sync:comma -- --refresh-existing --price-mode AUD_TO_USD --usd-rate 0.7102 --media --media-limit 20 --concurrency 4
node scripts/publish-comma-catalog.mjs --write --stock 1000
```

The result was 180 products, 1,373 variants and 1,323 uploaded images. Every imported product now has a Jersevo-prefixed custom/personalized title, a primary image and alt text, positive USD prices, `PUBLISHED` status and `INDEXABLE` SEO status. Every non-archived imported variant is `ACTIVE` with a recorded launch stock of 1,000. The launch script is restricted to rows audited as `source=commafootball.com`, requires an explicit `--stock`, and writes `ai_metadata.catalogLaunch` for auditability.

The launch is not a claim that the source grants resale, trademark, likeness or photography rights. Those rights remain an operator responsibility and the private `catalogReview` record remains attached to each listing.

## Idempotency and update behavior

- Listing, variant, media and curated collection IDs are deterministic.
- A repeated normal write skips an existing listing.
- `--refresh-existing` can refresh an existing `DRAFT`, but never overwrites a `PUBLISHED` or `ARCHIVED` listing.
- Existing media is merged by stable media ID.
- Import audit rows upsert on source/entity identity.
- Products and collections are never auto-published by the importer. `scripts/publish-comma-catalog.mjs` is the explicit, source-scoped publication step and must be run separately with `--write --stock N`.

## Rights and content review

The source catalogue references real clubs, national teams and famous players. A licensing statement on a source product or collection does not grant Jersevo the right to copy or resell it. Before publishing any imported draft, the operator must independently verify:

1. supply/resale authorization;
2. trademark and player-likeness rights;
3. right to reuse product photography;
4. right to reuse or rewrite product copy;
5. current price, stock, production time, shipping and returns terms.

The importer records `SOURCE_RIGHTS_REVIEW_REQUIRED` and a pending catalogue review on every product. It deliberately does not make an “official” or “licensed” storefront claim.
