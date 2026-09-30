import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { matchMirlTexture, parseMirl } from '../src/lib/mirl-loader.js'
import { STOREFRONT_STATIC_ROUTES } from '../src/lib/storefront-model.js'
import { normalizeDesignerSpec, validateDesignerAssetRefs } from '../api/customization-order.js'
import { brandColorIndices } from '../scripts/strip-owayo-branding.mjs'
import { normalizeOwayoLayer, normalizeOwayoLayers, normalizeOwayoLogo, normalizeOwayoPersonalization, normalizeOwayoRoster, normalizeOwayoSizeOptions, owayoBackTextLayout, owayoPlacementPartNames, owayoPlacementUvTransform, resolveOwayoPreviewText, resolveOwayoSizeValue, OWAYO_PRINT_AREA_GROUPS } from '../src/lib/owayo-personalization.js'
import { OWAYO_CATALOG_V1, owayoCatalogSummary } from '../src/lib/owayo-catalog.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = resolve(root, 'public')
const manifestPath = resolve(publicRoot, 'designer/owayo/cycling-c3/manifest.json')

test('synchronized Owayo garment assets are local, checksummed and complete for every staged design', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.product.model, '253m_KA')
  assert.equal(manifest.model.format, 'mirl-v1.1-uncompressed')
  assert.ok(manifest.designs.length >= 12)
  assert.ok(manifest.availableDesigns.length >= manifest.designs.length)
  for (const design of manifest.designs) {
    assert.match(design.preview, /^\/designer\/owayo\//)
    for (const part of ['Back','FrontLeftPart','FrontRightPart','LeftArm','RightArm']) {
      assert.match(design.textures[part], /^\/designer\/owayo\//, `${design.name} is missing ${part}`)
    }
  }
  for (const [url, expected] of Object.entries(manifest.checksums)) {
    assert.match(url, /^\/designer\/owayo\//)
    const buffer = await readFile(resolve(publicRoot, url.slice(1)))
    assert.equal(buffer.length, expected.bytes, `${url} byte count changed`)
    assert.equal(createHash('sha256').update(buffer).digest('hex'), expected.sha256, `${url} checksum changed`)
  }
})

test('Owayo pattern catalogue is mirrored locally with complete previews, textures and category links', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.ok(Array.isArray(manifest.patterns) && manifest.patterns.length >= 100)
  assert.ok(Array.isArray(manifest.patternCategories) && manifest.patternCategories.length >= 9)
  assert.equal(manifest.patternLibrary?.provider, 'owayo')
  assert.equal(manifest.patternLibrary?.total, manifest.patterns.length)
  const ids = new Set()
  const slugs = new Set()
  for (const pattern of manifest.patterns) {
    assert.match(String(pattern.id), /^\d+$/)
    assert.equal(ids.has(pattern.id), false, `duplicate pattern id ${pattern.id}`)
    assert.equal(slugs.has(pattern.slug), false, `duplicate pattern slug ${pattern.slug}`)
    ids.add(pattern.id)
    slugs.add(pattern.slug)
    assert.match(pattern.preview, /^\/designer\/owayo\/cycling-c3\/patterns\/[^/]+\.webp$/)
    assert.match(pattern.texture, /^\/designer\/owayo\/cycling-c3\/patterns\/[^/]+\.svg$/)
    assert.ok(pattern.categoryKeys?.length)
    assert.ok(pattern.colors?.length)
    for (const url of [pattern.preview, pattern.texture]) {
      const file = await readFile(resolve(publicRoot, url.slice(1)))
      const checksum = manifest.checksums?.[url]
      assert.ok(checksum, `missing checksum for ${url}`)
      assert.equal(file.length, checksum.bytes, `${url} byte count changed`)
      assert.equal(createHash('sha256').update(file).digest('hex'), checksum.sha256, `${url} checksum changed`)
    }
  }
  for (const category of manifest.patternCategories) {
    assert.ok(category.patternIds.length)
    assert.ok(category.patternIds.every(id => ids.has(String(id))))
  }
})

