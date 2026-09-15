# Extra Time Template Engine

## Why this model

The storefront is a premium product configurator, not a general design tool. A customer chooses a story system and supplies a small amount of meaning; the designer keeps control of the visual signature. This is why there is no drag, resize, rotate or free-form typography UI.

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

The browser uses an SVG data URL for an instant preview. The order payload contains `templateId`, `templateVersion`, values, derived city data and the requested output dimensions. `api/render-artwork.js` validates that payload, rebuilds front/back artwork at `3000 × 3600`, and returns PNGs. When Supabase server variables exist, it also uploads the two masters to the `artwork` bucket and records a `render_jobs` row.

This separation is intentional:

- The deterministic engine owns text accuracy, geometry, safe zones and production files.
- A future AI mockup service may use the master artwork to create model/lifestyle images, but it must never be the source of truth for print artwork.

## Admin controls

The Template Builder exposes the same contract to the operator: locked layers, editable slots, artwork ratio, version note and preview in the customer lab. A future JSON editor can write the `definition` JSONB column in `templates` and append an immutable row to `template_versions` before publishing.

## Supabase model

`supabase/schema.sql` includes:

- `templates` — current published definition.
- `template_versions` — immutable historical definitions for reproducibility.
- `city_presets` — derived city metadata.
- `products` — catalog records linked to a template.
- `customization_orders` — customer payload plus preview/print URLs.
- `render_jobs` — deterministic render state and output URLs.

The RLS policy keeps public reads limited to published products/live templates and reserves template/product/settings writes for users whose JWT has `app_metadata.role = 'admin'`.
