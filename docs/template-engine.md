# Extra Time Template Engine

## Customer boundary

The storefront is a premium custom-order intake flow, not a general design tool. The customer selects a listing and supplies only the text fields that listing allows, plus an optional note. There is no customer-facing canvas, drag, resize, rotate, layer panel or free-form typography UI.

The legacy deterministic renderer still contains an internal \`C17\` photo slot for backwards-compatible template definitions, but the current customer form and Admin defaults do not expose image upload.

`src/data.js` defines the allowed `customFields` for every listing. `/custom?product=:id` renders only those fields and saves the selected listing ID, listing image, values, note and size with the cart request.

If the customer explicitly chooses **Edit with AI**, `/studio?product=:id` opens a separate prompt workspace. The server resolves the listing again instead of trusting a browser-supplied image URL, downloads the listing's exact main image and sends it as the only edit reference. Suggestions are derived from the same `customFields`; the prompt may also describe a larger new direction.

## Runtime contract

`src/template-engine.js` is the source of truth for the client preview and the Vercel render function:

```text
story template + customer values
        ↓
sanitize + validate
        ↓
city preset / palette derivation
        ↓
normalized slot renderer
        ↓
front + back artwork
```

Every template carries a version, artwork lock percentage, field list, palettes, fixed signature and normalized slot boxes. Normalized coordinates keep the composition stable at mobile preview size and production size.

The universal slots are internal engine IDs (C01–C17). The customer only sees friendly labels:

| Internal | Customer label | Source |
| --- | --- | --- |
| C01 / C02 | Your name / Your number | typed |
| C03 | Front number | derived from number |
| C04 | Crest initials | derived or template field |
| C05–C07 | Milestone one–three | typed, template-specific |
| C08 | Your mindset | curated select |
| C09–C11 | City / code / coordinates | city preset |
| C12–C13 | Accent / metal colour | curated swatches |
| C14 | Your year | typed |
| C15 | Neck symbol | curated select |
| C16 | Championship years | typed, template-specific |
| C17 | Optional photo | one fixed crop, optional upload |

## Current story systems

- **Venom** — fixed snake geometry, optional accent/metal, name, number and motto.
- **Hometown Hero** — city is a preset; code, coordinates, palette, icons and signature are derived automatically.
- **My Legacy** — city, year, three milestones and motto are placed into fixed safe boxes.
- **Underdog** — a tighter identity/mindset system with no city form.
- **The King** — crest initials and championship years inside a fixed gold/silver system.

## Rendering boundary

The current customer form does not render artwork. It records structured intent for review. The optional AI route returns a visual preview grounded in the listing image; it does not create a production print master.

The internal deterministic renderer remains available for approved template orders. `api/render-artwork.js` validates its payload, rebuilds front/back artwork at `3000 × 3600`, and returns PNGs. When Supabase server variables exist, it can upload masters to the `artwork` bucket and record a `render_jobs` row.

This separation is intentional:

- The deterministic engine owns text accuracy, geometry, safe zones and production files.
- The AI image edit is a customer direction and approval aid, never the source of truth for print artwork.

## Admin controls

The Template Builder remains an operator tool for locked layers, editable slots, artwork ratio and version notes. Admin can decide which fields a listing exposes, while the customer only sees the short request form.

## Supabase model

`supabase/schema.sql` includes:

- `pod_templates` — current published artwork definition.
- `pod_template_versions` — immutable historical definitions for reproducibility.
- `pod_city_presets` — derived city metadata.
- `pod_products` — catalog records linked to an artwork template.
- `pod_customization_orders` — customer payload plus preview/print URLs.
- `pod_render_jobs` — deterministic render state and output URLs.
- `pod_themes`, `pod_theme_versions`, `pod_pages` — storefront layout, tokens and versioned page definitions.
- `pod_menus`, `pod_menu_items` — header, footer and fixed-mobile navigation trees.
- `pod_collections`, `pod_collection_products` — curated product groups and ordering.
- `pod_product_options`, `pod_product_option_values`, `pod_product_variants` — size/color options, SKU price and inventory.

The `pod_*` namespace prevents Extra Time from colliding with generic commerce tables in a shared Supabase project.

The RLS policy keeps public reads limited to published products/live templates and reserves template/product/settings writes for users whose JWT has `app_metadata.role = 'admin'`.