test('pattern UI and order handoff are wired to the local catalogue', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /id:'patterns'/)
  assert.match(source, /manifest\.patterns/)
  assert.match(source, /loadOwayoPatternTexture/)
  assert.match(source, /pattern:\s*state\.pattern\?\.slug/)
  assert.match(source, /Switch to Sportswear patterns/)
})

test('synchronized mask textures do not render Owayo vendor marks', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.branding?.removed, 'Owayo vendor marks from synchronized mask textures')
  const indices = brandColorIndices(manifest.product.colorCodes)
  assert.ok(indices.size >= 8)
  const textureUrls = new Set()
  for (const design of manifest.designs) {
    for (const url of Object.values(design.textures || {})) {
      if (String(url).toLowerCase().endsWith('.png')) textureUrls.add(url)
    }
  }
  const urls = [...textureUrls]
  for (let start = 0; start < urls.length; start += 8) {
    await Promise.all(urls.slice(start, start + 8).map(async url => {
      const decoded = await sharp(resolve(publicRoot, url.slice(1))).raw().toBuffer({ resolveWithObject:true })
      for (let offset = 0; offset < decoded.data.length; offset += decoded.info.channels) {
        assert.equal(indices.has(decoded.data[offset]), false, `${url} still contains a vendor mark index`)
      }
    }))
  }
})

test('MIRL parser produces centered render geometry and resolves synchronized part textures', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const binary = await readFile(resolve(publicRoot, manifest.model.uri.slice(1)))
  const model = parseMirl(binary)
  assert.equal(model.version, 'v1.1')
  assert.ok(model.parts.length >= 10)
  assert.ok(model.dimensions.every(value => value > 0))
  assert.ok(model.parts.every(part => part.positions.length === part.faceCount * 9))
  const design = manifest.designs[0]
  const printable = model.parts.filter(part => /back|front|arm|collar|bag/i.test(part.name))
  assert.ok(printable.every(part => matchMirlTexture(part.name, design.textures)), 'every printable mesh needs a local texture')
})

