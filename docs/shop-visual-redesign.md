# Shop visual redesign — 25/09/2026

The three supplied images are layout/style references, not source artwork to copy. The desktop references call for a bold left-aligned headline, sports collage, photographic sport rail, product packshots, team tiles and two campaign banners. The mobile reference compresses the same hierarchy into two-column cards and a strong search action.

## Design direction

- Palette: Paper #F7F7F6, White #FFFFFF, Ink #111111, Athletic Red #E52A32, Slate #626262, Line #DEDEDE.
- Type: Barlow Condensed for display/category names; Manrope for descriptions, controls and trust copy.
- Desktop sequence: hero headline/search beside collage → six sport cards → product packshots → eight team tiles and search → two campaign banners → quick routes → live catalog.
- Mobile sequence: hero → search → two-column sport cards → two-column product cards → two-column team tiles → stacked banners → live catalog.

The one expressive element is the campaign imagery. Controls and cards remain clean and quiet. Empty categories are not fabricated. Every team in the curated taxonomy now uses a checked-in, metadata-stripped local mark; an original Jersevo monogram remains only as a safe fallback for an uncatalogued team.

## Generated asset prompts and outputs

All bitmap artwork was created with built-in ImageGen, then mechanically encoded to WebP with Sharp. The creative prompt set was:

1. Shop hero: wide original photorealistic football/basketball/baseball editorial collage on the right, near-white copy space on the left, restrained red and charcoal, no text, logos or identifiable athletes. Output: public/assets/shop/shop-hero-v2.webp.
2. Sport photography: one exact 3-by-2 six-panel sprite containing anonymous football, baseball, basketball, hockey, soccer and college-football athletes; dark lower thirds for HTML labels; no text or marks. Outputs: public/assets/shop/sport-{nfl,mlb,nba,nhl,mls,ncaa}-v2.webp.
3. Category packshots: one exact 4-by-2 product sprite containing cap, football jersey, baseball jersey, knit hat, hoodie, blank custom jersey, duffel and tumbler/gift box; background-only follow-up edit changed dark gray to warm white. Outputs: public/assets/shop/category-{caps,football-jerseys,baseball-jerseys,knit-hats,fan-apparel,custom-jerseys,accessories,collectibles}-v2.webp.
4. Campaign banners: separate wide dark editorial still lifes, one of blank customizable jerseys with red strokes and one of generic headwear/apparel/accessories with blue/charcoal texture; left half left clear for HTML. Outputs: public/assets/shop/shop-custom-banner-v2.webp and public/assets/shop/shop-fan-gear-banner-v2.webp.

The two source sprite WebPs remain under public/assets/shop/ for future category additions, but the page references the smaller per-card crops. Initial Shop load preloads only the 153 KB hero; sport, product, team and banner images are lazy-loaded.

## SEO and catalog behavior

The Shop page has one H1 and links to the canonical /sports, /teams, /category/*, /league/* and /team/* routes. The product grid still uses fresh published Supabase data. Filter combinations remain query-string routes and are blocked from indexing. Curated team marks are bundled local WebP assets with provenance recorded in `public/assets/leagues/marks/team-sources.json`; fallback monograms are original UI code for future uncatalogued teams. The generated images contain no text, brand or team logos, so titles/links remain accessible HTML and can be changed independently.
