# Collection cover audit

Snapshot taken **2026-09-25** from the live catalogue used by the storefront.
This is an inventory, not an instruction to generate artwork. Collections listed
below intentionally remain without a cover until an operator supplies an image
through **Admin → Collections**.
No new AI-generated collection cover was created or assigned in this change.

## Live totals

- 64 collections in Supabase.
- 63 collections are `PUBLISHED` and 1 (`archive`) is `DRAFT`.
- 29,101 collection membership links.
- 12,479 products.
- The public `/collections` directory only includes collections with at least
  one `PUBLISHED` listing. Draft/archived listings do not inflate the count.

## Collections without a cover

| Collection | Handle | Published listings |
| --- | --- | ---: |
| Accessories | `accessories` | 3,853 |
| Basketball Jerseys | `basketball-jersey` | 321 |
| Collectibles | `collectibles` | 970 |
| Fan Gear | `fan-gear` | 2,214 |
| Football Jersey | `football-jersey` | 588 |
| Hockey Jerseys | `hockey-jersey` | 144 |
| NASCAR | `nascar` | 15 |
| NBA | `nba` | 2,209 |
| NCAA | `ncaa` | 137 |
| NHL | `nhl` | 1,743 |
| Soccer | `soccer` | 188 |
| WWE | `wwe` | 125 |

The storefront now shows a neutral **Cover pending** tile for these records. It
does not borrow `/assets/hero-tunnel.webp`, a product image, or another
collection's artwork. A broken cover URL also falls back to the same tile. This
keeps a missing asset visible in the audit instead of presenting a misleading
image.

## Operator workflow

1. Open **Admin → Collections**.
2. Select a collection marked **NO COVER**.
3. Upload a JPG, PNG, or WebP (maximum 8 MB), or enter a verified image URL.
4. Save changes and confirm the collection remains `PUBLISHED` if it should be
   visible publicly.

Deleting a collection detaches its membership links; it never deletes the
listings themselves. Empty collections remain addressable by a direct admin
route but are omitted from the public collection directory.

## NHL league mark

The missing league mark is now available at
`/assets/leagues/marks/nhl.webp` and is selected by `src/lib/league-media.js`.
It is a 320 × 320 WebP derived from the ESPN CDN source recorded in
`public/assets/leagues/marks/league-sources.json`. The provenance file includes
the trademark notice; verify NHL/league permissions before using the mark in a
commercial campaign.
