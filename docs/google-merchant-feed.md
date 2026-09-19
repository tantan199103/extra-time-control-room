# Google Merchant Center feed

The store exposes one normalized, read-only product source at:

```text
https://www.jersevo.com/api/google-merchant-feed
```

Use the XML URL as the scheduled primary data source in Merchant Center. A
tab-delimited version is available at `?format=tsv` for inspection or a Google
Sheets import. `?format=json` returns a diagnostics summary and never returns
product copy or media URLs.

## What enters the feed

The feed is deliberately narrower than the catalogue. A row is created for
each active product variant only when its parent listing is `PUBLISHED` and
`seo_status = INDEXABLE`. Draft, archived, blocked and unpublished rows are
never sent. The product page link includes `?variant=<stable-variant-id>` so
the landing page opens the same size/color offer that Google crawled.

Every row is normalized to the US apparel attributes:

- stable `id` and shared `item_group_id` for variants;
- title, factual description, canonical link, primary image and additional
  image links;
- `availability`, `price`, optional `sale_price`, USD currency and `condition`;
- store brand, GTIN when a valid manufacturer-issued value is present, and
  MPN/`identifier_exists` handling for custom products;
- `color`, `size`, `gender`, `age_group`, `size_system`, product type and
  Google product category;
- `is_bundle = yes` when the listing exposes customer personalization;
- five catalogue `custom_label_*` values for league, team, group,
  customization and stock state.

Customer-entered name, number, city, year, color note or photo fields do not
become product variants or separate feed rows. They remain fulfillment data.

## Identifier policy

The mapper never invents a GTIN. It validates a supplied barcode checksum and
omits invalid values with a diagnostic warning. For a store-brand/custom item,
the customer-facing Extra Time store brand and stable variant SKU are used as the MPN only when the item
is treated as a private-label product; otherwise leave the MPN override blank
and set the identifier policy in the listing review. `identifier_exists=no` is
reserved for products where the team is certain no assigned GTIN/MPN exists.

Google's current guidance for custom goods supports `identifier_exists=no`
when no unique identifier exists, requires apparel `color`, `size`, `gender`
and `age_group`, and requires one shared `item_group_id` for size/color
variants. See the official [product data specification](https://support.google.com/merchants/answer/14779112),
[identifier guidance](https://support.google.com/merchants/answer/6324478),
and [variant grouping guidance](https://support.google.com/merchants/answer/6324507).

## Review before scheduling

Run the local/production audit after a deployment:

```powershell
npm run audit:gmc -- https://www.jersevo.com/api/google-merchant-feed
```

The command fails when the XML cannot be read, when the reported item count
does not match the XML, or when the report contains rejected rows. Warnings
such as an inferred color or age group are intentionally visible so the admin
can add a factual override before submitting the source.

Before enabling the source in Merchant Center, verify:

1. The primary image is a real product/mockup image without promotional
   overlays or watermarks, and it matches the color in the feed.
2. The price, sale price, stock state and variant selection on the landing page
   match the feed and checkout.
3. Shipping and returns are configured in Merchant Center and match the live
   `/shipping` and `/returns` policies. Shipping is not fabricated in this
   feed.
4. The listing contains no unverified “official”, “licensed” or “authentic”
   affiliation claim and no source/AI metadata.
5. Submit only the 32 controlled, indexable listings initially. Expand the
   SEO publish wave only after Search Console and Merchant Center diagnostics
   show clean landing pages.

The feed endpoint uses the server-only Supabase service key, applies a short
shared cache, and sends `X-Robots-Tag: noindex, nofollow`. No credentials are
embedded in the XML or browser bundle.
