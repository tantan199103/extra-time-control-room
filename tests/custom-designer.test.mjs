import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { matchMirlTexture, parseMirl } from '../src/lib/mirl-loader.js'
import { STOREFRONT_STATIC_ROUTES } from '../src/lib/storefront-model.js'
import { normalizeDesignerSpec } from '../api/customization-order.js'
import { brandColorIndices } from '../scripts/strip-owayo-branding.mjs'
import { normalizeOwayoLogo, normalizeOwayoPersonalization, normalizeOwayoRoster, normalizeOwayoSizeOptions, owayoBackTextLayout, owayoPlacementPartNames, resolveOwayoPreviewText, resolveOwayoSizeValue } from '../src/lib/owayo-personalization.js'
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
  assert.match(source, /Switch to Cycling patterns/)
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
    roster:Array.from({ length:120 }, (_, index) => ({ name:`Player ${index}`, number:`${index}x`, size:'M' }))
  })
  assert.equal(spec.source, 'JERSEVO_3D_DESIGNER')
  assert.equal(spec.roster.length, 99)
  assert.equal(spec.logo.x, 1)
  assert.equal(spec.logo.rotation, 180)
  assert.equal(spec.logo.placement, 'right-sleeve')
  assert.equal(spec.roster[0].number, '0')
  assert.equal(spec.manifest, '/designer/owayo/cycling-c3/manifest.json')
  assert.throws(() => normalizeDesignerSpec({ source:'external' }), /not supported/)
})

test('Owayo personalization preview is deterministic and roster-backed', () => {
  const roster = [{ name:'  Ada Lovelace  ', number:'9x0', size:'M' }]
  const preview = resolveOwayoPreviewText({ team:'JERSEVO', name:'Draft', number:'12' }, roster)
  assert.deepEqual(preview, { team:'JERSEVO', name:'Ada Lovelace', number:'90' })
  const normalized = normalizeOwayoPersonalization({ ...preview, font:'not-allowed', rotation:99, outlineWidth:99 }, roster)
  assert.equal(normalized.font, 'Barlow Condensed')
  assert.equal(normalized.rotation, 30)
  assert.equal(normalized.outlineWidth, 24)
  assert.deepEqual(Object.keys(owayoBackTextLayout()), ['team','name','number'])
  assert.deepEqual(normalizeOwayoLogo({ name:' crest.svg ', placement:'unknown', x:9, scale:0 }), { name:'crest.svg', x:1, y:0, scale:.25, rotation:0, placement:'front' })
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

test('3D stage binds Owayo text to the Back UV shader instead of a floating text plane', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /personalizationMap/)
  assert.match(source, /personalizationEnabled/)
  assert.match(source, /applyOwayoPersonalization\(runtime, textMap, normalizedText\.placement\)/)
  assert.match(source, /owayoPlacementPartNames\(\[\.\.\.runtime\.partMeshes\.keys\(\)\], placement\)/)
})

test('Owayo logos and alternate text sides bind to garment UV materials', async () => {
  const source = await readFile(resolve(root, 'src/CustomDesignerPage.jsx'), 'utf8')
  assert.match(source, /uniform sampler2D logoMap/)
  assert.match(source, /applyOwayoLogo\(runtime, texture, normalizedLogo\.placement\)/)
  assert.match(source, /owayoPlacementPartNames/)
  assert.match(source, /Place on garment/)
  assert.match(source, /productId:manifest\?\.product\?\.id \|\| state\.productId/)
  assert.deepEqual(owayoPlacementPartNames(['LeftArm', 'Keillinks'], 'left-sleeve'), ['LeftArm'])
  assert.deepEqual(owayoPlacementPartNames(['LeftCuff', 'LeftArm'], 'left-sleeve'), ['LeftArm'])
  assert.deepEqual(owayoPlacementPartNames(['Aermelbandlinks', 'Passelinks'], 'left-sleeve'), ['Aermelbandlinks'])
  assert.deepEqual(owayoPlacementPartNames(['FrontLeftPart', 'FrontRightPart'], 'front'), ['FrontRightPart'])
  assert.deepEqual(owayoPlacementPartNames(['Back1', 'Back2', 'Back3'], 'back'), ['Back1'])
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

test('every live Owayo family resolves its own model and design archive', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'designer/owayo/catalog.json'), 'utf8'))
  for (const family of catalog.products.filter(row => row.assetsReady)) {
    const manifest = JSON.parse(await readFile(resolve(publicRoot, family.manifest.slice(1)), 'utf8'))
    assert.equal(manifest.provider, 'owayo')
    assert.equal(manifest.syncStatus, 'READY', family.id)
    assert.equal(manifest.missingDesigns?.length || 0, 0, family.id)
    assert.ok(manifest.product?.model, `${family.id} has no model`)
    assert.equal(manifest.designs.length, family.designCount, `${family.id} design count drift`)
    assert.ok(manifest.designs.every(design => design.textures && Object.keys(design.textures).length > 0), `${family.id} has an empty design`)
  }
  const c7 = catalog.products.find(row => row.id === 'cycling-c7')
  assert.equal(c7.assetsReady, false)
  assert.deepEqual(c7.missingDesigns, ['Route'])
})
