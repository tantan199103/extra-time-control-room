# Listing editorial media and Product Story

Each saved listing can now produce a controlled editorial asset set from its
primary image. The admin workspace exposes five model views and one custom
guide:

- front model;
- back model;
- street model;
- close detail;
- matchday model;
- custom-field guide.

The generator always sends the listing's primary image as the only garment
reference. It does not create new SKUs, variants or customer-editable artwork.
Generated images are stored in the existing `product-media` bucket with a
stable `role`, then remain a draft change until the admin saves the listing.
Image privacy metadata is stripped before storage; provider URLs and prompts
are not written into public product media.

## Product Story SEO brief

The AI writer accepts explicit editorial inputs for:

- one primary keyword;
- comma-separated secondary keywords;
- verified customer value points;
- verified design differences;
- search intent and creative direction.

The returned draft includes title, subtitle, long description, SEO title and
description, keyword cluster, tags, value points, differentiators and optional
image content blocks. Image blocks can reference only the controlled media
roles above. The admin must review and apply the draft before saving or
publishing.

The writer is instructed to remove source URLs, provider references and
unverified claims. It must not invent teams, players, sponsors, materials,
licensing, shipping promises or reviews.

## Server settings

The listing-copy and editorial-media handlers are deployed as bounded Vercel
serverless functions. They need the following server-only values in the
production Vercel environment (the browser never receives them):

```text
AI_IMAGE_API_URL=https://api.apikey.fan/v1/images/edits
AI_IMAGE_API_KEY=...
AI_IMAGE_MODEL=gpt-image-2
AI_TEXT_API_URL=https://api.apikey.fan/v1
AI_TEXT_API_KEY=...
AI_TEXT_MODEL=gpt-4.1-mini
SUPABASE_SERVICE_ROLE_KEY=...
```

Never prefix these secrets with `VITE_`. The browser only sends an authenticated
admin token to `/api/ai-listing-media` and `/api/ai-listing-copy`. These routes
now run on Cloud Run so multimodal requests use the 300-second Node budget;
keep `AI_TEXT_API_KEY` and `AI_IMAGE_API_KEY` mounted through Secret Manager.

## Operating sequence

1. Save the listing once so it has a persisted ID and a primary image.
2. Open **Media → Controlled image generation**.
3. Generate the five model views and the custom guide separately; retry only
   missing or weak frames.
4. Add accurate alt text and remove any frame that does not match the real
   garment.
5. Open **Story & SEO**, enter verified keywords/value points, generate a
   draft, review it, then apply and save.
6. Set the SEO gate to `INDEXABLE` only after the landing page, media and
   product facts are checked.

The API route is included in the Vercel/Cloud Run hybrid routing. Cloud Run
must be rebuilt when its server image is the active backend; the Vercel build
already contains the browser UI and route contract.
