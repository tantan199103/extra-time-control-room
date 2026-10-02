import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeDesignerSpec } from '../api/customization-order.js'
import { stripBoombahBranding, VERIFIED_BOOMBAH_3D_PRODUCTS } from '../scripts/sync-boombah-designer-assets.mjs'
import { isBoombahBrandingName, isBoombahLogoPartName } from '../src/lib/boombah-branding.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = resolve(root, 'public')

test('Boombah designer catalog is mirrored and provider-scoped', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'designer/boombah/catalog.json'), 'utf8'))
  assert.equal(catalog.provider, 'boombah')
  assert.equal(catalog.storage.hotlinked, false)
  assert.ok(catalog.products.length >= 1)
  for (const product of catalog.products) {
    assert.match(product.manifest, /^\/designer\/boombah\/products\/[a-z0-9-]+\.json$/)
  }
})

test('verified 3D coverage includes all 21 product families exposed by the builder', () => {
  assert.equal(VERIFIED_BOOMBAH_3D_PRODUCTS.length, 21)
  for (const product of ['GLOVES3D','SOCKS3D','MENSPANTS3D','WOMENSPANTS3D']) {
    assert.equal(VERIFIED_BOOMBAH_3D_PRODUCTS.includes(product), true, `${product} is missing`)
  }
})

test('Boombah product manifests keep model, template and preview URLs internal', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'designer/boombah/catalog.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(resolve(publicRoot, catalog.products[0].manifest.slice(1)), 'utf8'))
  assert.equal(manifest.provider, 'boombah')
  assert.equal(manifest.storage.hotlinked, false)
  assert.ok(manifest.designs.length > 0)
  for (const design of manifest.designs.slice(0, 12)) {
    assert.match(design.model.uri, /supabase\.co\/storage\/v1\/object\/public\/product-media\/designer\/boombah\//)
    assert.match(design.template.uri, /supabase\.co\/storage\/v1\/object\/public\/product-media\/designer\/boombah\//)
    if (design.preview) assert.match(design.preview.uri, /supabase\.co\/storage\/v1\/object\/public\/product-media\/designer\/boombah\//)
  }
})

test('Boombah template cleaner hides production layers and removes the vendor color zone', () => {
  const input = Buffer.from(`<svg><defs><linearGradient id="brand-gradient"><stop stop-color="#445566"/></linearGradient></defs><g id="production_colors"><text>Boombah guide</text></g><g id="guides"><path fill="#111111"/></g><g id="paramcolors"><rect id="paramcolor-C1" fill="#112233"/><rect id="paramcolor-C2" fill="#445566"/></g><g id="vendor-logo"><path fill="#101010"/></g><g id="Jock_Tag_B_3_"><path fill="#565252"/></g><g id="art"><path fill="#112233"/><path fill="#445566"/><path fill="url(#brand-gradient)"/><image id="woven-logo" href="data:image/png;base64,AAAA"/></g><g id="artwork_targets"><rect/></g></svg>`)
  const output = stripBoombahBranding(input, [
    { code:'C1', name:'Body color', editable:true },
    { code:'C2', name:'Vendor logo color', editable:false, removed:true }
  ]).toString('utf8')
  assert.match(output, /id="production_colors"[^>]*display:none/)
  assert.match(output, /id="guides"[^>]*display:none/)
  assert.match(output, /id="artwork_targets"[^>]*display:none/)
  assert.match(output, /<path fill="#112233"/)
  assert.match(output, /<path fill="none"/)
  assert.match(output, /id="vendor-logo"[^>]*display:none/)
  assert.match(output, /id="Jock_Tag_B_3_"[^>]*display:none/)
  assert.match(output, /id="woven-logo"[^>]*display:none/)
  assert.doesNotMatch(output, /<path fill="url\(#brand-gradient\)"/)
})

test('Boombah GLB branding matcher targets logo parts and vendor texture names without hiding garment cuts', () => {
  assert.equal(isBoombahLogoPartName('M0606500-tongue-logo'), true)
  assert.equal(isBoombahLogoPartName('outsole-logo-003.003'), true)
  assert.equal(isBoombahLogoPartName('Jock_Tag_B_3_'), true)
  assert.equal(isBoombahBrandingName('Boombah_woven_label'), true)
  assert.equal(isBoombahBrandingName('BoombahRoyalJPG'), true)
  assert.equal(isBoombahBrandingName('boombahBlack (1)'), true)
  assert.equal(isBoombahLogoPartName('Boombah cuello_3112'), false)
  assert.equal(isBoombahLogoPartName('FD-163W-main'), false)
})

test('listing-specific Tripo jersey opens on the photographed front without duplicate default layers', async () => {
  const manifest = JSON.parse(await readFile(resolve(publicRoot, 'designer/boombah/products/amon-ra-st-brown-rivalries.json'), 'utf8'))
  const design = manifest.designs.find(item => item.id === 'retail-amon-ra-st-brown-rivalries')
  assert.equal(manifest.source?.listingId, 'listing-fe628fbfa3f1ba174fe9')
  assert.equal(design.model.source, 'tripo')
  assert.equal(design.model.texturePolicy, 'baked')
  assert.equal(design.model.defaultRotationY, Math.PI / 2)
  assert.deepEqual(design.model.inputViews, ['front', 'left', 'back', 'right'])
})

test('designer never renders upstream Boombah raster previews with vendor marks', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /function designerPreviewUrl\(uri, manifest\)/)
  assert.match(source, /manifestIsBoombah\(manifest\).*garment-\[/s)
  assert.match(source, /\^https\?:/)
  assert.match(source, /designerPreviewUrl\(item\.preview, manifest\)/)
  assert.match(source, /designer-design-grid__placeholder/)
  const patterns = source.slice(source.indexOf('function PatternPanel'), source.indexOf('function PatternPanel') + 8500)
  assert.match(patterns, /designerPreviewUrl\(item\.preview, manifest\)/)
  assert.doesNotMatch(patterns, /src=\{assetUrl\(item\.preview, manifest\)\}/)
})

test('GLB cleanup inspects image and source metadata, while preserving baked atlases', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /texture\?\.image\?\.name/)
  assert.match(source, /texture\?\.source\?\.data\?\.name/)
  assert.match(source, /neutralizeVendorTextures: !manifestUsesBakedGlb\(manifest\)/)
  assert.match(source, /A baked listing texture can contain the complete approved garment/)
})