test('the 3D builder has a public lazy route and a generated SEO fallback', async () => {
  const [main, generator] = await Promise.all([
    readFile(resolve(root, 'src/main.jsx'), 'utf8'),
    readFile(resolve(root, 'scripts/generate-seo-pages.mjs'), 'utf8')
  ])
  assert.equal(STOREFRONT_STATIC_ROUTES.has('/custom/design'), true)
  assert.match(main, /lazy\(\(\) => import\('\.\/CustomDesignerPage'\)\)/)
  assert.match(main, /path === '\/custom\/design'/)
  assert.match(main, /const customRoute = path === '\/custom' \|\| path === '\/custom\/design'/)
  assert.match(generator, /writePage\('\/custom\/design'/)
  assert.match(generator, /'@type':'WebApplication'/)
})

test('3D design handoff is bounded and keeps the production roster server-side', () => {
  const spec = normalizeDesignerSpec({
    source:'JERSEVO_3D_DESIGNER',
    model:'253m_KA',
    designSlug:'etape',
    designName:'Etape',
    colors:{ A:'#111311', B:'#F3ED45' },
    text:{ team:'JERSEVO', name:'RIDER', number:'90', scale:1, color:'#F8F8F4' },
    logo:{ name:'crest.png', x:4, y:-4, scale:4, rotation:400, placement:'right-sleeve' },
    version:3,
    layers:[
      { id:'name-back', kind:'name', placement:'back-upper', x:-4, scale:9 },
      { id:'number-back', kind:'number', placement:'back-center', rotation:90 },
      { id:'crest-chest', kind:'logo', placement:'front-left-chest', assetIndex:1 }
    ],
    roster:Array.from({ length:120 }, (_, index) => ({ name:`Player ${index}`, number:`${index}x`, size:'M' }))
  })
  assert.equal(spec.source, 'JERSEVO_3D_DESIGNER')
  assert.equal(spec.roster.length, 99)
  assert.equal(spec.logo.x, 1)
  assert.equal(spec.logo.rotation, 180)
  assert.equal(spec.logo.placement, 'right-sleeve')
  assert.equal(spec.version, 3)
  assert.deepEqual(spec.layers.map(layer => layer.kind), ['name','number','logo'])
  assert.equal(spec.layers[0].x, -1)
  assert.equal(spec.layers[0].scale, 1.8)
  assert.equal(spec.layers[2].assetIndex, 1)
  assert.equal(spec.roster[0].number, '0')
  assert.equal(spec.manifest, '/designer/owayo/cycling-c3/manifest.json')
  assert.throws(() => normalizeDesignerSpec({ source:'external' }), /not supported/)
  assert.throws(() => normalizeDesignerSpec({ ...spec, layers:Array.from({ length:9 }, (_, index) => ({ id:`logo-${index}`, kind:'logo', assetIndex:index })) }), /up to eight logo layers/)
  assert.throws(() => normalizeDesignerSpec({ ...spec, layers:[{ id:'logo-a', kind:'logo', assetIndex:0 }, { id:'logo-b', kind:'logo', assetIndex:0 }] }), /distinct uploaded asset/)
  const securedSpec = { ...spec, layers:spec.layers.map(layer => layer.kind === 'logo' ? { ...layer, assetIndex:0 } : layer) }
  assert.equal(validateDesignerAssetRefs(securedSpec, [{ bucket:'customer-references' }]).length, 1)
  assert.throws(() => validateDesignerAssetRefs(spec, [{ bucket:'customer-references' }]), /Every 3D logo layer/)
  assert.throws(() => validateDesignerAssetRefs({ ...spec, layers:[] }, [{ bucket:'customer-references' }]), /not attached/)
  assert.throws(() => validateDesignerAssetRefs(securedSpec, [{}, {}]), /Every uploaded 3D logo asset/)
})

test('Owayo personalization preview is deterministic and roster-backed', () => {
  const roster = [{ name:'  Ada Lovelace  ', number:'9x0', size:'M' }]
  const preview = resolveOwayoPreviewText({ team:'JERSEVO', name:'Draft', number:'12' }, roster)
  assert.deepEqual(preview, { team:'JERSEVO', name:'Ada Lovelace', number:'90' })
  const normalized = normalizeOwayoPersonalization({ ...preview, font:'not-allowed', rotation:99, outlineWidth:99 }, roster)
  assert.equal(normalized.font, 'Barlow Condensed')
  assert.equal(normalized.rotation, 30)
  assert.equal(normalized.outlineWidth, 24)
  assert.equal(normalized.x, 0)
  assert.equal(normalized.y, 0)
  assert.equal(normalizeOwayoPersonalization({ x:4, y:-4, scale:4 }).x, 1)
  assert.equal(normalizeOwayoPersonalization({ x:4, y:-4, scale:4 }).y, -1)
  assert.equal(normalizeOwayoPersonalization({ x:4, y:-4, scale:4 }).scale, 1.8)
  assert.deepEqual(Object.keys(owayoBackTextLayout()), ['team','name','number'])
  assert.equal(normalizeOwayoPersonalization({ placement:'back' }).placement, 'back-center')
  assert.equal(normalizeOwayoPersonalization({ placement:'front' }).placement, 'front-center')
  assert.deepEqual(normalizeOwayoLogo({ name:' crest.svg ', placement:'unknown', x:9, scale:0 }), { name:'crest.svg', x:1, y:0, scale:.25, rotation:0, placement:'front-center' })
})

test('Owayo independent layers are bounded, typed and assigned unique IDs', () => {
  assert.deepEqual(normalizeOwayoLayer({ id:' crest ', kind:'logo', placement:'right-sleeve', x:9, y:-9, scale:8, rotation:900, assetIndex:99 }), {
    id:'crest', kind:'logo', placement:'right-sleeve', x:1, y:-1, scale:2, rotation:180, name:'', assetIndex:7
  })
  const layers = normalizeOwayoLayers([
    { id:'repeat', kind:'name', placement:'back-upper' },
    { id:'repeat', kind:'number', placement:'back-center' },
    { id:'mark', kind:'logo', placement:'front-left-chest', assetIndex:2 }
  ])
  assert.equal(layers.length, 3)
  assert.equal(new Set(layers.map(layer => layer.id)).size, 3)
  assert.deepEqual(layers.map(layer => layer.kind), ['name','number','logo'])
})

test('Owayo roster keeps display sizes and source variant codes aligned', () => {
  const sizes = [
    { name:'Choose your size', size:'Choose your size' },
    { name:'5 (M)', size:'5' },
    { name:'6 (M)', size:'6' },
    { name:'7 (L)', size:'7' }
  ]
  assert.deepEqual(normalizeOwayoSizeOptions(sizes), [
    { value:'5', label:'5 (M)' },
    { value:'6', label:'6 (M)' },
    { value:'7', label:'7 (L)' }
  ])
  assert.equal(resolveOwayoSizeValue('M', sizes), '5')
  assert.equal(resolveOwayoSizeValue('7 (L)', sizes), '7')
  assert.deepEqual(normalizeOwayoRoster([{ id:'p1', name:'Ada', number:'9x0', size:'M' }], sizes), [{ id:'p1', name:'Ada', number:'90', size:'5' }])
})

test('Owayo text panel exposes a real same-on-all contract', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /enablingSameText = patch\.sameOnAll === true/)
  assert.match(source, /current\.text\?\.sameOnAll/)
  assert.match(source, /syncText = Boolean\(current\.text\?\.sameOnAll/)
  assert.match(source, /normalizeOwayoRoster\(state\.roster, manifest\?\.product\?\.sizes/)
})

test('3D stage composites independent Owayo layers into garment UV shaders', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /personalizationMap/)
  assert.match(source, /personalizationEnabled/)
  assert.match(source, /buildOwayoLayerTextures\(text, normalizedLayers\)/)
  assert.match(source, /applyOwayoLayers\(runtime, textures\)/)
  assert.match(source, /layerTextures:new Map\(\)/)
})

