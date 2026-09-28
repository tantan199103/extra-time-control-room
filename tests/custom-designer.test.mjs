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
    logo:{ name:'crest.png', x:4, y:-4, scale:4, rotation:400 },
    roster:Array.from({ length:120 }, (_, index) => ({ name:`Player ${index}`, number:`${index}x`, size:'M' }))
  })
  assert.equal(spec.source, 'JERSEVO_3D_DESIGNER')
  assert.equal(spec.roster.length, 99)
  assert.equal(spec.logo.x, 1)
  assert.equal(spec.logo.rotation, 180)
  assert.equal(spec.roster[0].number, '0')
  assert.equal(spec.manifest, '/designer/owayo/cycling-c3/manifest.json')
  assert.throws(() => normalizeDesignerSpec({ source:'external' }), /not supported/)
})