test('mirrored Boombah manifests retain an explicit branding-cleanup contract', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'designer/boombah/catalog.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(resolve(publicRoot, catalog.products.find(item => item.id === 'SHOES3D').manifest.slice(1)), 'utf8'))
  assert.equal(manifest.branding.removed.includes('Boombah'), true)
  assert.equal(manifest.storage.hotlinked, false)
  assert.ok(manifest.designs.some(design => design.modelId && design.model?.uri && design.template?.uri))
})

test('designer order normalization accepts mirrored Boombah provider without allowing arbitrary manifests', () => {
  const spec = normalizeDesignerSpec({
    source:'JERSEVO_3D_DESIGNER',
    version:2,
    provider:'boombah',
    manifest:'/designer/boombah/products/fastpitch3d.json',
    productId:'FASTPITCH3D',
    model:'FD-163W',
    styleCode:'SS',
    garment:'FD-FAST-SS-1000',
    designSlug:'fastpitch3d-top-fd-fast-ss-1000',
    colors:{ C1:'#111311' },
    text:{ team:'JERSEVO', name:'RIDER', number:'90' },
    roster:[{ name:'RIDER', number:'90', size:'M' }]
  })
  assert.equal(spec.provider, 'boombah')
  assert.equal(spec.manifest, '/designer/boombah/products/fastpitch3d.json')
  assert.equal(spec.productId, 'FASTPITCH3D')
  assert.equal(normalizeDesignerSpec({ ...spec, manifest:'https://evil.example/manifest.json' }).manifest, '/designer/boombah/products/fastpitch3d.json')
})
