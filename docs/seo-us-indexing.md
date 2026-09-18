# SEO and US indexing plan

## Audit finding

The storefront is a Vite SPA. Before this change, the HTTP response for every route was the same small app shell: product titles, descriptions, links and Product JSON-LD appeared only after JavaScript fetched Supabase data. Google can render JavaScript, but it crawls first, renders later, and server/static rendering is faster and more reliable for crawlers and users. The old robots/sitemap URLs also pointed at the Vercel project hostname instead of the canonical `www.jersevo.com` host.

## Implemented

- `npm run build` now runs `scripts/generate-seo-pages.mjs` after Vite. It queries published Supabase products during the Vercel build and writes initial HTML for `/product/:handle`, `/shop`, published collections and public policy pages. If the build environment cannot reach Supabase, it uses the six safe fallback products so the build still has useful crawlable pages.
- Product HTML contains an actual heading/description fallback, a self-referencing canonical URL, `en-US`/`x-default` alternates, Open Graph/Twitter metadata, Product + Offer JSON-LD and BreadcrumbList JSON-LD. React hydrates over the fallback when the browser loads.
- The site shell contains Organization and WebSite JSON-LD, US area served, USD currency, `en-US` language, a large-image robots policy and canonical production metadata.
- `robots.txt` and the dynamic sitemap now use `https://www.jersevo.com`. The sitemap includes only the public routes plus published products/collections and is marked `X-Robots-Tag: noindex`.
- Admin, account, studio and custom-tool routes receive `X-Robots-Tag: noindex, nofollow`; unresolved product/collection routes are also marked `noindex` by the client metadata layer.
- Product metadata is kept aligned with visible product name, price, stock and rating values. Do not add invented reviews, brand claims, materials or shipping promises.
- The prerender is a build-time snapshot. After publishing or materially editing a product, redeploy (or later add a Supabase-to-Vercel rebuild hook) so the initial HTML/schema and sitemap stay aligned; the browser storefront still reads the live catalogue between deploys.

## US targeting

This version signals the intended market with `lang="en-US"`, `og:locale=en_US`, USD pricing, `areaServed=United States`, US-focused descriptions and the canonical production host. This is a relevance signal, not a guarantee that Google will show every page only in the US. If UK/EU pages are later created, give them separate URLs and reciprocal `hreflang` clusters; do not use a US canonical for materially different regional pages.

## Search and Shopping launch checklist

1. In Google Search Console, verify the Domain property for `jersevo.com` and submit `https://www.jersevo.com/sitemap.xml`.
2. Use URL Inspection on `/`, `/shop` and three published `/product/:handle` URLs. Confirm that the rendered HTML contains the product heading, canonical `www` URL, Product JSON-LD and crawlable WebP images.
3. Run Google's Rich Results Test against product URLs. Fix any price/availability mismatch before requesting indexing.
4. Request indexing for the home, shop and top product URLs after the first production deploy. Search Console status is the source of truth; a sitemap submission does not guarantee immediate indexing.
5. When server-side checkout, stock reservation and verified payment webhooks are live, create a Google Merchant Center product feed and connect it to the same canonical product URLs. Until then, Product markup can help understanding/snippets, but Merchant listing eligibility and purchase availability must not be claimed.

## Content work that still affects ranking

- Replace generic fallback copy with one genuinely useful US-facing story per published product: material, fit, personalization limits, production window, returns and shipping scope must be factual.
- Keep title tags roughly 50–60 characters where possible, descriptions around 150–160 characters, one clear H1 and crawlable internal links from `/shop` to every published product.
- Add real organization contact/support details before checkout launch. Do not publish an address, phone number, review count or policy claim that is not real and operational.
- Monitor Search Console coverage, Core Web Vitals and image indexing. The initial storefront JavaScript remains about 599 KB minified; route HTML is now crawlable, but code-splitting the storefront is the next performance improvement.
