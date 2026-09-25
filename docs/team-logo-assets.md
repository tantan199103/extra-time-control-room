# Team logo assets

The curated league/team navigation uses local assets under
`public/assets/leagues/marks/teams/<league>/<team>.webp`. The storefront never
requests a team mark from a remote CDN at render time.

## Current audit

`npm run audit:team-assets` checks every team in `LEAGUE_TAXONOMY`, decodes each
file with `sharp`, and fails if an asset is missing, invalid, or mapped as a
fallback. `--write` also refreshes `docs/team-logo-audit.json`.

The current audit covers 211 curated teams. NBA, NHL and the nine previously
missing MLS marks were fetched from the ESPN public teams feed and CDN, cleaned
of source metadata, and converted to transparent WebP. Provenance is recorded
in `public/assets/leagues/marks/team-sources.json`.

The older 151 assets were already present before this provenance manifest was
introduced; the audit reports them as `unrecordedSources` so they can be
rights-reviewed separately rather than being given a fabricated source.

To refresh only missing files:

```sh
npm run fetch:team-logos
npm run audit:team-assets
```

`npm run fetch:team-logos -- --force` is intentionally explicit because it
replaces local files with the current provider artwork.

## Rights and brand safety

The ESPN feed/CDN is a source of current artwork, not a commercial license.
Team and league marks are third-party trademarks. The manifest records this
provenance and a rights reminder; the operator must confirm the applicable
league/team permissions before using marks on merchandise or making affiliation
claims. The site copy continues to identify Jersevo as an independent fanwear
studio.
