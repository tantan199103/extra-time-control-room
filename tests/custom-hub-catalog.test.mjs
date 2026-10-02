import test from 'node:test'
import assert from 'node:assert/strict'
import { customDesignerRoute, normalizeCustomHubCatalogs } from '../src/lib/custom-hub-catalog.js'

test('Custom hub merges every ready 3D family into one provider-aware catalogue', () => {
  const families = normalizeCustomHubCatalogs({ products:[{
    id:'cycling-c3', title:'Jersevo Custom Cycling Jersey C3', group:'cycling', groupLabel:'Cycling',
    assetsReady:true, provider:'studio', manifest:'/designer/studio/cycling-c3/manifest.json', designCount:52,
    preview:'/designer/owayo/cycling-c3/previews/garment-render.webp', previewDesign:'etape'
  }] }, { products:[{
    id:'FASTPITCH3D', name:'Boombah Ink Fastpitch Uniforms', sport:'Fastpitch',
    provider:'teamwear', manifest:'/designer/teamwear/products/fastpitch3d.json', styles:4, designs:28,
    preview:{ uri:'https://cdn.example/fastpitch.jpg' }, defaultDesignId:'fastpitch-1000', defaultStyleCode:'SS'
  }] })

  assert.equal(families.length, 2)
  assert.deepEqual(families.map(item => item.provider), ['studio','teamwear'])
  assert.equal(families[1].title, 'Custom Fastpitch Uniforms')
  assert.equal(families[1].preview, 'https://cdn.example/fastpitch.jpg')
  assert.equal(families[1].designCount, 28)
})

test('every Custom garment card opens the same editor with its exact identity', () => {
  assert.equal(
    customDesignerRoute({ provider:'studio', productId:'cycling-c3', defaultDesignId:'etape' }),
    '/custom/design?provider=studio&product=cycling-c3&design=etape'
  )
  assert.equal(
    customDesignerRoute({ provider:'teamwear', productId:'FASTPITCH3D', defaultDesignId:'fastpitch-1000', defaultStyleCode:'SS' }),
    '/custom/design?provider=teamwear&product=FASTPITCH3D&design=fastpitch-1000&style=SS'
  )
})
