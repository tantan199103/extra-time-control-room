# Fan-gear information architecture and CRO notes

## What the reference storefront gets right

`fangearsport.com` is organized around the way a fan shops: league first, team
second, then a product. Its header exposes a searchable team list and keeps
MLB, NFL and MLS visible as top-level paths. The homepage then repeats the same
journey with league tiles, featured gear, a review/rating cue, and a large
product rail. This is a strong model for a catalog that will grow beyond a
single design drop.

The reference site also puts the commercial answers close to the product:
free shipping, a 30-day guarantee, secure checkout and a non-affiliation
notice are visible before the shopper reaches the footer. Its shipping policy
states a production window separately from transit time, and its print-tech
page explains durability, alignment and quality control. Those are the trust
questions a personalized apparel PDP must answer before an add-to-cart click.

## Implemented in Extra Time

- `src/lib/league-taxonomy.js` is the single source for league/team labels,
  stable slugs, matching helpers and canonical paths.
- Desktop header fallback now has a `LEAGUES` mega menu with league columns and
  popular-team links. Existing admin-configured menus still take precedence.
- `/league/:league` and `/team/:league/:team` are real storefront routes. They
  have breadcrumb navigation, a team switcher, product counts, related league
  links and shipping/trust messaging.
- Product pages now show breadcrumbs, a shipping/returns card, care guidance,
  and direct links back to their league/team hubs. These links are real
  internal navigation, not query-string filters.
- Product structured data emits variant-level `Offer` objects when variants
  are available, plus breadcrumb schema for products, collections and taxonomy
  hubs.
- The production SEO pass pre-renders every league and team hub from the same
  taxonomy module used by the runtime menu. The dynamic sitemap includes the
  same URLs so the crawl graph is consistent.
- Fallback and live catalog rows are matched using either flat or nested
  `league`/`team` fields. No product is forced into a team page merely because
  its copy contains a generic sport word; the matcher requires a league/team
  match or the corresponding slug in product metadata/copy.

## Catalog scale rules

1. Keep league and team hubs indexable only when they have useful copy or
   products. Do not create thousands of thin pages from arbitrary tags.
2. Keep query-string filters (`?color=`, `?sort=`) canonicalized to the parent
   collection; the clean league/team URL is the indexable entity.
3. Every published product should carry `taxonomy.league`,
   `taxonomy.team`, a product type and descriptive tags. The storefront can
   still display unclassified products in `/shop`, but they should not be
   promoted into SEO hubs automatically.
4. Use the admin menu/collection editor for merchandising order. The taxonomy
   module is navigation structure; it is not a substitute for inventory or
   pricing authority.

## PDP CRO checklist

- Above the fold: image, title, review signal, price, variant choice,
  personalization mode and a single add-to-bag action.
- Before the action: show made-to-order vs ready-to-ship, the delivery promise,
  free-shipping threshold and returns policy.
- After the action: keep the shopper inside the same league/team journey with
  related links and a product rail.
- Never imply official licensing. Keep the fan-inspired/non-affiliation notice
  adjacent to the legal/footer policy and product copy when team names are
  used.

## Next data work

Populate the catalog records with `taxonomy.league` and `taxonomy.team`, then
add real team-specific product imagery and review counts. The routes and SEO
shell are already ready; until those records exist, team hubs intentionally
show an honest empty state instead of fabricated products.
