import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = path => readFile(resolve(root, path), 'utf8')

test('custom designer keeps native artwork, scenes and exports while removing the reference catalogue', async () => {
  const [designer, styles, packageJson] = await Promise.all([
    read('src/CustomDesignerPage.jsx'),
    read('src/custom-designer.css'),
    read('package.json').then(JSON.parse)
  ])

  assert.match(designer, /id:\s*['"]artwork['"]/)
  assert.match(designer, /ArtworkPanel/)
  assert.match(designer, /MOCKUP_SCENE_PRESETS/)
  assert.match(designer, /exportPng/)
  assert.match(designer, /exportJson/)
  assert.doesNotMatch(designer, /MOCKUP_CATALOG_URL|mockupCatalog|designer-mockup-reference|3DMockups catalogue reference/)
  assert.doesNotMatch(styles, /designer-mockup-reference/)
  assert.ok(!Object.keys(packageJson.scripts).some(script => /3dmockups/i.test(script)))
  await assert.rejects(access(resolve(root, 'public/designer/3dmockups/catalog.json')), { code: 'ENOENT' })
})

test('sportswear and teamwear share the same design-library control frame', async () => {
  const [designer, styles] = await Promise.all([read('src/CustomDesignerPage.jsx'), read('src/custom-designer.css')])
  assert.match(designer, /designer-library-collections/)
  assert.match(designer, /designer-library-models/)
  assert.match(designer, /Sportswear\s*\+\s*Teamwear/)
  assert.match(designer, /providerLabel:'Sportswear'/)
  assert.match(designer, /providerLabel:'Teamwear'/)
  assert.match(designer, /Search models/)
  assert.doesNotMatch(designer, /designer-owayo-families|designer-owayo-families__list|designer-library-switch__providers/)
  assert.match(styles, /\.designer-library-collections/)
  assert.match(styles, /\.designer-library-models/)
})