test('Owayo logos and text layers bind to independent garment areas', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /uniform sampler2D logoMap/)
  assert.match(source, /owayoPlacementSurface\(layer\.placement\)/)
  assert.match(source, /owayoPlacementPartNames/)
  assert.match(source, /Print area/)
  assert.match(source, /Add name/)
  assert.match(source, /Add number/)
  assert.match(source, /Add logo/)
  assert.match(source, /migrateDesignerLayers/)
  assert.match(source, /productId:manifest\?\.product\?\.id \|\| state\.productId/)
  assert.deepEqual(owayoPlacementPartNames(['LeftArm', 'Keillinks'], 'left-sleeve'), ['LeftArm'])
  assert.deepEqual(owayoPlacementPartNames(['LeftCuff', 'LeftArm'], 'left-sleeve'), ['LeftArm'])
  assert.deepEqual(owayoPlacementPartNames(['Aermelbandlinks', 'Passelinks'], 'left-sleeve'), ['Aermelbandlinks'])
  assert.deepEqual(owayoPlacementPartNames(['FrontLeftPart', 'FrontRightPart'], 'front'), ['FrontLeftPart', 'FrontRightPart'])
  assert.deepEqual(owayoPlacementPartNames(['FrontLeftPart', 'FrontRightPart'], 'front-left-chest'), ['FrontLeftPart'])
  assert.deepEqual(owayoPlacementPartNames(['FrontLeftPart', 'FrontRightPart'], 'front-right-chest'), ['FrontRightPart'])
  assert.deepEqual(owayoPlacementPartNames(['Back1', 'Back2', 'Back3'], 'back'), ['Back1'])
})

test('Owayo print areas cover the torso, back and sleeves without duplicating center-front artwork', () => {
  assert.deepEqual(OWAYO_PRINT_AREA_GROUPS.map(group => group.label), ['Front', 'Back', 'Sleeves'])
  assert.equal(OWAYO_PRINT_AREA_GROUPS.flatMap(group => group.options).length, 9)
  const left = owayoPlacementUvTransform('FrontLeftPart', 'front-center', { minX:.08, maxX:.94 })
  const right = owayoPlacementUvTransform('FrontRightPart', 'front-center', { minX:.06, maxX:.92 })
  assert.ok(Math.abs((.08 * left.scaleX + left.offsetX) - .5) < .0001)
  assert.ok(Math.abs((.94 * left.scaleX + left.offsetX) - 1) < .0001)
  assert.ok(Math.abs((.06 * right.scaleX + right.offsetX) - 0) < .0001)
  assert.ok(Math.abs((.92 * right.scaleX + right.offsetX) - .5) < .0001)
  assert.deepEqual(owayoPlacementUvTransform('FrontLeftPart', 'front-left-chest', { minX:.08, maxX:.94 }), { scaleX:1, scaleY:1, offsetX:0, offsetY:0 })
})

