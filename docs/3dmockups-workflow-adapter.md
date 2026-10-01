# 3DMockups reference → Jersevo Custom Lab

This document records the implementation boundary for the 3DMockups research
and the Jersevo-native adapter. It is deliberately a workflow comparison, not
an authorization to copy a third-party asset library.

## What the public product does

The public site presents a browser editor built around a real 3D garment, an
artwork drop/upload step, an editable catalogue grouped by T-Shirts, Hoodies,
Jerseys, Bottoms and Accessories, and a publish/fulfillment path. The homepage
describes “pick a garment → customize on the 3D model → launch a shop →
produce and ship on demand”; the catalog exposes product category, size, print
coverage and starting-price information.
The live catalog currently exposes 18 reference products.

Sources reviewed:

- https://www.3dmockups.app/
- https://www.3dmockups.app/catalog
- https://www.3dmockups.app/how-it-works
- https://www.3dmockups.app/pricing
- https://www.3dmockups.app/termsofservice

## What is implemented in Jersevo

Jersevo keeps one catalogue and one editor route:

1. `/custom` lists the available Owayo and Boombah families.
2. `/custom/design` loads the exact provider/product manifest.
3. The existing Design, Colors, Patterns, Text and Logos tabs remain the
   source of truth for a garment.
4. The new Artwork tab adds bounded, customer-owned image layers without
   creating a second editor.
5. Artwork and logos use the same print-area picker, drag pad, scale and
   rotation controls and the same UV compositor used by the existing text
   layers.
6. The stage offers lightweight scene presets and PNG/design-JSON export for
   review. These are mockup exports, not production-ready print files.

The shared contract is `src/lib/mockup-workflow.js`. It defines supported
asset kinds, print areas, material/scene/export presets, provenance fields and
validation helpers. `public/designer/3dmockups/catalog.json` is a metadata-only
adapter for those 18 public entries. Seven entries currently map to Jersevo
models: tees use the local Owayo T-Shirt Basic family; baseball, football and
basketball use local Boombah teamwear families; socks use the local Boombah
sock family. The remaining 11 entries are reference-only until an approved
Jersevo model is available. A reference-only card cannot open a different
garment by accident.

## Asset and rights boundary

The 3DMockups Terms state that its software, 3D models, templates, branding and
materials belong to 3DMockups or its licensors, and prohibit reverse
engineering or redistribution of protected components. Consequently, the
adapter does **not** download or package their GLB files, textures, templates,
scene files or brand artwork. `scripts/sync-3dmockups-catalog.mjs` imports only
public metadata and records `licenseStatus: "metadata-only"` plus the source
policy. A future licensed import must provide an explicit owner/license
manifest before a model can enter `public/designer/`. Preview policy is
enforced in the normalizer: only a local `/designer/` path or a Jersevo
Supabase storage URL can be written into the public snapshot. A third-party
preview URL is dropped even if it appears in a future source payload.

Customer Artwork uploads are separate private references. The server:

- accepts PNG/JPG/WebP/SVG within the bounded size limit;
- rasterizes/normalizes artwork to WebP (logos remain normalized PNG);
- removes EXIF/XMP/private metadata while preserving provenance boxes supported
  by the existing privacy sanitizer;
- stores the file under the customer session prefix; and
- verifies the layer kind, print area and consent again when the order is
  created.

## Operational flow

```text
catalogue card
  → exact local manifest
  → 3D stage + colour/pattern controls
  → text/logo/artwork layers
  → local draft save
  → private artwork upload + checksum/storage reference
  → server validation of provider, manifest and asset refs
  → customization order / cart line
```

No publish transition is added by this adapter. A listing must still pass the
existing Jersevo publication, inventory, SEO and rights gates before it is
commercially visible.

## Maintenance commands

```powershell
npm run sync:3dmockups:catalog
npm test
$env:POSTBUILD_ALLOW_PARTIAL='true'; npm run build
```
The full production build can additionally generate the live SEO snapshot; the
partial flag is useful for a fast UI-only verification when the remote catalogue
is slow.
