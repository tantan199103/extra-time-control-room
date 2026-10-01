import test from 'node:test'
import assert from 'node:assert/strict'
import { hasCustom3DDesigner, custom3DDesignerConfig, isCustom3DOnlyProduct, isRetail3DCustomizableProduct } from '../src/lib/custom-3d.js'
import { prepareStorefrontProduct } from '../src/lib/storefront-model.js'
import { catalogCategoryByHandle, productMatchesCatalogCategory } from '../src/lib/catalog-taxonomy.js'
import { owayoFamilyByProductId, resolveOwayoManifestRequest } from '../src/lib/owayo-designer-routing.js'

const customCategory = catalogCategoryByHandle('custom-jerseys')

test('catalogue hydration can pass a missing product without crashing the storefront', () => {
  assert.equal(custom3DDesignerConfig(null), null)
  assert.equal(hasCustom3DDesigner(null), false)
})

test('Comma-style 2D personalization never qualifies for the 3D Custom Lab', () => {
  const comma = {
    title: 'Comma Football personalized jersey',
    tags: ['jersevo', 'custom', 'personalized', 'customizable'],
    custom_fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'number', label: 'Number', type: 'number' }]
  }
  assert.equal(hasCustom3DDesigner(comma), false)
  assert.equal(productMatchesCatalogCategory(comma, customCategory), false)
})

test('a provider-scoped manifest and 3D marker qualify an Owayo listing', () => {
  const owayo = {
    tags: ['3d-designer', 'designer-provider-owayo', 'designer-product-cycling-c3'],
    custom_fields: [{ key: 'name', label: 'Name', type: 'text' }]
  }
  assert.equal(hasCustom3DDesigner(owayo), true)
  assert.equal(isCustom3DOnlyProduct(owayo), true)
  assert.deepEqual(custom3DDesignerConfig(owayo), {
    provider: 'owayo',
    productId: 'cycling-c3',
    manifest: '/designer/owayo/cycling-c3/manifest.json',
    defaultDesignId: '',
    defaultStyleCode: '',
    allowedStyleCodes: [],
    allowedDesignIds: []
  })
  assert.equal(productMatchesCatalogCategory({ designerConfig: custom3DDesignerConfig(owayo) }, customCategory), true)
})

test('ordinary products are not classified as Custom Lab-only rows', () => {
  assert.equal(isCustom3DOnlyProduct({ tags:['customizable','jersey'] }), false)
  assert.equal(isCustom3DOnlyProduct(null), false)
})

test('retail 3D contracts keep the normal PDP and expose safe preset defaults', () => {
  const product = {
    tags:['nfl','jerseys','customizable'],
    ai_metadata:{ designer:{
      provider:'boombah', productId:'FOOTBALL3D',
      manifest:'/designer/boombah/products/football3d.json',
      catalogVisibility:'RETAIL', defaultStyleCode:'100RS',
      defaultDesignId:'football3d-top-fd-foot-100rs-1000',
      defaultText:{ team:'DETROIT', name:'ST. BROWN', number:'14' },
      defaultColors:{ C1:'#9CA3AF', C2:'#0A3D91', C3:'#F8F8F4' }
    }}
  }
  assert.equal(hasCustom3DDesigner(product), true)
  assert.equal(isRetail3DCustomizableProduct(product), true)
  assert.equal(isCustom3DOnlyProduct(product), false)
  assert.deepEqual(custom3DDesignerConfig(product).defaultText, { team:'DETROIT', name:'ST. BROWN', number:'14' })
  assert.deepEqual(custom3DDesignerConfig(product).defaultColors, { C1:'#9CA3AF', C2:'#0A3D91', C3:'#F8F8F4' })
})

test('legacy Boombah marker resolves to its local product manifest', () => {
  const product = prepareStorefrontProduct({
    id: 'teamwear-fastpitch',
    handle: 'custom-fastpitch-teamwear',
    title: 'Custom teamwear',
    tags: ['teamwear', 'customizable', '3d-designer', 'designer-product-FASTPITCH3D'],
    custom_fields: [{ key: 'name', label: 'Player name', type: 'text' }],
    variants: []
  })
  assert.equal(hasCustom3DDesigner(product), true)
  assert.equal(product.designerConfig.provider, 'boombah')
  assert.equal(product.designerConfig.productId, 'FASTPITCH3D')
  assert.equal(product.designerConfig.manifest, '/designer/boombah/products/fastpitch3d.json')
  assert.equal(productMatchesCatalogCategory(product, customCategory), true)
})

test('external or unsupported designer manifests are rejected', () => {
  assert.equal(hasCustom3DDesigner({
    ai_metadata: { designer: { provider: 'owayo', productId: 'cycling-c3', manifest: 'https://example.com/manifest.json' } }
  }), false)
  assert.equal(hasCustom3DDesigner({
    ai_metadata: { designer: { provider: 'custom-provider', productId: 'kit', manifest: '/designer/custom/kit.json' } }
  }), false)
})

test('Owayo route and listing selection resolve the exact synchronized family manifest', () => {
  const catalog = {
    products: [
      { id:'cycling-c3', key:'bikejerseys', assetsReady:true, manifest:'/designer/owayo/cycling-c3/manifest.json' },
      { id:'cycling-c5', key:'bikejerseys_pro', assetsReady:true, manifest:'/designer/owayo/cycling-c5/manifest.json' }
    ]
  }
  assert.equal(owayoFamilyByProductId(catalog, 'bikejerseys_pro')?.id, 'cycling-c5')
  assert.equal(resolveOwayoManifestRequest({ catalog, routeProduct:'cycling-c5' }), '/designer/owayo/cycling-c5/manifest.json')
  assert.equal(resolveOwayoManifestRequest({ catalog, listingDesigner:{ provider:'owayo', manifest:'/designer/owayo/cycling-c5/manifest.json' }, routeProduct:'cycling-c3' }), '/designer/owayo/cycling-c5/manifest.json')
})