test('placement editor exposes a drag pad for every selected text and logo layer', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /function PlacementPad\(/)
  assert.match(source, /Drag to position/)
  assert.match(source, /Arrow keys make fine adjustments/)
  assert.match(source, /<PlacementPad value=\{activeLayer\} onChange=\{setLayer\}/)
  assert.match(source, /<PlacementPad value=\{activeLayer\} onChange=\{patch => setLayer\(activeLayer\.id, patch\)\}/)
})

test('custom hub template rail uses complete 3D garment captures', async () => {
  const source = await readFile(resolve(root, 'src/main.jsx'), 'utf8')
  for (const slug of ['etape', 'velocity', 'attack', 'aero', 'fire']) {
    const file = resolve(publicRoot, `designer/owayo/cycling-c3/previews/garment-${slug}.webp`)
    const metadata = await sharp(file).metadata()
    assert.equal(metadata.width, 720, `${slug} preview width`)
    assert.equal(metadata.height, 960, `${slug} preview height`)
    assert.match(source, new RegExp(`garment-${slug}\\.webp`))
  }
  assert.match(source, /custom-template-track__placeholder/)
})

test('custom hub stays in a transparent preview and waitlist state until live commerce is verified', async () => {
  const source = await readFile(resolve(root, 'src/main.jsx'), 'utf8')
  assert.match(source, /source:'custom-3d-waitlist'/)
  assert.match(source, /PREVIEW IN 3D/)
  assert.match(source, /Checkout stays locked until a production listing, price, stock and hand-off have passed the publishing gate/)
  assert.match(source, /commerceVerified=\{!catalogState\.loading/)
  assert.match(source, /catalogState\.source === 'supabase'/)
  assert.match(source, /product\.status === 'PUBLISHED' && hasCustom3DDesigner\(product\)/)
  assert.doesNotMatch(source, /3D custom kits are paused/i)
})

test('Owayo family catalogue keeps unsupported cuts from masquerading as C3 assets', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'designer/owayo/catalog.json'), 'utf8'))
  assert.equal(catalog.products.length, OWAYO_CATALOG_V1.length)
  const live = catalog.products.filter(row => row.assetsReady && row.manifest).length
  assert.equal(catalog.summary.live, live)
  assert.equal(owayoCatalogSummary(catalog.products).pending, catalog.products.length - live)
  assert.ok(catalog.products.filter(row => row.assetsReady).every(row => row.manifest))
  assert.ok(catalog.products.filter(row => !row.assetsReady).every(row => !row.manifest))
})

test('every live Owayo family resolves its own model and usable design archive', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'designer/owayo/catalog.json'), 'utf8'))
  for (const family of catalog.products.filter(row => row.assetsReady)) {
    const manifest = JSON.parse(await readFile(resolve(publicRoot, family.manifest.slice(1)), 'utf8'))
    assert.equal(manifest.provider, 'owayo')
    assert.match(manifest.syncStatus, /^READY(?:_WITH_SOURCE_GAPS)?$/, family.id)
    if (manifest.syncStatus === 'READY') assert.equal(manifest.missingDesigns?.length || 0, 0, family.id)
    else assert.ok(manifest.missingDesigns?.length > 0, `${family.id} must name each unavailable source design`)
    assert.ok(manifest.product?.model, `${family.id} has no model`)
    assert.equal(manifest.designs.length, family.designCount, `${family.id} design count drift`)
    assert.ok(manifest.designs.every(design => design.textures && Object.keys(design.textures).length > 0), `${family.id} has an empty design`)
  }
  const c7 = catalog.products.find(row => row.id === 'cycling-c7')
  assert.equal(c7.assetsReady, true)
  assert.equal(c7.syncStatus, 'READY_WITH_SOURCE_GAPS')
  assert.deepEqual(c7.missingDesigns, ['Route'])
})
