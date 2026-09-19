# Fangear catalogue import

The importer in `scripts/import-fangear-catalog.mjs` copies the public WooCommerce catalogue into the listing-owned product model. It is intentionally conservative:

- every product and collection is saved as `DRAFT`;
- artwork is locked at 70%;
- product IDs are stable hashes of the source IDs, so a rerun is idempotent;
- league, team and apparel categories are stored separately in `taxonomy` and tags;
- options and variation rows are mapped into `pod_product_options` / `pod_product_variants`;
- source HTML is reduced to semantic content and source URLs, wrappers, scripts, editor artefacts, brand references and AI/provider references are removed from public fields;
- images are privacy-sanitized, uploaded to the `product-media` bucket and rewritten to project URLs; source-hosted image URLs never become customer-facing media URLs;
- source provenance is kept only in the private `pod_catalog_imports` audit table.

## 1. Dry run

Set the permission acknowledgement in the shell that runs the importer:

```powershell
$env:FANGEAR_SOURCE_AUTHORIZED = 'true'
npm run import:fangear -- --dry-run --limit 25
```

The default is read-only. A report is written to `artifacts/fangear-import-report.json` (ignored by Git) and includes unmapped categories, variation failures, personalization inference and media counts.

## 2. Prepare the trusted write path

Apply the migrations in order through the Supabase SQL editor, including:

```text
supabase/migrations/20260921_fangear_import.sql
```

That migration allows the server-only `service_role` JWT to use the existing audited listing/collection RPCs and creates the private import audit table. It does not grant browser or anonymous write access.

Configure these variables only in the server shell/CI secret store. Never put them in `VITE_*` variables or commit them:

```text
FANGEAR_SOURCE_AUTHORIZED=true
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only key>
```

## 3. Import drafts

```powershell
$env:FANGEAR_SOURCE_AUTHORIZED = 'true'
$env:SUPABASE_URL = 'https://<project>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<server-only key>'
npm run import:fangear -- --write --media
```

Use `--limit N` for a pilot. Media downloads can be disabled for a controlled metadata pilot with `FANGEAR_IMPORT_MEDIA=false`; products remain drafts and can be reviewed in Admin before publishing. The importer never publishes a source item automatically.

## What still requires Admin review

The source API does not reliably expose customer-editable intent for every listing. The importer only adds `Name`, `Number`, `Team / city`, `Year`, `Colour` and `Photo` when the source copy contains an explicit signal. Review inferred fields, stock quantities, licensing/compliance copy, SEO wording and image suitability before publishing. Source copy must not be changed into an “official”, “licensed” or “authentic” claim unless the business has verified that claim independently.
