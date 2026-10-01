import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileImage,
  FileJson,
  Grid3X3,
  Hash,
  Image as ImageIcon,
  Layers3,
  Move,
  Palette,
  Plus,
  Redo2,
  Rotate3D,
  Save,
  Shirt,
  ShoppingBag,
  Trash2,
  Type,
  Undo2,
  Upload,
  UsersRound,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { matchMirlTexture, parseMirl } from './lib/mirl-loader'
import { isBoombahBrandingName, isBoombahLogoPartName, stripBoombahBrandingText } from './lib/boombah-branding'
import { createCustomizationOrder, fetchStorefrontDesignerProduct, fetchStorefrontProduct, getCustomerSessionId, uploadCustomerReference } from './lib/storefront-api'
import { DEFAULT_QUANTITY_DISCOUNT_POLICY, quantityDiscountForQty } from './lib/quantity-pricing'
import { findActiveVariant } from './lib/variant-selection'
import { custom3DDesignerConfig } from './lib/custom-3d'
import { normalizeOwayoLayer, normalizeOwayoLayers, normalizeOwayoLogo, normalizeOwayoPersonalization, normalizeOwayoRoster, normalizeOwayoSizeOptions, owayoBackTextLayout, owayoPlacementPartNames, owayoPlacementPreset, owayoPlacementSurface, owayoPlacementUvTransform, resolveOwayoPreviewText, resolveOwayoSizeValue, OWAYO_PERSONALIZATION_FONTS, OWAYO_PRINT_AREA_GROUPS } from './lib/owayo-personalization'
import { owayoFamilyByProductId, resolveOwayoManifestRequest } from './lib/owayo-designer-routing'
import { trackStorefrontEvent } from './lib/storefront-analytics'
import { MOCKUP_SCENE_PRESETS, validateMockupAsset } from './lib/mockup-workflow'
import './custom-designer.css'

const OWAYO_MANIFEST_URL = '/designer/owayo/cycling-c3/manifest.json'
const OWAYO_CATALOG_URL = '/designer/owayo/catalog.json'
const BOOMBAH_CATALOG_URL = '/designer/boombah/catalog.json'
const MOCKUP_CATALOG_URL = '/designer/3dmockups/catalog.json'
const ASSET_CACHE_BUSTER = 'retail-uv-20261002'
// The listing-specific Boombah manifest introduced a new layer contract. Use
// a new draft namespace so a pre-manifest draft such as JERSEVO / YOUR NAME /
// 90 cannot replace the photographed listing's DETROIT / ST BROWN / 14 seed.
// Drafts created after this version continue to autosave normally.  The
// listing-specific retail defaults were tuned to the photographed jersey;
// bumping the namespace prevents the earlier compact text draft from masking
// those defaults on the next visit.
const DRAFT_KEY = 'jersevo-3d-designer-draft-v4'
const COLOR_SWATCHES = [
  '#111311', '#F8F8F4', '#F3ED45', '#2876FF', '#EF3340', '#F97316',
  '#7C3AED', '#EC4899', '#12B981', '#00A6A6', '#82C91E', '#7DD3FC',
  '#8B5E3C', '#B7BAC2', '#555B66', '#F1C27D', '#6E1423', '#16324F'
]
const TABS = [
  { id:'design', label:'Design', icon:Shirt },
  { id:'colors', label:'Colors', icon:Palette },
  { id:'patterns', label:'Patterns', icon:Grid3X3 },
  { id:'text', label:'Text', icon:Type },
  { id:'logos', label:'Logos', icon:ImageIcon },
  { id:'artwork', label:'Artwork', icon:FileImage }
]

function assetUrl(uri, manifest) {
  if (uri && typeof uri === 'object') uri = uri.uri || uri.url || ''
  if (!uri || /^data:/i.test(uri)) return uri
  const version = manifest?.source?.syncedAt || ASSET_CACHE_BUSTER
  return `${uri}${uri.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
}

function manifestIsBoombah(manifest) {
  return String(manifest?.provider || '').toLowerCase() === 'boombah' || manifest?.model?.format === 'glb-draco'
}

function selectedBoombahDesign(manifest, design) {
  return manifestIsBoombah(manifest) ? manifest?.designs?.find(item => item.id === design || item.slug === design) : null
}

function colorHex(value, fallback = '#F8F8F4') {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function recolorBoombahSvg(svgText, design, colors) {
  const zones = design?.colorZones || []
  let svg = stripBoombahBrandingText(svgText, zones)
  const replacements = new Map()
  // Some synchronized templates keep a production colour directly in art
  // paths while the paramcolor marker retains the palette's canonical value.
  // Retail manifests can declare these aliases to keep a photographed jersey
  // from falling back to the template's demo yellow.
  for (const [source, code] of Object.entries(design?.artworkColorMap || {})) {
    if (!/^#[0-9a-f]{6}$/i.test(String(source || '')) || !String(code || '').trim()) continue
    replacements.set(String(source).toLowerCase(), colorHex(colors?.[code], '#F8F8F4'))
  }
  for (const zone of zones) {
    const code = String(zone.code || '')
    const marker = new RegExp(`<rect\\b(?=[^>]*\\bid=["']paramcolor-${escapeRegex(code)}["'])[^>]*>`, 'i').exec(svg)?.[0]
    const sourceColor = marker?.match(/\bfill=["']([^"']+)["']/i)?.[1]
    if (sourceColor && zone.editable !== false && !replacements.has(sourceColor.toLowerCase())) replacements.set(sourceColor.toLowerCase(), colorHex(colors?.[code], '#F8F8F4'))
  }
  if (!replacements.size) return svg
  return svg.split(/(<[^>]+>)/g).map(part => {
    if (!part.startsWith('<')) return part
    let result = part
    for (const [from, to] of replacements) {
      const escaped = escapeRegex(from)
      result = result
        .replace(new RegExp(`(\\bfill=["'])${escaped}(["'])`, 'gi'), `$1${to}$2`)
        .replace(new RegExp(`(\\bstroke=["'])${escaped}(["'])`, 'gi'), `$1${to}$2`)
        .replace(new RegExp(`(fill\\s*:\\s*)${escaped}(?=[;"'])`, 'gi'), `$1${to}`)
        .replace(new RegExp(`(stroke\\s*:\\s*)${escaped}(?=[;"'])`, 'gi'), `$1${to}`)
    }
    return result
  }).join('')
}

function id() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const LAYER_LIMIT = 24
const LAYER_LABELS = Object.freeze({ team:'Team name', name:'Player name', number:'Player number', logo:'Logo', artwork:'Artwork' })
const LAYER_AREA_SUGGESTIONS = Object.freeze({
  team:['front-center', 'back-upper', 'front-lower'],
  name:['back-upper', 'front-right-chest', 'front-center'],
  number:['back-center', 'front-left-chest', 'right-sleeve'],
  logo:['front-left-chest', 'right-sleeve', 'front-center', 'back-upper'],
  artwork:['front-center', 'back-center', 'front-lower', 'left-sleeve']
})

function newDesignerLayer(kind, placement = '', patch = {}) {
  const candidate = {
    id:`${kind}-${id()}`,
    kind,
    placement:placement || LAYER_AREA_SUGGESTIONS[kind]?.[0] || 'front-center',
    x:0,
    y:0,
    scale:1,
    rotation:0,
    ...(['logo', 'artwork'].includes(kind) ? { dataUrl:'', name:'', consent:false } : {}),
    ...patch
  }
  const normalized = normalizeOwayoLayer(candidate)
  return {
    ...normalized,
    ...(candidate.color ? { color:colorHex(candidate.color) } : {}),
    ...(candidate.outlineColor ? { outlineColor:colorHex(candidate.outlineColor) } : {}),
    ...(candidate.textureColor ? { textureColor:colorHex(candidate.textureColor) } : {}),
    ...(['logo', 'artwork'].includes(kind) ? { dataUrl:String(candidate.dataUrl || ''), consent:Boolean(candidate.consent) } : {})
  }
}

function legacyDesignerLayers(text = {}, logo = {}) {
  const normalized = normalizeOwayoPersonalization(text)
  const layout = owayoBackTextLayout(normalized.placement)
  const preset = owayoPlacementPreset(normalized.placement)
  const layerFor = kind => newDesignerLayer(kind, normalized.placement, {
    x:normalized.x,
    y:Math.max(-1, Math.min(1, normalized.y + ((layout[kind]?.y ?? preset.centerY) - preset.centerY) / .18)),
    scale:normalized.scale,
    rotation:normalized.rotation
  })
  const layers = [layerFor('team'), layerFor('name'), layerFor('number')]
  if (logo?.dataUrl || logo?.name) layers.push(newDesignerLayer('logo', logo.placement, logo))
  return layers
}

function migrateDesignerLayers(state = {}) {
  if (Number(state.layerVersion) >= 1 && Array.isArray(state.layers)) {
    const source = state.layers.slice(0, LAYER_LIMIT)
    return normalizeOwayoLayers(source).map((normalized, index) => {
      const layer = source[index]
      return {
        ...normalized,
        ...(layer?.color ? { color:colorHex(layer.color) } : {}),
        ...(layer?.outlineColor ? { outlineColor:colorHex(layer.outlineColor) } : {}),
        ...(layer?.textureColor ? { textureColor:colorHex(layer.textureColor) } : {}),
        ...(['logo', 'artwork'].includes(normalized.kind) ? { dataUrl:String(layer?.dataUrl || ''), consent:Boolean(layer?.consent) } : {})
      }
    })
  }
  return legacyDesignerLayers(state.text, state.logo)
}

function initialDesignerState() {
  const firstPlayerId = id()
  const text = { team:'JERSEVO', name:'YOUR NAME', number:'90', x:0, y:0, scale:1, color:'#F8F8F4', font:'Barlow Condensed', outlineColor:'#111311', outlineWidth:8, rotation:0, placement:'back-center', sameOnAll:false, layer:0 }
  return {
    provider:'owayo',
    listingId:'',
    listingHandle:'',
    productId:'cycling-c3',
    styleCode:'SS',
    design:'',
    colors:{ A:'#111311', B:'#F3ED45', C:'#2876FF', K:'#111311' },
    pattern:{ id:'', slug:'', colorCode:'A', scale:1, opacity:.82 },
    text,
    logo:{ dataUrl:'', name:'', x:0, y:0, scale:1, rotation:0, placement:'front-center', consent:false },
    layerVersion:1,
    layers:legacyDesignerLayers(text),
    previewPlayerId:firstPlayerId,
    roster:[{ id:firstPlayerId, name:'Your name', number:'90', size:'M' }]
  }
}

function useDesignerHistory(seed) {
  const [history, setHistory] = useState(() => ({ past:[], present:seed, future:[] }))
  const update = useCallback(change => setHistory(current => {
    const next = typeof change === 'function' ? change(current.present) : { ...current.present, ...change }
    if (JSON.stringify(next) === JSON.stringify(current.present)) return current
    return { past:[...current.past.slice(-39), current.present], present:next, future:[] }
  }), [])
  const replace = useCallback(next => setHistory({ past:[], present:next, future:[] }), [])
  const undo = useCallback(() => setHistory(current => {
    if (!current.past.length) return current
    const previous = current.past.at(-1)
    return { past:current.past.slice(0, -1), present:previous, future:[current.present, ...current.future] }
  }), [])
  const redo = useCallback(() => setHistory(current => {
    if (!current.future.length) return current
    const next = current.future[0]
    return { past:[...current.past, current.present], present:next, future:current.future.slice(1) }
  }), [])
  return { state:history.present, update, replace, undo, redo, canUndo:Boolean(history.past.length), canRedo:Boolean(history.future.length) }
}

function decimalColor(value, fallback = '#F8F8F4') {
  const number = Number(value)
  return Number.isFinite(number) ? `#${Math.max(0, Math.min(0xFFFFFF, number)).toString(16).padStart(6, '0')}` : fallback
}

function rgb(hex) {
  const value = String(hex || '').replace('#', '')
  const normalized = value.length === 3 ? value.split('').map(character => character + character).join('') : value.padStart(6, '0').slice(0, 6)
  const number = Number.parseInt(normalized, 16)
  return [number >> 16 & 255, number >> 8 & 255, number & 255]
}

function contrastColor(hex) {
  const [red, green, blue] = rgb(hex)
  return red * .299 + green * .587 + blue * .114 > 150 ? '#111311' : '#F8F8F4'
}

function paletteBytes(manifest, colors) {
  const bytes = new Uint8Array(256 * 4)
  for (let index = 0; index < 256; index += 1) {
    bytes[index * 4] = 245
    bytes[index * 4 + 1] = 246
    bytes[index * 4 + 2] = 243
    bytes[index * 4 + 3] = 255
  }
  const defaults = manifest?.product?.defaultColors || {}
  for (const color of manifest?.product?.colorCodes || []) {
    const number = Number(color.ColorCodeNr)
    if (!Number.isInteger(number) || number < 0 || number > 255) continue
    const code = color.colorCode
    let chosen = colors[code] || decimalColor(defaults[code])
    if (/_O$/.test(code)) chosen = contrastColor(colors[code.replace(/_O$/, '')] || decimalColor(defaults[code.replace(/_O$/, '')]))
    const [red, green, blue] = rgb(chosen)
    bytes[number * 4] = red
    bytes[number * 4 + 1] = green
    bytes[number * 4 + 2] = blue
  }
  return bytes
}

function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose?.()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.filter(Boolean).forEach(material => {
      Object.values(material).forEach(value => value?.isTexture && value.dispose?.())
      material.userData?.maskMap?.dispose?.()
      material.dispose?.()
    })
  })
}

function maskMaterial(maskMap, paletteMap, patternFallback, personalizationFallback) {
  maskMap.minFilter = THREE.NearestFilter
  maskMap.magFilter = THREE.NearestFilter
  maskMap.generateMipmaps = false
  maskMap.colorSpace = THREE.NoColorSpace
  const material = new THREE.ShaderMaterial({
    uniforms:{
      maskMap:{ value:maskMap },
      paletteMap:{ value:paletteMap },
      patternMap:{ value:patternFallback },
      patternEnabled:{ value:0 },
      patternIndex:{ value:-1 },
      patternOpacity:{ value:0 },
      patternScale:{ value:1 },
      personalizationMap:{ value:personalizationFallback || patternFallback },
      personalizationEnabled:{ value:0 },
      personalizationUvScale:{ value:new THREE.Vector2(1, 1) },
      personalizationUvOffset:{ value:new THREE.Vector2(0, 0) },
      logoMap:{ value:personalizationFallback || patternFallback },
      logoEnabled:{ value:0 },
      logoUvScale:{ value:new THREE.Vector2(1, 1) },
      logoUvOffset:{ value:new THREE.Vector2(0, 0) }
    },
    vertexShader:`
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -viewPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader:`
      uniform sampler2D maskMap;
      uniform sampler2D paletteMap;
      uniform sampler2D patternMap;
      uniform float patternEnabled;
      uniform float patternIndex;
      uniform float patternOpacity;
      uniform float patternScale;
      uniform sampler2D personalizationMap;
      uniform float personalizationEnabled;
      uniform vec2 personalizationUvScale;
      uniform vec2 personalizationUvOffset;
      uniform sampler2D logoMap;
      uniform float logoEnabled;
      uniform vec2 logoUvScale;
      uniform vec2 logoUvOffset;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      float weaveNoise(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
      }
      void main() {
        vec4 mask = texture2D(maskMap, vUv);
        float paletteIndex = floor(mask.r * 255.0 + 0.5);
        vec3 base = texture2D(paletteMap, vec2((paletteIndex + 0.5) / 256.0, 0.5)).rgb;
        vec3 normal = normalize(vNormalView);
        if (!gl_FrontFacing) normal = -normal;
        float keyLight = max(dot(normal, normalize(vec3(-0.35, 0.65, 0.85))), 0.0);
        float fillLight = max(dot(normal, normalize(vec3(0.75, -0.15, 0.45))), 0.0);
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        float target = 1.0 - step(0.5, abs(paletteIndex - patternIndex));
        vec4 motif = texture2D(patternMap, fract(vUv * max(patternScale, 0.05)));
        vec3 garmentBase = mix(base, motif.rgb, target * patternEnabled * patternOpacity * motif.a);
        vec4 personalization = texture2D(personalizationMap, vUv * personalizationUvScale + personalizationUvOffset);
        garmentBase = mix(garmentBase, personalization.rgb, personalization.a * personalizationEnabled);
        // A restrained procedural knit gives the jersey a breathable
        // performance-mesh read at close range without baking a noisy image
        // into every synchronized family. Crossed warp/weft lines plus a
        // tiny seeded variation catch light like polyester sports fabric.
        vec2 knitUv = vUv * vec2(300.0, 220.0);
        float warp = smoothstep(0.28, 0.72, abs(fract(knitUv.x) - 0.5) * 2.0);
        float weft = smoothstep(0.28, 0.72, abs(fract(knitUv.y) - 0.5) * 2.0);
        float grain = (warp * 0.52 + weft * 0.48) - 0.5;
        float fleck = weaveNoise(floor(knitUv)) - 0.5;
        float knit = clamp(grain * 0.018 + fleck * 0.009, -0.028, 0.028);
        vec3 fabricBase = clamp(garmentBase + knit, 0.0, 1.0);
        float viewFacing = max(dot(normal, normalize(vViewPosition)), 0.0);
        float breathableSheen = pow(1.0 - viewFacing, 3.4) * 0.075;
        vec3 color = fabricBase * (0.52 + keyLight * 0.48 + fillLight * 0.14) + rim * 0.055 + breathableSheen * vec3(0.92, 0.97, 1.0);
        vec4 logo = texture2D(logoMap, vUv * logoUvScale + logoUvOffset);
        color = mix(color, logo.rgb * (0.82 + keyLight * 0.18), logo.a * logoEnabled);
        gl_FragColor = vec4(color, mask.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side:THREE.DoubleSide,
    transparent:false,
    toneMapped:true
  })
  material.userData.maskMap = maskMap
  return material
}

const TEXT_LAYER_METRICS = Object.freeze({
  team:{ width:.58, size:.055, weight:700 },
  name:{ width:.64, size:.076, weight:800 },
  number:{ width:.54, size:.2, weight:800 }
})
const logoLayerImageCache = new Map()

function loadLogoLayerImage(dataUrl) {
  const source = String(dataUrl || '')
  if (logoLayerImageCache.has(source)) return logoLayerImageCache.get(source)
  if (logoLayerImageCache.size >= 16) logoLayerImageCache.delete(logoLayerImageCache.keys().next().value)
  const pending = new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The logo image could not be decoded.'))
    image.src = source
  }).catch(error => {
    logoLayerImageCache.delete(source)
    throw error
  })
  logoLayerImageCache.set(source, pending)
  return pending
}

function createLayerCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 2048
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  return { canvas, context }
}

function layerAnchor(layer) {
  const preset = owayoPlacementPreset(layer?.placement)
  const chest = preset.id === 'front-left-chest' || preset.id === 'front-right-chest'
  return {
    preset,
    x:Math.max(.04, Math.min(.96, preset.centerX + Number(layer?.x || 0) * (chest ? .11 : .18))),
    y:Math.max(.04, Math.min(.96, preset.centerY + Number(layer?.y || 0) * .18))
  }
}

function drawTextLayer(context, layer, text) {
  const normalizedLayer = normalizeOwayoLayer(layer)
  const normalizedText = normalizeOwayoPersonalization(text)
  const content = String(normalizedText[normalizedLayer.kind] || '').toUpperCase()
  const metrics = TEXT_LAYER_METRICS[normalizedLayer.kind]
  if (!content || !metrics) return false
  const { preset, x, y } = layerAnchor(normalizedLayer)
  const chest = preset.id === 'front-left-chest' || preset.id === 'front-right-chest'
  const sleeve = preset.surface === 'left-sleeve' || preset.surface === 'right-sleeve'
  const maxWidth = context.canvas.width * (chest ? Math.min(.3, metrics.width * .5) : sleeve ? Math.min(.72, metrics.width * 1.12) : metrics.width)
  const fontFamily = OWAYO_PERSONALIZATION_FONTS.includes(normalizedText.font) ? normalizedText.font : 'Barlow Condensed'
  const areaScale = chest ? .68 : sleeve ? .7 : 1
  let size = Math.round(context.canvas.width * metrics.size * normalizedLayer.scale * areaScale)
  context.font = `${metrics.weight} ${size}px "${fontFamily}", sans-serif`
  while (size > 18 && context.measureText(content).width > maxWidth) {
    size -= 2
    context.font = `${metrics.weight} ${size}px "${fontFamily}", sans-serif`
  }
  context.save()
  context.translate(context.canvas.width * x, context.canvas.height * y)
  context.rotate(THREE.MathUtils.degToRad(normalizedLayer.rotation))
  context.lineWidth = Math.max(0, Number(normalizedText.outlineWidth || 0)) * normalizedLayer.scale
  context.strokeStyle = layer?.outlineColor || normalizedText.outlineColor
  context.fillStyle = layer?.color || normalizedText.color
  if (context.lineWidth > 0) context.strokeText(content, 0, 0)
  context.fillText(content, 0, 0)
  // The photographed listing uses a dark carbon-twill numeral with a bright
  // blue edge. Composite a restrained diagonal weave only inside number glyphs
  // so the live preview reads like the supplied jersey rather than flat text.
  if (normalizedLayer.kind === 'number' && text?.numberStyle === 'carbon') {
    context.save()
    context.globalCompositeOperation = 'source-atop'
    context.globalAlpha = .34
    context.strokeStyle = layer?.textureColor || '#9AA3AB'
    context.lineWidth = Math.max(1, size * .012)
    const span = Math.max(maxWidth, size * 1.4)
    for (let offset = -span; offset < span; offset += Math.max(10, size * .09)) {
      context.beginPath()
      context.moveTo(offset, -size * .8)
      context.lineTo(offset + size * .8, size * .8)
      context.stroke()
    }
    context.restore()
  }
  context.restore()
  return true
}

async function drawLogoLayer(context, layer) {
  if (!layer?.dataUrl) return false
  const normalized = normalizeOwayoLayer(layer)
  const image = await loadLogoLayerImage(layer.dataUrl)
  if (!image) return false
  const { preset, x, y } = layerAnchor(normalized)
  const aspect = Math.max(.1, Number(image.width || 1) / Number(image.height || 1))
  const maxHeight = context.canvas.height * preset.logoHeight * normalized.scale
  const height = Math.min(context.canvas.height * .48, Math.max(24, maxHeight))
  const width = Math.min(context.canvas.width * preset.logoWidth, Math.max(24, height * aspect))
  context.save()
  context.translate(context.canvas.width * x, context.canvas.height * y)
  context.rotate(THREE.MathUtils.degToRad(normalized.rotation))
  context.drawImage(image, -width / 2, -height / 2, width, height)
  context.restore()
  return true
}

// Artwork and logo layers intentionally share the same renderer.  Keeping the
// raster pipeline in one place guarantees that uploaded art follows the exact
// print-area/UV rules already used by the team-logo flow.
const drawArtworkLayer = drawLogoLayer

async function buildOwayoLayerTextures(text, layers = []) {
  const surfaces = new Map()
  const ensure = surface => {
    if (!surfaces.has(surface)) surfaces.set(surface, { ...createLayerCanvas(), used:false })
    return surfaces.get(surface)
  }
  for (const layer of layers) {
    const surface = owayoPlacementSurface(layer.placement)
    const target = ensure(surface)
    if (['logo', 'artwork'].includes(layer?.kind)) {
      if (!layer.dataUrl) continue
      try { target.used = await (layer.kind === 'artwork' ? drawArtworkLayer : drawLogoLayer)(target.context, layer) || target.used } catch (error) { console.error(`${layer.kind === 'artwork' ? 'Artwork' : 'Logo'} layer preview failed`, error) }
    } else {
      target.used = drawTextLayer(target.context, layer, text) || target.used
    }
  }
  return new Map([...surfaces].flatMap(([surface, target]) => {
    if (!target.used) return []
    const texture = new THREE.CanvasTexture(target.canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    texture.needsUpdate = true
    return [[surface, texture]]
  }))
}

function averageZ(part) {
  if (!part) return 0
  let sum = 0
  for (let index = 2; index < part.positions.length; index += 3) sum += part.positions[index]
  return sum / (part.positions.length / 3)
}

function meshUvBounds(mesh) {
  const values = mesh?.geometry?.getAttribute?.('uv')?.array
  if (!values?.length) return { minX:0, maxX:1 }
  let minX = Infinity
  let maxX = -Infinity
  for (let index = 0; index < values.length; index += 2) {
    minX = Math.min(minX, Number(values[index]))
    maxX = Math.max(maxX, Number(values[index]))
  }
  return Number.isFinite(minX) && Number.isFinite(maxX) ? { minX, maxX } : { minX:0, maxX:1 }
}

function setPlacementUv(material, prefix, mesh, placement, splitAcrossPanels) {
  const transform = splitAcrossPanels
    ? owayoPlacementUvTransform(mesh?.name, placement, meshUvBounds(mesh))
    : { scaleX:1, scaleY:1, offsetX:0, offsetY:0 }
  material?.uniforms?.[`${prefix}UvScale`]?.value?.set?.(transform.scaleX, transform.scaleY)
  material?.uniforms?.[`${prefix}UvOffset`]?.value?.set?.(transform.offsetX, transform.offsetY)
}

function disposeLayerTextures(textures) {
  if (textures instanceof Map) textures.forEach(texture => texture?.dispose?.())
}

function applyOwayoLayers(runtime, textures = new Map()) {
  if (!runtime || runtime.boombah) return
  const previous = runtime.layerTextures
  runtime.layerTextures = textures instanceof Map ? textures : new Map()
  const partNames = [...runtime.partMeshes.keys()]
  const targetsBySurface = new Map([
    ['front', owayoPlacementPartNames(partNames, 'front-center')],
    ['back', owayoPlacementPartNames(partNames, 'back-center')],
    ['left-sleeve', owayoPlacementPartNames(partNames, 'left-sleeve')],
    ['right-sleeve', owayoPlacementPartNames(partNames, 'right-sleeve')]
  ])
  for (const [name, mesh] of runtime.partMeshes.entries()) {
    const material = mesh.material
    if (!material?.uniforms?.personalizationMap) continue
    const surfaceEntry = [...targetsBySurface].find(([, targets]) => targets.includes(name))
    const surface = surfaceEntry?.[0]
    const targets = surfaceEntry?.[1] || []
    const texture = surface ? runtime.layerTextures.get(surface) : null
    const active = Boolean(texture)
    setPlacementUv(material, 'personalization', mesh, surface === 'front' ? 'front-center' : `${surface || 'back'}-center`, active && surface === 'front' && targets.length > 1)
    material.uniforms.personalizationMap.value = active ? texture : runtime.personalizationFallback
    material.uniforms.personalizationEnabled.value = active ? 1 : 0
    material.uniforms.logoMap.value = runtime.personalizationFallback
    material.uniforms.logoEnabled.value = 0
    material.needsUpdate = true
  }
  if (previous !== runtime.layerTextures) disposeLayerTextures(previous)
}

function patternTargetCodes(selectedPattern, targetCode = 'A') {
  const active = String(targetCode || 'A').toUpperCase()
  const available = ['A', 'B', 'C', 'D', 'E', 'K']
    .filter(code => code === active || colorsForPatternCode(selectedPattern, code))
  return [active, ...available.filter(code => code !== active)]
}

function colorsForPatternCode(pattern, code) {
  return Boolean(code && (pattern?.colors || []).some(item => Number(item.slot) === ({ A:1, B:2, C:3, D:4, E:5, K:6 }[code] || 0)))
}

function recolorOwayoPatternSvg(svgText, pattern, colors, targetCode = 'A', manifest = null) {
  let svg = String(svgText || '')
  const defaults = manifest?.product?.defaultColors || {}
  const targetCodes = patternTargetCodes(pattern, targetCode)
  for (const item of pattern?.colors || []) {
    const slot = Math.max(1, Number(item.slot) || 1)
    const source = String(item.color || '').trim()
    if (!source) continue
    const code = targetCodes[slot - 1] || targetCodes[0]
    const replacement = colorHex(colors?.[code] || decimalColor(defaults[code]), '#F8F8F4')
    const escaped = escapeRegex(source)
    svg = svg.replace(new RegExp(escaped, 'gi'), replacement)
  }
  return svg
}

function patternTargetIndex(manifest, code) {
  const item = (manifest?.product?.colorCodes || []).find(color => String(color.colorCode).toUpperCase() === String(code || 'A').toUpperCase())
  const number = Number(item?.ColorCodeNr)
  return Number.isInteger(number) ? number : 1
}

async function loadBoombahTexture(design, colors, manifest) {
  if (!design?.template?.uri) return null
  const response = await fetch(assetUrl(design.template.uri, manifest), { cache:'force-cache' })
  if (!response.ok) throw new Error(`Template request failed (${response.status}).`)
  const svg = recolorBoombahSvg(await response.text(), design, colors)
  const blobUrl = URL.createObjectURL(new Blob([svg], { type:'image/svg+xml' }))
  try {
    const loader = new THREE.TextureLoader()
    const texture = await loader.loadAsync(blobUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    // Keep the Illustrator atlas in the same orientation as the exported
    // teamwear UVs. The GLB atlas is authored in bottom-left UV space, so
    // TextureLoader's default (unflipped) orientation is the one that keeps
    // the gray body panels on the garment rather than sampling the transparent
    // black atlas background.
    texture.flipY = false
    texture.anisotropy = 4
    texture.needsUpdate = true
    return texture
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

async function loadOwayoPatternTexture(pattern, colors, targetCode, manifest) {
  if (!pattern?.texture) return null
  const response = await fetch(assetUrl(pattern.texture, manifest), { cache:'force-cache' })
  if (!response.ok) throw new Error(`Pattern request failed (${response.status}).`)
  const svg = recolorOwayoPatternSvg(await response.text(), pattern, colors, targetCode, manifest)
  const blobUrl = URL.createObjectURL(new Blob([svg], { type:'image/svg+xml' }))
  try {
    const loader = new THREE.TextureLoader()
    const texture = await loader.loadAsync(blobUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.anisotropy = 4
    texture.repeat.set(1, 1)
    texture.needsUpdate = true
    return texture
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

function emptyPatternTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function neutralVendorTexture(name) {
  const normalized = String(name || '').toLowerCase()
  const color = normalized.includes('white') ? [255, 255, 255, 255]
    : normalized.includes('navy') ? [3, 29, 64, 255]
      : [34, 33, 35, 255]
  const texture = new THREE.DataTexture(new Uint8Array(color), 1, 1, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  texture.name = 'Jersevo neutral fabric'
  return texture
}

function supportsBoombahGarmentPersonalization(manifest, selected) {
  if (!manifestIsBoombah(manifest)) return true
  const identity = [manifest?.product?.sport, manifest?.product?.name, selected?.garment, selected?.styleName]
    .filter(Boolean).join(' ').toLowerCase()
  return !/\b(?:shoe|shoes|accessor(?:y|ies)|bag|backpack|sock|socks|glove|gloves)\b/.test(identity)
}

function sanitizeBoombahScene(content) {
  const replacedTextures = new Map()
  const removedTextures = new Set()
  let hiddenParts = 0
  let neutralizedTextures = 0
  content.traverse(child => {
    if (isBoombahLogoPartName(child.name)) {
      child.visible = false
      hiddenParts += 1
      return
    }
    if (!child.isMesh || !child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    let hideMesh = false
    for (const material of materials.filter(Boolean)) {
      if (isBoombahLogoPartName(material.name)) {
        hideMesh = true
        continue
      }
      for (const slot of ['map', 'alphaMap', 'emissiveMap']) {
        const texture = material[slot]
        if (!texture || !isBoombahBrandingName(texture.name)) continue
        removedTextures.add(texture)
        if (slot === 'map') {
          let replacement = replacedTextures.get(texture)
          if (!replacement) {
            replacement = neutralVendorTexture(texture.name)
            replacedTextures.set(texture, replacement)
          }
          material.map = replacement
        } else {
          material[slot] = null
        }
        material.needsUpdate = true
        neutralizedTextures += 1
      }
    }
    if (hideMesh) {
      child.visible = false
      hiddenParts += 1
    }
  })
  removedTextures.forEach(texture => texture.dispose?.())
  content.userData.jersevoBrandingCleanup = { hiddenParts, neutralizedTextures }
  return content.userData.jersevoBrandingCleanup
}

const JerseyStage = forwardRef(function JerseyStage({ manifest, design, colors, pattern, text, layers, onStatus }, ref) {
  const hostRef = useRef(null)
  const runtimeRef = useRef(null)
  const renderRef = useRef(() => {})
  const [readyRevision, setReadyRevision] = useState(0)

  useImperativeHandle(ref, () => ({
    rotate(direction = 1) {
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.model.rotation.y += direction * Math.PI / 8
      renderRef.current()
    },
    zoom(direction = 1) {
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.camera.position.multiplyScalar(direction > 0 ? .86 : 1.16)
      renderRef.current()
    },
    reset() {
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.model.rotation.set(0, 0, 0)
      runtime.camera.position.set(0, .1, runtime.frontDirection * runtime.cameraDistance)
      runtime.controls.target.set(0, 0, 0)
      runtime.controls.update()
      renderRef.current()
    },
    view(preset = 'front') {
      const runtime = runtimeRef.current
      if (!runtime) return
      const normalized = String(preset || 'front').toLowerCase()
      runtime.model.rotation.y = normalized === 'back' ? Math.PI : normalized === 'left' ? -Math.PI / 2 : normalized === 'right' ? Math.PI / 2 : 0
      runtime.controls.update()
      renderRef.current()
    },
    capture() {
      return runtimeRef.current?.renderer?.domElement?.toDataURL?.('image/png') || ''
    }
  }), [])

  useEffect(() => {
    if (!manifest || !hostRef.current) return undefined
    let cancelled = false
    const host = hostRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(31, 1, .1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true, powerPreference:'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.minDistance = 7
    controls.maxDistance = 24
    controls.rotateSpeed = .72
    controls.zoomSpeed = .72
    const model = new THREE.Group()
    const decoration = new THREE.Group()
    model.add(decoration)
    scene.add(model)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x555852, 1.8))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(-4, 7, 8)
    scene.add(key)
    const edge = new THREE.DirectionalLight(0x6fa7ff, 1.1)
    edge.position.set(7, 2, -8)
    scene.add(edge)
    const palette = new THREE.DataTexture(paletteBytes(manifest, colors), 256, 1, THREE.RGBAFormat)
    palette.minFilter = THREE.NearestFilter
    palette.magFilter = THREE.NearestFilter
    palette.generateMipmaps = false
    palette.colorSpace = THREE.NoColorSpace
    palette.needsUpdate = true
    const patternFallback = emptyPatternTexture()
    const personalizationFallback = emptyPatternTexture()
    const render = () => renderer.render(scene, camera)
    renderRef.current = render
    controls.addEventListener('change', render)
    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    async function start() {
      try {
        onStatus?.('loading')
        const selected = selectedBoombahDesign(manifest, design)
        let parsed = null
        let dimensions = null
        const partMeshes = new Map()
        let frontDirection = 1
        if (manifestIsBoombah(manifest)) {
          if (!selected?.model?.uri) throw new Error('The selected Boombah model is unavailable.')
          const gltfLoader = new GLTFLoader()
          const dracoLoader = new DRACOLoader()
          dracoLoader.setDecoderPath('/designer/draco/')
          dracoLoader.setDecoderConfig({ type:'js' })
          gltfLoader.setDRACOLoader(dracoLoader)
          const gltf = await gltfLoader.loadAsync(assetUrl(selected.model.uri, manifest))
          if (cancelled) return
          const content = gltf.scene
          sanitizeBoombahScene(content)
          const sourceBox = new THREE.Box3().setFromObject(content)
          const sourceSize = sourceBox.getSize(new THREE.Vector3())
          const scale = 5.25 / Math.max(sourceSize.y, sourceSize.x, sourceSize.z, .001)
          content.scale.setScalar(scale)
          const scaledBox = new THREE.Box3().setFromObject(content)
          const center = scaledBox.getCenter(new THREE.Vector3())
          content.position.sub(center)
          scaledBox.setFromObject(content)
          const scaledSize = scaledBox.getSize(new THREE.Vector3())
          dimensions = [scaledSize.x, scaledSize.y, scaledSize.z]
          content.traverse(child => {
            if (!child.isMesh || child.visible === false) return
            child.castShadow = true
            child.receiveShadow = true
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            materials.filter(Boolean).forEach(material => { material.side = THREE.DoubleSide; material.roughness = .78 })
            partMeshes.set(child.name || `mesh-${partMeshes.size}`, child)
          })
          model.add(content)
          dracoLoader.dispose()
        } else {
          const response = await fetch(assetUrl(manifest.model.uri, manifest), { cache:'force-cache' })
          if (!response.ok) throw new Error(`Model request failed (${response.status}).`)
          parsed = parseMirl(await response.arrayBuffer())
          if (cancelled) return
          for (const part of parsed.parts) {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
            geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2))
            geometry.computeVertexNormals()
            geometry.computeBoundingBox()
            geometry.computeBoundingSphere()
            const material = new THREE.MeshStandardMaterial({ color:0x292c29, roughness:.78, side:THREE.DoubleSide })
            const mesh = new THREE.Mesh(geometry, material)
            mesh.name = part.name
            model.add(mesh)
            partMeshes.set(part.name, mesh)
          }
          const frontPart = parsed.parts.find(part => /front/i.test(part.name))
          const backPart = parsed.parts.find(part => /^back/i.test(part.name))
          frontDirection = averageZ(frontPart) >= averageZ(backPart) ? 1 : -1
          dimensions = parsed.dimensions
        }
        const cameraDistance = Math.max(...dimensions) * (manifestIsBoombah(manifest) ? 1.92 : 2.08)
        controls.minDistance = Math.max(2.4, cameraDistance * .52)
        controls.maxDistance = Math.max(16, cameraDistance * 2.6)
        camera.position.set(0, .1, frontDirection * cameraDistance)
        controls.target.set(0, 0, 0)
        controls.update()
        const floor = new THREE.Mesh(
          new THREE.CircleGeometry(dimensions[0] * .42, 64),
          new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:.13, depthWrite:false })
        )
        floor.rotation.x = -Math.PI / 2
        floor.position.set(0, -dimensions[1] / 2 - .08, 0)
        scene.add(floor)
        runtimeRef.current = { scene, camera, renderer, controls, model, decoration, palette, patternFallback, personalizationFallback, patternTexture:null, layerTextures:new Map(), parsed, dimensions, partMeshes, frontDirection, cameraDistance, floor, boombah:manifestIsBoombah(manifest) }
        setReadyRevision(value => value + 1)
        onStatus?.('ready')
        render()
      } catch (error) {
        if (!cancelled) {
          console.error(error)
          onStatus?.('error')
        }
      }
    }
    start()
    return () => {
      cancelled = true
      observer.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      disposeObject(scene)
      palette.dispose()
      runtimeRef.current?.patternTexture?.dispose?.()
      disposeLayerTextures(runtimeRef.current?.layerTextures)
      patternFallback.dispose()
      personalizationFallback.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      runtimeRef.current = null
    }
  }, [manifest, design, onStatus])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !manifest || runtime.boombah) return
    runtime.palette.image.data.set(paletteBytes(manifest, colors))
    runtime.palette.needsUpdate = true
    renderRef.current()
  }, [manifest, colors, readyRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    const selected = manifest?.designs?.find(item => item.slug === design || item.id === design)
    if (!runtime || !selected) return undefined
    let cancelled = false
    if (runtime.boombah) {
      loadBoombahTexture(selected, colors, manifest).then(texture => {
        if (cancelled) { texture?.dispose?.(); return }
        const allMeshes = [...runtime.partMeshes.values()]
        const targetNames = new Set((selected.colorZones || []).filter(zone => zone.editable !== false && !zone.removed).map(zone => String(zone.mesh || '')).filter(Boolean))
        const garmentMeshes = allMeshes.filter(mesh => targetNames.has(String(mesh?.name || '')))
        const fallbackMeshes = allMeshes.filter(mesh => /-(?:main|alter|outer|shell)$/i.test(String(mesh?.name || '')) && !isBoombahLogoPartName(mesh?.name))
        for (const mesh of (garmentMeshes.length ? garmentMeshes : fallbackMeshes.length ? fallbackMeshes : allMeshes.filter(mesh => !isBoombahLogoPartName(mesh?.name)))) {
          if (!mesh?.isMesh || !mesh.material) continue
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.forEach(material => {
            material.map = texture
            material.color?.set?.(0xffffff)
            material.needsUpdate = true
          })
        }
        runtime.garmentTexture?.dispose?.()
        runtime.garmentTexture = texture
        renderRef.current()
      }).catch(error => { if (!cancelled) console.error('Boombah template load failed', error) })
      return () => { cancelled = true }
    }
    const loader = new THREE.TextureLoader()
    Promise.all([...runtime.partMeshes].map(async ([name, mesh]) => {
      const uri = matchMirlTexture(name, selected.textures)
      if (!uri) return
      const mask = await loader.loadAsync(assetUrl(uri, manifest))
      if (cancelled) { mask.dispose(); return }
      const previous = mesh.material
       mesh.material = maskMaterial(mask, runtime.palette, runtime.patternFallback, runtime.personalizationFallback)
      previous?.userData?.maskMap?.dispose?.()
      previous?.dispose?.()
    })).then(() => {
      if (cancelled) return
      // Material replacement is asynchronous; re-bind the already-created
      // composited layer maps after every design/palette update.
      applyOwayoLayers(runtime, runtime.layerTextures)
      renderRef.current()
    }).catch(error => console.error('Design texture load failed', error))
    return () => { cancelled = true }
  }, [manifest, design, colors, readyRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || runtime.boombah || !manifest) return undefined
    let cancelled = false
    const selectedPattern = manifest.patterns?.find(item => item.slug === pattern?.slug || item.id === pattern?.id)
    const apply = texture => {
      if (cancelled) { texture?.dispose?.(); return }
      const previous = runtime.patternTexture
      runtime.patternTexture = texture || null
      for (const mesh of runtime.partMeshes.values()) {
        const material = mesh.material
        if (!material?.uniforms?.patternMap) continue
        material.uniforms.patternMap.value = texture || runtime.patternFallback
        material.uniforms.patternEnabled.value = texture && selectedPattern ? 1 : 0
        material.uniforms.patternIndex.value = selectedPattern ? patternTargetIndex(manifest, pattern?.colorCode || 'A') : -1
        material.uniforms.patternOpacity.value = selectedPattern ? Math.max(0, Math.min(1, Number(pattern?.opacity ?? .82))) : 0
        material.uniforms.patternScale.value = selectedPattern ? 2.2 / Math.max(.4, Math.min(2.4, Number(pattern?.scale || 1))) : 1
        material.needsUpdate = true
      }
      if (previous && previous !== texture) previous.dispose?.()
      renderRef.current()
    }
    if (!selectedPattern) { apply(null); return () => { cancelled = true } }
    loadOwayoPatternTexture(selectedPattern, colors, pattern?.colorCode || 'A', manifest)
      .then(apply)
      .catch(error => { if (!cancelled) console.error('Pattern texture load failed', error); apply(null) })
    return () => { cancelled = true }
  }, [manifest, design, colors, pattern, readyRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return undefined
    let cancelled = false
    const { decoration, dimensions, frontDirection } = runtime
    while (decoration.children.length) {
      const child = decoration.children[0]
      decoration.remove(child)
      disposeObject(child)
    }
    const height = dimensions[1]
    const selected = manifest?.designs?.find(item => item.slug === design || item.id === design)
    const normalizedLayers = migrateDesignerLayers({ layerVersion:1, layers })
    console.debug('[designer-layer-debug]', JSON.stringify({ text, normalizedLayers, surfaces:normalizedLayers.map(layer => [layer.kind, layer.placement, owayoPlacementSurface(layer.placement)]) }))
    const showGarmentPersonalization = supportsBoombahGarmentPersonalization(manifest, selected)
    if (!showGarmentPersonalization) {
      applyOwayoLayers(runtime, new Map())
      renderRef.current()
      return undefined
    }
    buildOwayoLayerTextures(text, normalizedLayers).then(textures => {
      if (cancelled) { disposeLayerTextures(textures); return }
      if (!runtime.boombah) {
        applyOwayoLayers(runtime, textures)
        renderRef.current()
        return
      }
      // Legacy teamwear models do not expose a validated garment UV contract.
      // Composite each surface into one bounded plane so every independent
      // name, number and logo still appears without z-fighting.
      const frontZ = frontDirection > 0 ? dimensions[2] / 2 + .08 : -dimensions[2] / 2 - .08
      const backZ = -frontZ
      const planeSize = Math.min(3.35, Math.max(2.2, dimensions[0] * .72))
      for (const [surface, texture] of textures) {
        const sleeve = surface === 'left-sleeve' || surface === 'right-sleeve'
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(sleeve ? planeSize * .52 : planeSize, sleeve ? planeSize * .52 : planeSize),
          new THREE.MeshBasicMaterial({ map:texture, transparent:true, depthWrite:false, side:THREE.DoubleSide })
        )
        if (surface === 'front') {
          plane.position.set(0, height * .02, frontZ)
          plane.rotation.y = frontDirection > 0 ? 0 : Math.PI
        } else if (surface === 'back') {
          plane.position.set(0, height * .02, backZ)
          plane.rotation.y = frontDirection > 0 ? Math.PI : 0
        } else {
          const side = surface === 'left-sleeve' ? -1 : 1
          plane.position.set(side * dimensions[0] * .48, height * .13, 0)
          plane.rotation.y = side * Math.PI / 2
        }
        decoration.add(plane)
      }
      renderRef.current()
    }).catch(error => { if (!cancelled) console.error('Personalization layer preview failed', error) })
    return () => {
      cancelled = true
    }
  }, [manifest, design, text, layers, readyRevision])

  return <div className="designer-stage__canvas" ref={hostRef} role="img" aria-label="Interactive 3D preview of the custom jersey" />
})

function DesignPanel({ manifest, catalog, owayoCatalog, mockupCatalog, owayoAvailable, state, update, onProviderChange, onProductChange, onOwayoProductChange, designerConfig }) {
  const [showAll, setShowAll] = useState(false)
  const [familyQuery, setFamilyQuery] = useState('')
  const [mockupCategory, setMockupCategory] = useState('all')
  const [showAllMockups, setShowAllMockups] = useState(false)
  const allowedDesignIds = Array.isArray(designerConfig?.allowedDesignIds) ? designerConfig.allowedDesignIds : []
  const allowedStyleCodes = Array.isArray(designerConfig?.allowedStyleCodes) ? designerConfig.allowedStyleCodes : []
  const allowedDesign = item => !allowedDesignIds.length || allowedDesignIds.includes(item.id) || allowedDesignIds.includes(item.slug)
  const allowedStyle = style => !allowedStyleCodes.length || allowedStyleCodes.includes(style.code)
  const filteredDesigns = (manifest.designs || []).filter(allowedDesign).filter(item => !manifestIsBoombah(manifest) || !state.styleCode || item.styleCode === state.styleCode)
  const designs = showAll ? filteredDesigns : filteredDesigns.slice(0, 12)
  const currentProduct = catalog?.products?.find(item => item.id === state.productId)
  const currentOwayoProduct = owayoCatalog?.products?.find(item => item.id === state.productId)
  const availableOwayoGroups = (owayoCatalog?.groups?.length
    ? owayoCatalog.groups
    : [...new Map((owayoCatalog?.products || []).map(product => [product.group || product.sport || 'catalog', { id:product.group || product.sport || 'catalog', label:product.groupLabel || product.sportLabel || 'Catalog' }])).values()]
  )
  const [owayoGroup, setOwayoGroup] = useState(currentOwayoProduct?.group || availableOwayoGroups[0]?.id || 'cycling')
  useEffect(() => {
    if (currentOwayoProduct?.group) setOwayoGroup(currentOwayoProduct.group)
  }, [currentOwayoProduct?.group])
  const normalizedFamilyQuery = familyQuery.trim().toLowerCase()
  const visibleOwayoProducts = (owayoCatalog?.products || [])
    .filter(product => (product.group || product.sport) === owayoGroup)
    .filter(product => !normalizedFamilyQuery || [product.title, product.sportLabel, product.groupLabel, product.id].filter(Boolean).join(' ').toLowerCase().includes(normalizedFamilyQuery))
  const activeOwayoGroup = availableOwayoGroups.find(group => group.id === owayoGroup)
  const styles = manifestIsBoombah(manifest) ? (manifest.product.styles || []) : []
  const mockupEntries = Array.isArray(mockupCatalog?.entries) ? mockupCatalog.entries : []
  const mockupCategories = [...new Set(mockupEntries.map(entry => entry.category).filter(Boolean))]
  const filteredMockupEntries = mockupCategory === 'all'
    ? mockupEntries
    : mockupEntries.filter(entry => entry.category === mockupCategory)
  const visibleMockupEntries = showAllMockups ? filteredMockupEntries : filteredMockupEntries.slice(0, 6)
  return <div className="designer-panel designer-panel--design">
    <div className="designer-library-switch" aria-label="Designer library">
      <div className="designer-library-switch__head"><span>Design library</span><small>{manifestIsBoombah(manifest) ? 'Teamwear 3D' : `${currentOwayoProduct?.groupLabel || currentOwayoProduct?.sportLabel || 'Sportswear'} 3D`}</small></div>
      <div className="designer-library-switch__providers">
        <button type="button" disabled={!owayoAvailable || Boolean(state.listingId)} className={!manifestIsBoombah(manifest) ? 'is-active' : ''} onClick={() => onProviderChange?.('owayo')}>Sportswear</button>
        <button type="button" disabled={!catalog?.products?.length || Boolean(state.listingId)} className={manifestIsBoombah(manifest) ? 'is-active' : ''} onClick={() => onProviderChange?.('boombah')}>Teamwear</button>
      </div>
      {manifestIsBoombah(manifest) && catalog?.products?.length > 0 && <>
        <label className="designer-library-switch__field"><span>Sport {state.listingId && <small>· listing locked</small>}</span><select disabled={Boolean(state.listingId)} value={state.productId} onChange={event => onProductChange?.(event.target.value)}>{catalog.products.map(product => <option key={product.id} value={product.id}>{product.sport} · {stripBoombahBrandingText(product.name)}</option>)}</select></label>
        {styles.length > 0 && <label className="designer-library-switch__field"><span>Garment cut</span><select value={state.styleCode || styles.find(allowedStyle)?.code || styles[0].code} onChange={event => update(current => ({ ...current, styleCode:event.target.value, design:manifest.designs.find(item => allowedDesign(item) && item.styleCode === event.target.value)?.id || current.design }))}>{styles.filter(allowedStyle).map(style => <option key={`${style.section}-${style.code}`} value={style.code}>{stripBoombahBrandingText(style.name)}</option>)}</select></label>}
      </>}
      {!manifestIsBoombah(manifest) && owayoCatalog?.products?.length > 0 && <div className="designer-owayo-families" aria-label="Sportswear garment families">
        <span className="designer-library-switch__field-label">Sport catalogue</span>
        <div className="designer-owayo-families__groups" role="tablist" aria-label="Sport catalogue">
          {availableOwayoGroups.map(group => <button type="button" role="tab" aria-selected={group.id === owayoGroup} key={group.id} className={group.id === owayoGroup ? 'is-active' : ''} onClick={() => setOwayoGroup(group.id)}><span>{group.label}</span><small>{group.live ?? (owayoCatalog.products || []).filter(product => product.group === group.id && product.assetsReady).length}/{group.products ?? (owayoCatalog.products || []).filter(product => product.group === group.id).length}</small></button>)}
        </div>
        <span className="designer-library-switch__field-label">{activeOwayoGroup?.label || 'Garment'} models</span>
        <label className="designer-library-switch__search">
          <span className="sr-only">Search garment models</span>
          <input type="search" value={familyQuery} onChange={event => setFamilyQuery(event.target.value)} placeholder="Search model or fit…" aria-label="Search garment models" />
        </label>
        <div className="designer-owayo-families__list">
          {visibleOwayoProducts.map(product => <button type="button" key={product.id} disabled={!product.assetsReady || Boolean(state.listingId)} className={`${product.assetsReady ? 'is-live' : ''}${state.productId === product.id ? ' is-active' : ''}`} title={product.assetsReady ? `${product.designCount} designs · ${product.sizeCount} sizes` : 'Exact model assets are being synchronized'} onClick={() => product.assetsReady && onOwayoProductChange?.(product.id)}><span>{product.title.replace(/^Jersevo\s+Custom\s+/i, '')}</span><small>{product.assetsReady ? `${product.designCount} designs · ${product.sizeCount} sizes` : 'Syncing exact model'}</small></button>)}
          {!visibleOwayoProducts.length && <p className="designer-library-empty">No garment models match that search.</p>}
        </div>
      </div>}
      {(currentProduct || currentOwayoProduct) && <p className="designer-library-switch__note">{manifestIsBoombah(manifest) ? currentProduct?.designs : currentOwayoProduct?.designCount} mirrored templates · exact model loads on selection</p>}
    </div>
    {mockupEntries.length > 0 && <section className="designer-mockup-reference" aria-label="Mockup reference library">
      <div className="designer-mockup-reference__head"><span>3DMockups catalogue reference</span><small>{mockupEntries.length} public bases · {mockupEntries.filter(entry => (entry.adapter?.status || entry.assetStatus) === 'mapped').length} mapped to Jersevo models</small></div>
      <label className="designer-library-switch__field designer-mockup-reference__filter"><span>Browse category</span><select value={mockupCategory} onChange={event => { setMockupCategory(event.target.value); setShowAllMockups(false) }}><option value="all">All categories</option>{mockupCategories.map(category => <option key={category} value={category}>{category.replace(/-/g, ' ')}</option>)}</select></label>
      <div className="designer-mockup-reference__grid">
        {visibleMockupEntries.map(entry => {
          const mapped = (entry.adapter?.status || entry.assetStatus) === 'mapped' && entry.adapter?.productId
          const provider = entry.adapter?.provider
          const areas = Array.isArray(entry.sourcePrintAreas) && entry.sourcePrintAreas.length ? entry.sourcePrintAreas : entry.printAreas
          const detail = [entry.material, entry.sizes?.length ? `${entry.sizes.length} sizes` : '', areas?.length ? `${areas.length} print areas` : ''].filter(Boolean).join(' · ')
          return <button type="button" key={entry.id} disabled={Boolean(state.listingId) || !mapped} title={mapped ? entry.adapter?.mappingNote || entry.mappingNote || 'Open the mapped Jersevo model' : entry.mappingNote || 'Reference metadata only; a licensed Jersevo model is not available yet'} onClick={() => provider === 'owayo' ? onOwayoProductChange?.(entry.adapter.productId) : onProductChange?.(entry.adapter.productId)}>
            {entry.preview ? <img src={entry.preview} alt="" loading="lazy" decoding="async"/> : <span className="designer-mockup-reference__placeholder">3D</span>}
            <span><strong>{entry.title}</strong><small>{mapped ? `Jersevo ${provider}` : 'Reference only'}{detail ? ` · ${detail}` : ''}</small></span>
          </button>
        })}
      </div>
      {filteredMockupEntries.length > 6 && <button type="button" className="designer-design-more designer-mockup-reference__more" onClick={() => setShowAllMockups(value => !value)}>{showAllMockups ? 'Show featured references' : `Show all ${filteredMockupEntries.length} references`}</button>}
      <p className="designer-library-switch__note">Public catalog metadata is used for discovery. Models, textures and templates come from Jersevo-owned or separately licensed manifests.</p>
    </section>}
    <div className="designer-panel__intro"><h2>Choose a base design</h2><p>{manifestIsBoombah(manifest) ? 'Pick a mirrored uniform template. Your colors, name, number and logo stay in the Jersevo handoff.' : 'The garment cut stays fixed. Switch artwork without reloading the 3D stage.'}</p></div>
    <div className="designer-design-grid">
      {designs.map(item => <button type="button" className={state.design === item.slug || state.design === item.id ? 'is-active' : ''} key={item.slug || item.id} onClick={() => update(current => ({ ...current, design:item.slug || item.id, styleCode:item.styleCode || current.styleCode, colors:{ ...current.colors, ...(item.defaultColors || {}) } }))}>
        <span className="designer-design-grid__art"><img src={assetUrl(item.preview, manifest)} alt="" loading="lazy" decoding="async"/></span>
        <span>{item.name}</span>{(state.design === item.slug || state.design === item.id) && <Check size={15}/>}
      </button>)}
    </div>
    {!designs.length && <p className="designer-library-empty">No active mirrored templates match this cut.</p>}
    {filteredDesigns.length > 12 && <button type="button" className="designer-design-more" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show featured designs' : `Show all ${filteredDesigns.length} designs`}</button>}
  </div>
}

function ColorPanel({ manifest, state, update }) {
  const active = manifest.designs.find(item => item.slug === state.design || item.id === state.design)
  const codes = (manifestIsBoombah(manifest)
    ? (active?.colorZones || []).filter(zone => zone.editable !== false).map(zone => zone.code)
    : (active?.baseColors?.length ? active.baseColors : ['A','B','C'])
  ).slice(0, 6)
  const label = code => manifestIsBoombah(manifest)
    ? (active?.colorZones || []).find(zone => zone.code === code)?.name || `Color ${code}`
    : manifest.product.colorCodes.find(item => item.colorCode === code)?.Farbname || `Color ${code}`
  return <div className="designer-panel designer-panel--colors">
    <div className="designer-panel__intro"><h2>Build your color story</h2><p>{manifestIsBoombah(manifest) ? 'Tune every editable color zone on the mirrored teamwear template.' : 'Each swatch updates the encoded material mask on the live garment.'}</p></div>
    {codes.map(code => <section className="designer-color-row" key={code}>
      <div><span className="designer-color-row__current" style={{ backgroundColor:state.colors[code] || '#F8F8F4' }}/><strong>{label(code)}</strong><small>{state.colors[code] || '#F8F8F4'}</small></div>
      <div className="designer-swatches">{COLOR_SWATCHES.map(color => <button key={color} type="button" style={{ '--designer-swatch':color }} className={(state.colors[code] || '').toUpperCase() === color.toUpperCase() ? 'is-active' : ''} aria-label={`Set ${label(code)} to ${color}`} onClick={() => update(current => ({ ...current, colors:{ ...current.colors, [code]:color } }))}><span/></button>)}</div>
    </section>)}
  </div>
}

function PatternPanel({ manifest, state, update, designerConfig }) {
  const [category, setCategory] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const patterns = Array.isArray(manifest?.patterns) ? manifest.patterns : []
  const categories = Array.isArray(manifest?.patternCategories) ? manifest.patternCategories : []
  const filtered = category === 'all'
    ? patterns
    : patterns.filter(pattern => (pattern.categoryKeys || []).includes(category))
  const visible = showAll ? filtered : filtered.slice(0, 18)
  const active = manifest?.designs?.find(item => item.slug === state.design || item.id === state.design)
  const colorCodes = (active?.baseColors?.length ? active.baseColors : ['A', 'B', 'C']).filter(code => manifest?.product?.colorCodes?.some(item => item.colorCode === code))
  const selected = patterns.find(pattern => pattern.slug === state.pattern?.slug || pattern.id === state.pattern?.id)
  const setPattern = patch => update(current => ({ ...current, pattern:{ ...(current.pattern || {}), ...patch } }))
  if (manifestIsBoombah(manifest)) {
    const allowedDesignIds = Array.isArray(designerConfig?.allowedDesignIds) ? designerConfig.allowedDesignIds : []
    const allowedStyleCodes = Array.isArray(designerConfig?.allowedStyleCodes) ? designerConfig.allowedStyleCodes : []
    const allowed = item => (!allowedDesignIds.length || allowedDesignIds.includes(item.id) || allowedDesignIds.includes(item.slug))
      && (!allowedStyleCodes.length || allowedStyleCodes.includes(item.styleCode))
    const templates = state.styleCode
      ? (manifest.designs || []).filter(item => item.styleCode === state.styleCode).filter(allowed)
      : (manifest.designs || []).filter(allowed)
    const visibleTemplates = showAll ? templates : templates.slice(0, 18)
    const chooseTemplate = item => update(current => ({
      ...current,
      design:item.id || item.slug,
      styleCode:item.styleCode || current.styleCode,
      colors:{ ...current.colors, ...(item.defaultColors || {}) },
      pattern:{ ...current.pattern, id:'', slug:'' }
    }))
    return <div className="designer-panel designer-panel--patterns">
      <div className="designer-panel__intro"><h2>Choose an artwork pattern</h2><p>These templates belong to the selected garment cut. Pick one here, then refine its editable colors without leaving this editor.</p></div>
      <div className="designer-pattern-grid">
        {visibleTemplates.map(item => <button type="button" key={item.id || item.slug} className={(state.design === item.id || state.design === item.slug) ? 'is-active' : ''} onClick={() => chooseTemplate(item)}><span><img src={assetUrl(item.preview, manifest)} alt="" loading="lazy" decoding="async"/></span><strong>{item.name}</strong><small>{stripBoombahBrandingText(item.styleName || item.garment || '')}</small>{(state.design === item.id || state.design === item.slug) && <Check size={14}/>}</button>)}
      </div>
      {!templates.length && <p className="designer-library-empty">No synchronized artwork templates match this garment cut.</p>}
      {templates.length > 18 && <button type="button" className="designer-design-more" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show featured patterns' : `Show all ${templates.length} patterns`}</button>}
    </div>
  }
  if (!patterns.length) return <div className="designer-panel designer-panel--patterns"><div className="designer-panel__intro"><h2>Patterns are unavailable</h2><p>The local Owayo pattern catalogue could not be loaded. Refresh the designer and try again.</p></div></div>
  return <div className="designer-panel designer-panel--patterns">
    <div className="designer-panel__intro"><h2>Add a garment pattern</h2><p>These are mirrored Owayo pattern masks. Choose the color region that should carry the pattern, then adjust its scale and strength.</p></div>
    <div className="designer-pattern-controls">
      <label className="designer-library-switch__field"><span>Pattern family</span><select value={category} onChange={event => { setCategory(event.target.value); setShowAll(false) }}><option value="all">All pattern families</option>{categories.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className="designer-library-switch__field"><span>Apply to garment color</span><select value={state.pattern?.colorCode || colorCodes[0] || 'A'} onChange={event => setPattern({ colorCode:event.target.value })}>{colorCodes.map(code => <option key={code} value={code}>{manifest.product.colorCodes.find(item => item.colorCode === code)?.Farbname || `Color ${code}`}</option>)}</select></label>
    </div>
    {selected && <div className="designer-pattern-selected"><img src={assetUrl(selected.preview, manifest)} alt=""/><div><strong>{selected.name}</strong><small>{selected.categoryNames?.join(' · ')}</small></div><button type="button" onClick={() => setPattern({ id:'', slug:'' })}>Clear</button></div>}
    <div className="designer-pattern-grid">
      {visible.map(item => <button type="button" key={item.id} className={(state.pattern?.slug === item.slug || state.pattern?.id === item.id) ? 'is-active' : ''} onClick={() => setPattern({ id:item.id, slug:item.slug })}><span><img src={assetUrl(item.preview, manifest)} alt="" loading="lazy" decoding="async"/></span><strong>{item.name}</strong>{(state.pattern?.slug === item.slug || state.pattern?.id === item.id) && <Check size={14}/>}</button>)}
    </div>
    {filtered.length > 18 && <button type="button" className="designer-design-more" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show featured patterns' : `Show all ${filtered.length} patterns`}</button>}
    {selected && <>
      <label className="designer-range"><span>Pattern scale <strong>{Math.round(Number(state.pattern?.scale || 1) * 100)}%</strong></span><input type="range" min="0.4" max="2.4" step="0.1" value={state.pattern?.scale || 1} onChange={event => setPattern({ scale:Number(event.target.value) })}/></label>
      <label className="designer-range"><span>Pattern strength <strong>{Math.round(Number(state.pattern?.opacity ?? .82) * 100)}%</strong></span><input type="range" min="0.2" max="1" step="0.05" value={state.pattern?.opacity ?? .82} onChange={event => setPattern({ opacity:Number(event.target.value) })}/></label>
    </>}
  </div>
}

const placementValue = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(-1, Math.min(1, number)) : fallback
}

const placementScale = (value, min, max) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : 1
}

function PlacementPad({ value, onChange, label, preview, previewImage = '', scaleMin = .55, scaleMax = 1.8 }) {
  const padRef = useRef(null)
  const x = placementValue(value?.x)
  const y = placementValue(value?.y)
  const scale = placementScale(value?.scale, scaleMin, scaleMax)
  const updateFromPointer = useCallback(event => {
    const rect = padRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect?.height) return
    // The visual safe zone spans 72% x 68% of the pad. Map that area back to
    // normalized production coordinates so touch, mouse and keyboard agree.
    const nextX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) / .36))
    const nextY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) / .34))
    onChange({ x:Number(nextX.toFixed(3)), y:Number(nextY.toFixed(3)) })
  }, [onChange])
  const changeScale = next => onChange({ scale:Number(placementScale(next, scaleMin, scaleMax).toFixed(2)) })
  const handleKeyDown = event => {
    const movement = event.shiftKey ? .1 : .025
    const directions = {
      ArrowLeft:{ x:placementValue(x - movement) },
      ArrowRight:{ x:placementValue(x + movement) },
      ArrowUp:{ y:placementValue(y - movement) },
      ArrowDown:{ y:placementValue(y + movement) }
    }
    const patch = directions[event.key]
    if (!patch && event.key !== 'Home') return
    event.preventDefault()
    onChange(event.key === 'Home' ? { x:0, y:0 } : patch)
  }
  return <section className="designer-placement" aria-label={`${label} placement controls`}>
    <div className="designer-placement__head"><span><Move size={14}/> Drag to position</span><strong>{Math.round((x + 1) * 50)} · {Math.round((y + 1) * 50)}</strong></div>
    <div
      ref={padRef}
      className="designer-placement__pad"
      role="group"
      tabIndex="0"
      aria-label={`Position ${label}. Drag, use arrow keys, or press Home to center.`}
      onKeyDown={handleKeyDown}
      onPointerDown={event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        updateFromPointer(event)
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event)
      }}
    >
      <span className="designer-placement__safe" aria-hidden="true"><i>Safe print area</i></span>
      <span
        className={`designer-placement__handle${previewImage ? ' has-image' : ''}`}
        style={{ left:`${50 + x * 36}%`, top:`${50 + y * 34}%`, '--placement-preview-scale':Math.max(.7, Math.min(1.35, scale)) }}
        aria-hidden="true"
      >{previewImage ? <img src={previewImage} alt=""/> : <strong>{preview}</strong>}<Move size={13}/></span>
    </div>
    <div className="designer-placement__size">
      <span>Size</span>
      <button type="button" aria-label={`Make ${label} smaller`} onClick={() => changeScale(scale - .05)}>−</button>
      <input type="range" aria-label={`${label} size`} min={scaleMin} max={scaleMax} step="0.05" value={scale} onChange={event => changeScale(event.target.value)}/>
      <button type="button" aria-label={`Make ${label} larger`} onClick={() => changeScale(scale + .05)}>+</button>
      <output>{Math.round(scale * 100)}%</output>
    </div>
    <div className="designer-placement__foot"><small>Drag anywhere in the box. Arrow keys make fine adjustments.</small><button type="button" onClick={() => onChange({ x:0, y:0, scale:1, rotation:0 })}>Reset</button></div>
  </section>
}

function PrintAreaOptions() {
  return OWAYO_PRINT_AREA_GROUPS.map(group => <optgroup key={group.label} label={group.label}>
    {group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </optgroup>)
}

function printAreaLabel(placement) {
  return OWAYO_PRINT_AREA_GROUPS.flatMap(group => group.options).find(option => option.value === placement)?.label || 'Print area'
}

function patchDesignerLayer(layer, patch = {}) {
  return newDesignerLayer(layer.kind, patch.placement || layer.placement, { ...layer, ...patch, id:layer.id })
}

function LayerKindIcon({ kind, size = 15 }) {
  if (kind === 'number') return <Hash size={size}/>
  if (kind === 'team') return <UsersRound size={size}/>
  if (kind === 'logo' || kind === 'artwork') return <ImageIcon size={size}/>
  return <Type size={size}/>
}

function TextPanel({ state, update }) {
  const preview = resolveOwayoPreviewText(state.text, state.roster)
  const textLayers = migrateDesignerLayers(state).filter(layer => !['logo', 'artwork'].includes(layer.kind))
  const [activeLayerId, setActiveLayerId] = useState(() => textLayers[0]?.id || '')
  const activeLayer = textLayers.find(layer => layer.id === activeLayerId) || textLayers[0] || null
  useEffect(() => {
    if (!textLayers.length) { if (activeLayerId) setActiveLayerId(''); return }
    if (!textLayers.some(layer => layer.id === activeLayerId)) setActiveLayerId(textLayers[0].id)
  }, [activeLayerId, textLayers])
  const setText = patch => update(current => {
    const text = { ...current.text, ...patch }
    const first = current.roster?.[0]
    const changesName = Object.prototype.hasOwnProperty.call(patch, 'name')
    const changesNumber = Object.prototype.hasOwnProperty.call(patch, 'number')
    const enablingSameText = patch.sameOnAll === true
    const roster = first && (changesName || changesNumber || enablingSameText)
      ? current.roster.map((player, index) => {
          const source = index === 0 ? { ...first, ...patch } : player
          if (!text.sameOnAll && index !== 0) return player
          return {
            ...player,
            ...(changesName || enablingSameText ? { name:source.name || '' } : {}),
            ...(changesNumber || enablingSameText ? { number:source.number || '' } : {})
          }
        })
      : current.roster
    return { ...current, text, roster }
  })
  const addLayer = kind => {
    const currentLayers = migrateDesignerLayers(state)
    if (currentLayers.length >= LAYER_LIMIT) return
    const sameKindCount = currentLayers.filter(layer => layer.kind === kind).length
    const suggestions = LAYER_AREA_SUGGESTIONS[kind] || ['front-center']
    const layer = newDesignerLayer(kind, suggestions[sameKindCount % suggestions.length])
    update(current => ({ ...current, layerVersion:1, layers:[...migrateDesignerLayers(current), layer] }))
    setActiveLayerId(layer.id)
  }
  const setLayer = patch => {
    if (!activeLayer) return
    update(current => ({
      ...current,
      layerVersion:1,
      layers:migrateDesignerLayers(current).map(layer => layer.id === activeLayer.id ? patchDesignerLayer(layer, patch) : layer)
    }))
  }
  const removeLayer = layerId => {
    const next = textLayers.filter(layer => layer.id !== layerId)
    update(current => ({ ...current, layerVersion:1, layers:migrateDesignerLayers(current).filter(layer => layer.id !== layerId) }))
    if (activeLayerId === layerId) setActiveLayerId(next[0]?.id || '')
  }
  const previewForLayer = activeLayer?.kind === 'team' ? state.text.team : activeLayer?.kind === 'number' ? preview.number : preview.name
  return <div className="designer-panel designer-panel--text">
    <div className="designer-panel__intro"><h2>Build each text layer</h2><p>Name, number and team marks now move independently. Add repeat placements whenever the garment needs them.</p></div>
    <label className="designer-field"><span>Team name</span><input value={state.text.team} maxLength={24} onChange={event => setText({ team:event.target.value })}/></label>
    <label className="designer-field"><span>Player name <small>Previewing player 1</small></span><input value={preview.name} maxLength={24} onChange={event => setText({ name:event.target.value })}/></label>
    <div className="designer-field-row">
      <label className="designer-field"><span>Number <small>Previewing player 1</small></span><input value={preview.number} inputMode="numeric" maxLength={3} onChange={event => setText({ number:event.target.value.replace(/[^0-9]/g, '') })}/></label>
      <label className="designer-field designer-field--color"><span>Print color</span><input type="color" value={state.text.color} onChange={event => setText({ color:event.target.value })}/><strong>{state.text.color}</strong></label>
    </div>
    <div className="designer-field-row">
      <label className="designer-field"><span>Font</span><select value={state.text.font || 'Barlow Condensed'} onChange={event => setText({ font:event.target.value })}>{OWAYO_PERSONALIZATION_FONTS.map(font => <option key={font} value={font}>{font}</option>)}</select></label>
      <label className="designer-field designer-field--color"><span>Outline</span><input type="color" value={state.text.outlineColor || '#111311'} onChange={event => setText({ outlineColor:event.target.value })}/><strong>{state.text.outlineColor || '#111311'}</strong></label>
    </div>
    <label className="designer-field designer-field--checkbox"><input type="checkbox" checked={Boolean(state.text.sameOnAll)} onChange={event => setText({ sameOnAll:event.target.checked })}/><span>Use player 1's name and number on every item</span></label>
    <section className="designer-layers" aria-label="Text placement layers">
      <div className="designer-layers__head"><span><Layers3 size={16}/><strong>Text layers</strong><small>{textLayers.length} / {LAYER_LIMIT}</small></span></div>
      <div className="designer-layer-add" aria-label="Add a text layer">
        <button type="button" disabled={migrateDesignerLayers(state).length >= LAYER_LIMIT} onClick={() => addLayer('name')}><Type size={14}/> Add name</button>
        <button type="button" disabled={migrateDesignerLayers(state).length >= LAYER_LIMIT} onClick={() => addLayer('number')}><Hash size={14}/> Add number</button>
        <button type="button" disabled={migrateDesignerLayers(state).length >= LAYER_LIMIT} onClick={() => addLayer('team')}><UsersRound size={14}/> Add team</button>
      </div>
      {textLayers.length > 0 ? <div className="designer-layer-list">
        {textLayers.map((layer, index) => <div key={layer.id} className={`designer-layer-list__item${layer.id === activeLayer?.id ? ' is-active' : ''}`}>
          <button type="button" className="designer-layer-list__select" onClick={() => setActiveLayerId(layer.id)} aria-pressed={layer.id === activeLayer?.id}>
            <span><LayerKindIcon kind={layer.kind}/><strong>{LAYER_LABELS[layer.kind]}</strong></span><small>{printAreaLabel(layer.placement)} · {index + 1}</small>
          </button>
          <button type="button" className="designer-layer-list__remove" onClick={() => removeLayer(layer.id)} aria-label={`Remove ${LAYER_LABELS[layer.kind]} layer`}><Trash2 size={14}/></button>
        </div>)}
      </div> : <p className="designer-layer-empty">Add a name, number or team layer to place text on the garment.</p>}
      {activeLayer && <div className="designer-layer-editor" key={activeLayer.id}>
        <div className="designer-layer-editor__title"><span><LayerKindIcon kind={activeLayer.kind}/><strong>{LAYER_LABELS[activeLayer.kind]}</strong></span><small>Independent placement</small></div>
        <label className="designer-field"><span>Print area</span><select value={activeLayer.placement} onChange={event => setLayer({ placement:event.target.value, x:0, y:0 })}><PrintAreaOptions/></select><small>Choose a garment panel, then drag to fine-tune.</small></label>
        <PlacementPad value={activeLayer} onChange={setLayer} label={LAYER_LABELS[activeLayer.kind].toLowerCase()} preview={previewForLayer || (activeLayer.kind === 'number' ? '90' : 'NAME')}/>
        <label className="designer-range"><span>Rotation <strong>{Number(activeLayer.rotation || 0)}°</strong></span><input type="range" min="-30" max="30" step="1" value={activeLayer.rotation || 0} onChange={event => setLayer({ rotation:Number(event.target.value) })}/></label>
      </div>}
    </section>
    <div className="designer-print-note"><CheckCircle2 size={17}/><p>Names and numbers are checked for spelling and safe print placement before production.</p></div>
  </div>
}

function LogoPanel({ state, update }) {
  const [error, setError] = useState('')
  const logoLayers = migrateDesignerLayers(state).filter(layer => layer.kind === 'logo')
  const [activeLayerId, setActiveLayerId] = useState(() => logoLayers[0]?.id || '')
  const activeLayer = logoLayers.find(layer => layer.id === activeLayerId) || logoLayers[0] || null
  useEffect(() => {
    if (!logoLayers.length) { if (activeLayerId) setActiveLayerId(''); return }
    if (!logoLayers.some(layer => layer.id === activeLayerId)) setActiveLayerId(logoLayers[0].id)
  }, [activeLayerId, logoLayers])
  const setLayer = (layerId, patch) => update(current => ({
    ...current,
    layerVersion:1,
    layers:migrateDesignerLayers(current).map(layer => layer.id === layerId ? patchDesignerLayer(layer, patch) : layer)
  }))
  const addLogo = () => {
    const currentLayers = migrateDesignerLayers(state)
    if (currentLayers.length >= LAYER_LIMIT || logoLayers.length >= 8) return
    const suggestions = LAYER_AREA_SUGGESTIONS.logo
    const layer = newDesignerLayer('logo', suggestions[logoLayers.length % suggestions.length])
    update(current => ({ ...current, layerVersion:1, layers:[...migrateDesignerLayers(current), layer] }))
    setError('')
    setActiveLayerId(layer.id)
  }
  const removeLogo = layerId => {
    const next = logoLayers.filter(layer => layer.id !== layerId)
    update(current => ({ ...current, layerVersion:1, layers:migrateDesignerLayers(current).filter(layer => layer.id !== layerId) }))
    setError('')
    if (activeLayerId === layerId) setActiveLayerId(next[0]?.id || '')
  }
  const select = (file, layerId) => {
    if (!file) return
    if (!/^image\/(?:png|jpe?g|webp|svg\+xml)$/i.test(file.type)) { setError('Use a PNG, JPG, WebP or SVG file.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Logo files must be 5 MB or smaller.'); return }
    const reader = new FileReader()
    reader.onload = () => { setError(''); setLayer(layerId, { dataUrl:String(reader.result), name:file.name, consent:false }) }
    reader.onerror = () => setError('That logo could not be read. Choose another file.')
    reader.readAsDataURL(file)
  }
  return <div className="designer-panel designer-panel--logos">
    <div className="designer-panel__intro"><h2>Build each logo layer</h2><p>Every logo has its own file, garment area, position, size and rotation. Add up to eight logo placements.</p></div>
    <section className="designer-layers designer-layers--logos" aria-label="Logo placement layers">
      <div className="designer-layers__head"><span><Layers3 size={16}/><strong>Logo layers</strong><small>{logoLayers.length} / 8</small></span><button type="button" disabled={logoLayers.length >= 8 || migrateDesignerLayers(state).length >= LAYER_LIMIT} onClick={addLogo}><Plus size={14}/> Add logo</button></div>
      {logoLayers.length > 0 ? <div className="designer-layer-list">
        {logoLayers.map((layer, index) => <div key={layer.id} className={`designer-layer-list__item${layer.id === activeLayer?.id ? ' is-active' : ''}`}>
          <button type="button" className="designer-layer-list__select" onClick={() => { setActiveLayerId(layer.id); setError('') }} aria-pressed={layer.id === activeLayer?.id}>
            <span>{layer.dataUrl ? <img src={layer.dataUrl} alt=""/> : <ImageIcon size={15}/>}<strong>{layer.name || `Logo ${index + 1}`}</strong></span><small>{printAreaLabel(layer.placement)}</small>
          </button>
          <button type="button" className="designer-layer-list__remove" onClick={() => removeLogo(layer.id)} aria-label={`Remove logo ${index + 1}`}><Trash2 size={14}/></button>
        </div>)}
      </div> : <div className="designer-layer-empty designer-layer-empty--logo"><ImageIcon size={22}/><p>Add the first logo, then upload and place it independently.</p><button type="button" onClick={addLogo}><Plus size={14}/> Add first logo</button></div>}
      {activeLayer && <div className="designer-layer-editor" key={activeLayer.id}>
        <div className="designer-layer-editor__title"><span><ImageIcon size={15}/><strong>{activeLayer.name || 'New logo'}</strong></span><small>Independent placement</small></div>
        <label className={`designer-logo-drop${activeLayer.dataUrl ? ' has-logo' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); select(event.dataTransfer.files?.[0], activeLayer.id) }}>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => select(event.target.files?.[0], activeLayer.id)}/>
          {activeLayer.dataUrl ? <><img src={activeLayer.dataUrl} alt="Uploaded logo preview"/><span><strong>{activeLayer.name}</strong><small>Click or drop a file to replace this logo</small></span></> : <><Upload size={25}/><span><strong>Upload this logo</strong><small>PNG, JPG, WebP or SVG · up to 5 MB</small></span></>}
        </label>
    {error && <p className="designer-field-error" role="alert">{error}</p>}
        {activeLayer.dataUrl && <>
          <div className="designer-logo-actions"><button type="button" onClick={() => setLayer(activeLayer.id, { dataUrl:'', name:'', consent:false })}><Trash2 size={15}/> Clear file</button><span><Move size={14}/> UV-mapped placement</span></div>
          <label className="designer-field"><span>Print area</span><select value={activeLayer.placement} onChange={event => setLayer(activeLayer.id, { placement:event.target.value, x:0, y:0 })}><PrintAreaOptions/></select><small>Center-front artwork is split cleanly across both zip panels.</small></label>
          <PlacementPad value={activeLayer} onChange={patch => setLayer(activeLayer.id, patch)} label="logo" previewImage={activeLayer.dataUrl} scaleMin={.25} scaleMax={2}/>
          <label className="designer-range"><span>Logo rotation <strong>{Number(activeLayer.rotation || 0)}°</strong></span><input type="range" min="-180" max="180" step="1" value={activeLayer.rotation || 0} onChange={event => setLayer(activeLayer.id, { rotation:Number(event.target.value) })}/></label>
          <label className="designer-consent"><input type="checkbox" checked={Boolean(activeLayer.consent)} onChange={event => setLayer(activeLayer.id, { consent:event.target.checked })}/><span>I own this logo or have permission to use it.</span></label>
        </>}
      </div>}
    </section>
  </div>
}

function ArtworkPanel({ state, update }) {
  const [error, setError] = useState('')
  const artworkLayers = migrateDesignerLayers(state).filter(layer => layer.kind === 'artwork')
  const [activeLayerId, setActiveLayerId] = useState(() => artworkLayers[0]?.id || '')
  const activeLayer = artworkLayers.find(layer => layer.id === activeLayerId) || artworkLayers[0] || null
  useEffect(() => {
    if (!artworkLayers.length) { if (activeLayerId) setActiveLayerId(''); return }
    if (!artworkLayers.some(layer => layer.id === activeLayerId)) setActiveLayerId(artworkLayers[0].id)
  }, [activeLayerId, artworkLayers])
  const setLayer = (layerId, patch) => update(current => ({
    ...current,
    layerVersion:1,
    layers:migrateDesignerLayers(current).map(layer => layer.id === layerId ? patchDesignerLayer(layer, patch) : layer)
  }))
  const addArtwork = () => {
    const currentLayers = migrateDesignerLayers(state)
    if (currentLayers.length >= LAYER_LIMIT || artworkLayers.length >= 8) return
    const layer = newDesignerLayer('artwork', LAYER_AREA_SUGGESTIONS.artwork[artworkLayers.length % LAYER_AREA_SUGGESTIONS.artwork.length])
    update(current => ({ ...current, layerVersion:1, layers:[...migrateDesignerLayers(current), layer] }))
    setError('')
    setActiveLayerId(layer.id)
  }
  const removeArtwork = layerId => {
    const next = artworkLayers.filter(layer => layer.id !== layerId)
    update(current => ({ ...current, layerVersion:1, layers:migrateDesignerLayers(current).filter(layer => layer.id !== layerId) }))
    setError('')
    if (activeLayerId === layerId) setActiveLayerId(next[0]?.id || '')
  }
  const select = (file, layerId) => {
    if (!file) return
    const result = validateMockupAsset({ name:file.name, mime:file.type, bytes:file.size, kind:'artwork' }, { kind:'artwork' })
    if (!result.ok) { setError(result.error); return }
    const reader = new FileReader()
    reader.onload = () => { setError(''); setLayer(layerId, { dataUrl:String(reader.result), name:file.name, consent:false }) }
    reader.onerror = () => setError('That artwork could not be read. Choose another file.')
    reader.readAsDataURL(file)
  }
  return <div className="designer-panel designer-panel--artwork">
    <div className="designer-panel__intro"><h2>Add artwork layers</h2><p>Upload a badge, sponsor mark or graphic and place it on a verified garment panel. The same 3D editor handles artwork, logos and text.</p></div>
    <section className="designer-layers designer-layers--artwork" aria-label="Artwork placement layers">
      <div className="designer-layers__head"><span><Layers3 size={16}/><strong>Artwork layers</strong><small>{artworkLayers.length} / 8</small></span><button type="button" disabled={artworkLayers.length >= 8 || migrateDesignerLayers(state).length >= LAYER_LIMIT} onClick={addArtwork}><Plus size={14}/> Add artwork</button></div>
      {artworkLayers.length > 0 ? <div className="designer-layer-list">
        {artworkLayers.map((layer, index) => <div key={layer.id} className={`designer-layer-list__item${layer.id === activeLayer?.id ? ' is-active' : ''}`}>
          <button type="button" className="designer-layer-list__select" onClick={() => { setActiveLayerId(layer.id); setError('') }} aria-pressed={layer.id === activeLayer?.id}>
            <span>{layer.dataUrl ? <img src={layer.dataUrl} alt=""/> : <ImageIcon size={15}/>}<strong>{layer.name || `Artwork ${index + 1}`}</strong></span><small>{printAreaLabel(layer.placement)}</small>
          </button>
          <button type="button" className="designer-layer-list__remove" onClick={() => removeArtwork(layer.id)} aria-label={`Remove artwork ${index + 1}`}><Trash2 size={14}/></button>
        </div>)}
      </div> : <div className="designer-layer-empty designer-layer-empty--logo"><FileImage size={22}/><p>Add artwork when you want a custom badge, sponsor or graphic beyond the team-name/logo fields.</p><button type="button" onClick={addArtwork}><Plus size={14}/> Add first artwork</button></div>}
      {activeLayer && <div className="designer-layer-editor" key={activeLayer.id}>
        <div className="designer-layer-editor__title"><span><FileImage size={15}/><strong>{activeLayer.name || 'New artwork'}</strong></span><small>Independent placement</small></div>
        <label className={`designer-logo-drop${activeLayer.dataUrl ? ' has-logo' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); select(event.dataTransfer.files?.[0], activeLayer.id) }}>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => select(event.target.files?.[0], activeLayer.id)}/>
          {activeLayer.dataUrl ? <><img src={activeLayer.dataUrl} alt="Uploaded artwork preview"/><span><strong>{activeLayer.name}</strong><small>Click or drop a file to replace this artwork</small></span></> : <><Upload size={25}/><span><strong>Upload artwork</strong><small>PNG, JPG, WebP or SVG · up to 8 MB</small></span></>}
        </label>
        {error && <p className="designer-field-error" role="alert">{error}</p>}
        {activeLayer.dataUrl && <>
          <div className="designer-logo-actions"><button type="button" onClick={() => setLayer(activeLayer.id, { dataUrl:'', name:'', consent:false })}><Trash2 size={15}/> Clear file</button><span><Move size={14}/> UV-mapped placement</span></div>
          <label className="designer-field"><span>Print area</span><select value={activeLayer.placement} onChange={event => setLayer(activeLayer.id, { placement:event.target.value, x:0, y:0 })}><PrintAreaOptions/></select><small>Only the selected panel receives the artwork in the 3D preview.</small></label>
          <PlacementPad value={activeLayer} onChange={patch => setLayer(activeLayer.id, patch)} label="artwork" previewImage={activeLayer.dataUrl} scaleMin={.25} scaleMax={2}/>
          <label className="designer-range"><span>Artwork rotation <strong>{Number(activeLayer.rotation || 0)}°</strong></span><input type="range" min="-180" max="180" step="1" value={activeLayer.rotation || 0} onChange={event => setLayer(activeLayer.id, { rotation:Number(event.target.value) })}/></label>
          <label className="designer-consent"><input type="checkbox" checked={Boolean(activeLayer.consent)} onChange={event => setLayer(activeLayer.id, { consent:event.target.checked })}/><span>I own this artwork or have permission to use it.</span></label>
        </>}
      </div>}
    </section>
    <div className="designer-print-note"><CheckCircle2 size={17}/><p>Artwork is normalized for a private production request; it is not added to the public catalogue.</p></div>
  </div>
}

function Roster({ state, update, sizes }) {
  const visibleSizes = normalizeOwayoSizeOptions(sizes)
  const change = (playerId, patch) => update(current => {
    const textPatch = Object.fromEntries(['name', 'number'].filter(key => Object.prototype.hasOwnProperty.call(patch, key)).map(key => [key, patch[key]]))
    const syncText = Boolean(current.text?.sameOnAll && Object.keys(textPatch).length)
    const roster = current.roster.map((player, index) => {
      const next = player.id === playerId ? { ...player, ...patch } : player
      if (!syncText || player.id === playerId) return next
      return { ...next, ...textPatch }
    })
    const first = roster[0]
    const updateSharedPreview = Boolean(first && (first.id === playerId || syncText) && Object.keys(textPatch).length)
    return updateSharedPreview
      ? { ...current, roster, text:{ ...current.text, ...textPatch } }
      : { ...current, roster }
  })
  const remove = playerId => update(current => ({ ...current, roster:current.roster.filter(player => player.id !== playerId) }))
  const add = () => update(current => current.roster.length >= 99 ? current : ({ ...current, roster:[...current.roster, { id:id(), name:'', number:'', size:visibleSizes.find(size => /\(M\)|\bM\b/i.test(size.label))?.value || visibleSizes[4]?.value || visibleSizes[0]?.value || 'M' }] }))
  return <details className="designer-roster">
    <summary><span><UsersRound size={17}/><strong>Team roster</strong><small>{state.roster.length} {state.roster.length === 1 ? 'player' : 'players'}</small></span><Plus size={16}/></summary>
    <div className="designer-roster__body">
      {state.roster.map((player, index) => <div className="designer-roster__row" key={player.id}>
        <b>{String(index + 1).padStart(2, '0')}</b>
        <input aria-label={`Player ${index + 1} name`} placeholder="Player name" value={player.name} onChange={event => change(player.id,{ name:event.target.value })}/>
        <input aria-label={`Player ${index + 1} number`} placeholder="No." value={player.number} inputMode="numeric" maxLength={3} onChange={event => change(player.id,{ number:event.target.value.replace(/[^0-9]/g, '') })}/>
        <select aria-label={`Player ${index + 1} size`} value={resolveOwayoSizeValue(player.size, visibleSizes)} onChange={event => change(player.id,{ size:event.target.value })}>{visibleSizes.map(size => <option key={size.value} value={size.value}>{size.label}</option>)}</select>
        <button type="button" disabled={state.roster.length === 1} aria-label={`Remove player ${index + 1}`} onClick={() => remove(player.id)}><Trash2 size={14}/></button>
      </div>)}
      <button type="button" className="designer-roster__add" disabled={state.roster.length >= 99} onClick={add}><Plus size={15}/> {state.roster.length >= 99 ? 'Roster limit reached' : 'Add player'}</button>
    </div>
  </details>
}

function activeVariant(product, state) {
  return findActiveVariant(product, state.roster[0]?.size || '')
}

function boundedFieldValue(field, value) {
  const raw = String(value || '').trim()
  const max = Math.min(500, Math.max(1, Number(field?.maxLength || (field?.type === 'textarea' ? 500 : 80))))
  return field?.type === 'number' ? raw.replace(/\D/g, '').slice(0, max) : raw.slice(0, max)
}

function designerFields(product, state, logoUrl = '') {
  const roster = state.roster[0] || {}
  const palette = Object.entries(state.colors || {}).slice(0, 5).map(([key, value]) => `${key}:${value}`).join(' ')
  return Object.fromEntries((product?.customFields || []).map(field => {
    const identity = `${field.key || ''} ${field.label || ''}`.toLowerCase()
    let value = ''
    if (field.type === 'logo') value = logoUrl
    else if (field.type === 'number' || /number|no\.?\b/.test(identity)) value = roster.number || state.text.number
    else if (/team|city|club|squad/.test(identity)) value = state.text.team
    else if (/name|player/.test(identity)) value = roster.name || state.text.name
    else if (/colou?r|palette/.test(identity)) value = palette
    else if (field.type === 'select' && Array.isArray(field.options) && field.options.length) value = field.options[0]
    return [field.key, boundedFieldValue(field, value)]
  }))
}

function designerNote(state, selectedDesign, manifest) {
  const team = String(state.text.team || 'Custom team').trim()
  const design = String(selectedDesign?.name || state.design || 'Custom design').trim()
  const model = String(selectedDesign?.modelId || manifest?.product?.model || '253m_KA').trim()
  const colors = Object.entries(state.colors || {}).slice(0, 4).map(([key, value]) => `${key} ${value}`).join(', ')
  const pattern = state.pattern?.slug ? ` · pattern ${state.pattern.slug} on ${state.pattern.colorCode || 'A'}` : ''
  return `3D kit · ${design} · ${model} · ${team} · ${state.roster.length} player${state.roster.length === 1 ? '' : 's'} · ${colors}${pattern}`.slice(0, 500)
}

function designerPayload(state, selectedDesign, manifest, listing = null, manifestUrl = '') {
  const roster = normalizeOwayoRoster(state.roster, manifest?.product?.sizes || [])
  const sourceLayers = migrateDesignerLayers(state)
  const logoCount = sourceLayers.filter(layer => layer.kind === 'logo' && layer.dataUrl).length
  let logoAssetIndex = 0
  let artworkAssetIndex = logoCount
  const layers = sourceLayers.flatMap(layer => {
    if (['logo', 'artwork'].includes(layer.kind) && !layer.dataUrl) return []
    const normalized = normalizeOwayoLayer(layer)
    if (!['logo', 'artwork'].includes(normalized.kind)) return [normalized]
    const assetIndex = normalized.kind === 'artwork' ? artworkAssetIndex++ : logoAssetIndex++
    return [{ ...normalized, name:String(layer.name || '').slice(0, 160), assetIndex }]
  })
  const firstLogo = migrateDesignerLayers(state).find(layer => layer.kind === 'logo' && layer.dataUrl)
  const legacyLogo = Number(state.layerVersion) >= 1 ? {} : state.logo
  return {
    source:'JERSEVO_3D_DESIGNER',
    version:3,
    provider:manifest?.provider || 'owayo',
    listingId:listing?.id || state.listingId || '',
    listingHandle:listing?.handle || state.listingHandle || '',
    manifest:manifestUrl || (manifest?.provider === 'boombah' ? `/designer/boombah/products/${String(manifest.product?.id || '').toLowerCase()}.json` : OWAYO_MANIFEST_URL),
    model:selectedDesign?.modelId || manifest?.product?.model || '253m_KA',
    product:manifest?.product?.name || 'Cycling Jersey C3 Basic Short Sleeve',
    // Some mirrored Owayo manifests intentionally keep the product identity
    // in the route/catalog (the upstream model only exposes a display name).
    // Keep that family id in the order handoff so the server can verify the
    // selected model instead of receiving an empty product id.
    productId:manifest?.product?.id || state.productId || '',
    styleCode:selectedDesign?.styleCode || state.styleCode || '',
    garment:selectedDesign?.garment || '',
    designSlug:state.design,
    designName:selectedDesign?.name || state.design,
    colors:state.colors,
    pattern:state.pattern?.slug ? {
      id:state.pattern.id || '',
      slug:state.pattern.slug,
      colorCode:state.pattern.colorCode || 'A',
      scale:Number(state.pattern.scale || 1),
      opacity:Number(state.pattern.opacity ?? .82)
    } : null,
    text:normalizeOwayoPersonalization(state.text, roster),
    // Keep the first mark in the v2 slot for older production tooling while
    // v3 consumers use the complete independent layer list below.
    logo:{ ...normalizeOwayoLogo(firstLogo || legacyLogo), name:firstLogo?.name || legacyLogo?.name || '' },
    assetPolicy:'private-customer-assets',
    layerVersion:1,
    layers,
    roster:roster.map(player => ({ name:player.name, number:player.number, size:player.size }))
  }
}

async function fileFromDataUrl(dataUrl, name = 'team-logo.png') {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], name, { type:blob.type || 'image/png' })
}

function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl || typeof document === 'undefined') return false
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
  return true
}

function downloadJson(value, filename) {
  if (typeof document === 'undefined') return false
  const blob = new Blob([JSON.stringify(value, null, 2)], { type:'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

export default function CustomDesignerPage({ products = [], onAdd, onNavigate }) {
  const routeParams = useMemo(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    return {
      listing: params.get('listing') || params.get('handle') || '',
      provider: params.get('provider') || '',
      product: params.get('product') || '',
      style: params.get('style') || '',
      design: params.get('design') || '',
      team: params.get('team') || '',
      name: params.get('name') || '',
      number: params.get('number') || ''
    }
  }, [])
  const draftKey = useMemo(() => {
    const scope = String(routeParams.listing || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 120)
    return scope ? `${DRAFT_KEY}-${scope}` : DRAFT_KEY
  }, [routeParams.listing])
  const [listingProduct, setListingProduct] = useState(null)
  const [listingLoading, setListingLoading] = useState(Boolean(routeParams.listing))
  const [listingError, setListingError] = useState('')
  const [manifest, setManifest] = useState(null)
  const [manifestUrl, setManifestUrl] = useState(OWAYO_MANIFEST_URL)
  const [owayoManifest, setOwayoManifest] = useState(null)
  const [owayoCatalog, setOwayoCatalog] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [mockupCatalog, setMockupCatalog] = useState(null)
  const [manifestError, setManifestError] = useState('')
  const [stageStatus, setStageStatus] = useState('loading')
  const [activeTab, setActiveTab] = useState('design')
  const [scenePreset, setScenePreset] = useState('studio-light')
  const [saved, setSaved] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [added, setAdded] = useState(false)
  const [requestKey, setRequestKey] = useState(() => `request_${id().replace(/-/g, '')}`)
  const logoUploadRef = useRef(new Map())
  const initializedRef = useRef(false)
  const history = useDesignerHistory(initialDesignerState())
  const stageRef = useRef(null)

  useEffect(() => {
    trackStorefrontEvent('designer_started',{ provider:routeParams.provider || 'auto', product:routeParams.product || '', listing:routeParams.listing || '' })
  }, [])

  useEffect(() => {
    if (stageStatus === 'error') trackStorefrontEvent('designer_load_error',{ provider:history.state.provider || routeParams.provider || 'unknown', product:history.state.productId || routeParams.product || '' })
  }, [stageStatus])

  useEffect(() => {
    let cancelled = false
    const readJson = async (url, version = '') => {
      const suffix = version ? `${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}` : ''
      // Catalogue JSON changes as families are synchronized. Revalidate that
      // small index so an older browser cache cannot collapse the sport tabs
      // into a misleading “Catalog 0/0” state; versioned manifests and large
      // model assets remain force-cached.
      const response = await fetch(`${url}${suffix}`, { cache:/\/catalog\.json(?:\?|$)/i.test(url) ? 'no-cache' : 'force-cache' })
      if (!response.ok) throw new Error(`Designer assets returned ${response.status}.`)
      return response.json()
    }
    const bootstrap = async () => {
      let resolvedListing = routeParams.listing
        ? products.find(product => product.id === routeParams.listing || product.handle === routeParams.listing) || null
        : null
      if (routeParams.listing && !resolvedListing) {
        const listingResult = await fetchStorefrontProduct(routeParams.listing, { includeRelated:false })
        resolvedListing = listingResult?.data?.[0] || null
      }
      if (cancelled) return
      if (routeParams.listing && !resolvedListing) throw new Error('The selected listing is no longer available for the 3D editor.')
      if (resolvedListing) setListingProduct(resolvedListing)
      setListingLoading(false)
      const designer = resolvedListing?.designerConfig || null
      if (routeParams.listing && (!designer?.provider || !designer?.productId)) {
        throw new Error('This listing is not connected to a supported 3D designer yet.')
      }
      let draft = null
      try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null') } catch {}

      // Resolve the family before loading the garment. The old bootstrap always
      // fetched C3, so a plain `?product=cycling-c5` silently rendered a C3
      // mesh even though the C5 listing had its own synchronized manifest.
      // The selected garment is the critical path.  Keep the two provider
      // indexes in parallel, but do not make the editor wait for the
      // reference-only 3DMockups metadata before opening the stage.  That
      // small catalogue is useful for discovery, never required to render a
      // Jersevo-owned model, and can arrive after first paint.
      const boombahPromise = readJson(BOOMBAH_CATALOG_URL)
      const owayoCatalogPromise = readJson(OWAYO_CATALOG_URL)
      const mockupCatalogPromise = readJson(MOCKUP_CATALOG_URL)
      const [boombahResult, owayoCatalogResult] = await Promise.allSettled([
        boombahPromise,
        owayoCatalogPromise
      ])
      if (cancelled) return
      const boombahCatalog = boombahResult.status === 'fulfilled' ? boombahResult.value : null
      const catalogFamilies = owayoCatalogResult.status === 'fulfilled' ? owayoCatalogResult.value : null
      // Resolve this independently so a slow/unavailable reference catalogue
      // never blocks the selected manifest.  Promise rejection is intentionally
      // swallowed: the editor remains fully usable without reference metadata.
      mockupCatalogPromise.then(value => {
        if (!cancelled) setMockupCatalog(value)
      }).catch(() => {})
      const requestedFamilyId = designer?.provider === 'owayo'
        ? designer.productId
        : routeParams.product || draft?.productId || ''
      const requestedFamily = owayoFamilyByProductId(catalogFamilies, requestedFamilyId)
      const requestedOwayoManifest = resolveOwayoManifestRequest({ catalog:catalogFamilies, listingDesigner:designer, routeProduct:routeParams.product, draftProduct:requestedFamily?.id || requestedFamilyId, fallback:OWAYO_MANIFEST_URL })
      const owayoManifestVersion = catalogFamilies?.generatedAt || catalogFamilies?.summary?.generatedAt || ''
      const owayoResult = await Promise.allSettled([readJson(requestedOwayoManifest, owayoManifestVersion)])
      if (cancelled) return
      const owayo = owayoResult[0].status === 'fulfilled' ? owayoResult[0].value : null
      if (owayo) setOwayoManifest(owayo)
      if (boombahCatalog) setCatalog(boombahCatalog)
      if (catalogFamilies) setOwayoCatalog(catalogFamilies)
      if (!owayo && !boombahCatalog) throw new Error('Sportswear and teamwear designer assets are temporarily unavailable.')
      const requestedProvider = String(
        designer?.provider
          || routeParams.provider
          || (routeParams.product && requestedFamily ? 'owayo' : '')
          || draft?.provider
          || ''
      ).toLowerCase()
      const provider = requestedProvider === 'boombah' && boombahCatalog ? 'boombah' : requestedProvider === 'owayo' && owayo ? 'owayo' : (owayo ? 'owayo' : 'boombah')
      const productId = designer?.productId || routeParams.product || draft?.productId || (provider === 'owayo' ? (requestedFamily?.id || 'cycling-c3') : boombahCatalog?.defaultProductId || boombahCatalog?.products?.[0]?.id || '')
      const seed = {
        ...initialDesignerState(),
        ...(draft || {}),
        provider,
        listingId:resolvedListing?.id || '',
        listingHandle:resolvedListing?.handle || '',
        productId,
        styleCode:designer?.defaultStyleCode || routeParams.style || draft?.styleCode || '',
        design:designer?.defaultDesignId || routeParams.design || draft?.design || ''
      }
      if (!draft && designer?.defaultColors && typeof designer.defaultColors === 'object') {
        seed.colors = { ...seed.colors, ...designer.defaultColors }
      }
      if (!draft && designer?.defaultText && typeof designer.defaultText === 'object') {
        seed.text = { ...seed.text, ...designer.defaultText }
        const first = seed.roster?.[0]
        if (first) seed.roster = seed.roster.map((player, index) => index === 0 ? {
          ...player,
          ...(designer.defaultText.name ? { name:designer.defaultText.name } : {}),
          ...(designer.defaultText.number ? { number:designer.defaultText.number } : {})
        } : player)
      }
      if (!draft && Array.isArray(designer?.defaultLayers) && designer.defaultLayers.length) {
        seed.layers = designer.defaultLayers.map(layer => newDesignerLayer(layer.kind, layer.placement, layer))
        seed.layerVersion = 1
      }
      // Normalize saved display labels (for example `M`) to the exact Owayo
      // source codes (for example `5`) before the first preview or checkout
      // payload is built. This keeps the selected variant and the roster UI in
      // lockstep after a reload or a family switch.
      if (provider === 'owayo' && owayo?.product?.sizes) {
        seed.roster = normalizeOwayoRoster(seed.roster, owayo.product.sizes)
      }
      if (routeParams.team) seed.text = { ...seed.text, team:routeParams.team.slice(0, 24) }
      if (routeParams.name) seed.text = { ...seed.text, name:routeParams.name.slice(0, 24) }
      if (routeParams.number) seed.text = { ...seed.text, number:routeParams.number.replace(/\D/g, '').slice(0, 3) }
      if (routeParams.name || routeParams.number) {
        const first = seed.roster?.[0]
        if (first) seed.roster = seed.roster.map((player, index) => index === 0 ? {
          ...player,
          ...(routeParams.name ? { name:routeParams.name.slice(0, 24) } : {}),
          ...(routeParams.number ? { number:routeParams.number.replace(/\D/g, '').slice(0, 3) } : {})
        } : player)
      }
      const seedPreview = resolveOwayoPreviewText(seed.text, seed.roster)
      seed.text = { ...seed.text, name:seedPreview.name, number:seedPreview.number }
      seed.layers = migrateDesignerLayers(seed)
      seed.layerVersion = 1
      history.replace(seed)
      initializedRef.current = true
      if (provider === 'owayo') {
        if (!owayo) throw new Error(`The synchronized Owayo garment ${productId} could not be loaded.`)
        setManifest(owayo)
        setManifestUrl(requestedOwayoManifest)
        const first = owayo.designs?.[0]?.slug || 'etape'
        const familyId = owayoFamilyByProductId(catalogFamilies, productId)?.id || productId || 'cycling-c3'
        history.update(current => {
          const roster = normalizeOwayoRoster(current.roster, owayo.product?.sizes || [])
          const preview = resolveOwayoPreviewText(current.text, roster)
          return { ...current, provider:'owayo', productId:familyId, styleCode:'', design:owayo.designs?.some(item => item.slug === current.design) ? current.design : first, roster, text:{ ...current.text, name:preview.name, number:preview.number } }
        })
        return
      }
      const product = boombahCatalog.products?.find(item => item.id === productId)
        || (resolvedListing ? null : boombahCatalog.products?.[0])
      // Retail listings can opt into a narrow listing-specific manifest so
      // their photographed artwork never falls back to the generic template.
      const configuredManifest = designer?.provider === 'boombah' ? designer?.manifest : ''
      const productManifest = configuredManifest || product?.manifest
      if (!productManifest) throw new Error('The Boombah catalog has no product manifest.')
      let productResponse
      try {
        productResponse = await readJson(productManifest, ASSET_CACHE_BUSTER)
      } catch (error) {
        if (!owayo) throw error
        setManifest(owayo)
        setManifestUrl(OWAYO_MANIFEST_URL)
        const first = owayo.designs?.[0]?.slug || 'etape'
        history.update(current => ({ ...current, provider:'owayo', productId:'cycling-c3', styleCode:'', design:first }))
        return
      }
      if (cancelled) return
       setManifest(productResponse)
       setManifestUrl(productManifest)
      const allowedDesigns = designer?.allowedDesignIds?.length ? productResponse.designs?.filter(item => designer.allowedDesignIds.includes(item.id) || designer.allowedDesignIds.includes(item.slug)) : productResponse.designs
      const first = allowedDesigns?.[0] || productResponse.designs?.[0]
      const designMatch = allowedDesigns?.find(item => item.id === seed.design || item.slug === seed.design)
      const styleMatch = designer?.allowedStyleCodes?.length && !designer.allowedStyleCodes.includes(seed.styleCode) ? first?.styleCode : (seed.styleCode || first?.styleCode || '')
       history.update(current => ({ ...current, provider:'boombah', productId:product.id, styleCode:styleMatch, design:designMatch?.id || first?.id || '', colors:draft ? current.colors : { ...current.colors, ...(first?.defaultColors || {}), ...(designer?.defaultColors || {}) } }))
    }
    bootstrap().catch(error => {
      if (cancelled) return
      setListingLoading(false)
      setListingError(error.message || 'The selected listing could not be opened.')
      setManifestError(error.message || 'Designer assets could not be loaded.')
      trackStorefrontEvent('designer_load_error',{ provider:routeParams.provider || 'auto', product:routeParams.product || '', phase:'manifest' })
    })
    return () => { cancelled = true }
  }, [draftKey])

  // `/custom` intentionally loads only a small page of private designer rows.
  // Resolve the active family directly so checkout can never fall through to
  // a different customizable jersey merely because that row happened to be
  // present in the current page payload.
  useEffect(() => {
    if (routeParams.listing || !manifest) return undefined
    const provider = String(history.state.provider || '').toLowerCase()
    const productId = String(history.state.productId || '').trim()
    const manifestProvider = String(manifest.provider || '').toLowerCase()
    const manifestProductId = String(manifest.product?.id || productId).trim()
    if (!provider || !productId || provider !== manifestProvider || manifestProductId.toLowerCase() !== productId.toLowerCase()) return undefined
    const matches = product => {
      const config = custom3DDesignerConfig(product)
      return config?.provider === provider && String(config.productId || '').toLowerCase() === productId.toLowerCase()
    }
    const local = products.find(matches) || null
    if (local) {
      setListingProduct(local)
      setListingLoading(false)
      setListingError('')
      return undefined
    }
    let cancelled = false
    setListingProduct(null)
    setListingLoading(true)
    setListingError('')
    fetchStorefrontDesignerProduct(provider, productId).then(result => {
      if (cancelled) return
      const exact = result?.data?.find(matches) || null
      setListingProduct(exact)
      setListingError(result?.error || '')
    }).catch(error => {
      if (!cancelled) setListingError(error instanceof Error ? error.message : 'The live garment listing could not be checked.')
    }).finally(() => {
      if (!cancelled) setListingLoading(false)
    })
    return () => { cancelled = true }
  }, [routeParams.listing, manifest, products, history.state.provider, history.state.productId])

  const loadBoombahProduct = useCallback(async productId => {
    if (routeParams.listing && productId !== routeParams.product) return
    const product = catalog?.products?.find(item => item.id === productId)
    if (!product?.manifest) return
    setStageStatus('loading')
    setManifestError('')
    try {
      const response = await fetch(`${product.manifest}${catalog?.generatedAt ? `?v=${encodeURIComponent(catalog.generatedAt)}` : ''}`, { cache:'force-cache' })
      if (!response.ok) throw new Error(`Boombah product assets returned ${response.status}.`)
      const next = await response.json()
       setManifest(next)
       setManifestUrl(product.manifest)
      const first = next.designs?.[0]
      history.update(current => ({ ...current, provider:'boombah', productId, styleCode:first?.styleCode || '', design:first?.id || first?.slug || '' , colors:{ ...current.colors, ...(first?.defaultColors || {}) } }))
    } catch (error) {
      setManifestError(error.message || 'Boombah product assets could not be loaded.')
      trackStorefrontEvent('designer_load_error',{ provider:'boombah', product:productId, phase:'product_manifest' })
    }
  }, [catalog, history.update, routeParams.listing, routeParams.product])

  const loadOwayoProduct = useCallback(async productId => {
    if (routeParams.listing) return
    const family = owayoFamilyByProductId(owayoCatalog, productId)
    if (!family?.assetsReady || !family.manifest) return
    setStageStatus('loading')
    setManifestError('')
    try {
      const version = owayoCatalog?.generatedAt || owayoCatalog?.summary?.generatedAt || ''
      const response = await fetch(`${family.manifest}${version ? `?v=${encodeURIComponent(version)}` : ''}`, { cache:'force-cache' })
      if (!response.ok) throw new Error(`Owayo product assets returned ${response.status}.`)
      const next = await response.json()
      const first = next.designs?.[0]
      setManifest(next)
      setManifestUrl(family.manifest)
      setOwayoManifest(next)
      history.update(current => {
        const roster = normalizeOwayoRoster(current.roster, next.product?.sizes || [])
        const preview = resolveOwayoPreviewText(current.text, roster)
        return {
          ...current,
          provider:'owayo',
          productId:family.id,
          styleCode:'',
          design:first?.slug || first?.id || '',
          pattern:{ ...current.pattern, id:'', slug:'' },
          colors:{ ...current.colors, ...(next.product?.defaultColors || {}) },
          roster,
          text:{ ...current.text, name:preview.name, number:preview.number }
        }
      })
    } catch (error) {
      setManifestError(error.message || 'Owayo product assets could not be loaded.')
      trackStorefrontEvent('designer_load_error',{ provider:'owayo', product:productId, phase:'product_manifest' })
    }
  }, [history.update, owayoCatalog, routeParams.listing])

  const changeProvider = useCallback(provider => {
    if (routeParams.listing) return
    if (provider === 'owayo' && owayoManifest) {
      loadOwayoProduct('cycling-c3')
      return
    }
    const productId = catalog?.defaultProductId || catalog?.products?.[0]?.id
    if (provider === 'boombah' && productId) loadBoombahProduct(productId)
  }, [catalog, loadOwayoProduct, loadBoombahProduct, owayoManifest, routeParams.listing])

  useEffect(() => {
    setSaved(false)
    if (!initializedRef.current) return undefined
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(history.state)); setSaved(true) } catch { setSaved(false) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draftKey, history.state])

  const customProduct = useMemo(() => {
    const config = custom3DDesignerConfig(listingProduct)
    const exact = config?.provider === history.state.provider
      && String(config?.productId || '').toLowerCase() === String(history.state.productId || '').toLowerCase()
    return exact ? listingProduct : null
  }, [listingProduct, history.state.provider, history.state.productId])
  const previewOnly = !customProduct
  const variant = activeVariant(customProduct, history.state)
  const unitPrice = Number(variant?.price ?? customProduct?.price ?? 79)
  const quantity = Math.max(1, history.state.roster.length)
  const discount = quantityDiscountForQty(quantity, DEFAULT_QUANTITY_DISCOUNT_POLICY).discountPercent / 100
  const total = unitPrice * quantity * (1 - discount)
  const selectedDesign = manifest?.designs?.find(item => item.slug === history.state.design || item.id === history.state.design)
  const previewText = useMemo(() => ({
    ...normalizeOwayoPersonalization(history.state.text, history.state.roster),
    numberStyle:history.state.text?.numberStyle || ''
  }), [history.state.text, history.state.roster])
  const activeScene = MOCKUP_SCENE_PRESETS.find(scene => scene.id === scenePreset) || MOCKUP_SCENE_PRESETS[0]
  const exportPng = () => {
    const dataUrl = stageRef.current?.capture?.()
    if (!dataUrl) return
    downloadDataUrl(dataUrl, `${String(history.state.productId || 'jersevo-mockup').toLowerCase()}-preview.png`)
  }
  const exportJson = () => {
    const payload = designerPayload(history.state, selectedDesign, manifest, customProduct, manifestUrl)
    downloadJson({ schemaVersion:'1.0', workflow:'JERSEVO_MOCKUP_WORKFLOW', scene:activeScene.id, design:payload }, 'jersevo-design.json')
  }
  const saveNow = () => {
    try { localStorage.setItem(draftKey, JSON.stringify(history.state)); setSaved(true) } catch { setSaved(false) }
  }
  const addToBag = async () => {
    if (!customProduct || !variant) { onNavigate?.('/category/custom-jerseys'); return }
    setSubmitting(true)
    setSubmitError('')
    setAdded(false)
    try {
      const logoField = customProduct.customFields.find(field => field.type === 'logo')
      const imageLayers = migrateDesignerLayers(history.state).filter(layer => ['logo', 'artwork'].includes(layer.kind) && layer.dataUrl).slice(0, 16)
      const logoLayers = imageLayers.filter(layer => layer.kind === 'logo').slice(0, 8)
      const artworkLayers = imageLayers.filter(layer => layer.kind === 'artwork').slice(0, 8)
      if (logoLayers.length && !logoField) throw new Error('This live jersey does not accept a team logo. Choose a jersey with logo personalization.')
      if (imageLayers.some(layer => !layer.consent)) throw new Error('Confirm that you own or have permission to use every uploaded logo or artwork asset.')
      let logoUrl = ''
      const assetRefs = {}
      const designerAssetRefs = Array(imageLayers.length)
      let logoAssetIndex = 0
      let artworkAssetIndex = logoLayers.length
      if (imageLayers.length) {
        for (const [index, layer] of imageLayers.entries()) {
          const kind = layer.kind === 'artwork' ? 'artwork' : 'logo'
          const cacheKey = `${kind}:${layer.dataUrl}`
          let uploaded = logoUploadRef.current.get(cacheKey) || null
          if (!uploaded) {
            const file = await fileFromDataUrl(layer.dataUrl, layer.name || `${kind}-${index + 1}.${kind === 'artwork' ? 'webp' : 'png'}`)
            if (!uploaded) uploaded = await uploadCustomerReference(file, customProduct.id, kind === 'artwork' ? '__designer_artwork__' : logoField.key, kind)
            logoUploadRef.current.set(cacheKey, uploaded)
          }
          if (layer.kind === 'logo' && !logoUrl) {
            logoUrl = uploaded.imageUrl
            assetRefs[logoField.key] = uploaded.storage
          }
          const assetIndex = layer.kind === 'artwork' ? artworkAssetIndex++ : logoAssetIndex++
          designerAssetRefs[assetIndex] = uploaded.storage
        }
      } else {
        logoUploadRef.current.clear()
      }
      const fields = designerFields(customProduct, history.state, logoUrl)
      const missing = customProduct.customFields.filter(field => field.required && !fields[field.key])
      if (missing.length) throw new Error(`Complete: ${missing.map(field => field.label).join(', ')}.`)
      const note = designerNote(history.state, selectedDesign, manifest)
      const result = await createCustomizationOrder({
        sessionId:getCustomerSessionId(),
        idempotencyKey:requestKey,
        productId:customProduct.id,
        variantId:variant.id,
        fields,
        assetRefs,
        designerAssetRefs,
        note,
        logoConsent:Boolean(imageLayers.length && imageLayers.every(layer => layer.consent)),
        assetConsent:Boolean(imageLayers.length && imageLayers.every(layer => layer.consent)),
         designer:designerPayload(history.state, selectedDesign, manifest, customProduct, manifestUrl)
      })
      const requestId = result?.data?.id
      if (!requestId) throw new Error('The design request was not created. Please retry.')
      trackStorefrontEvent('designer_completed',{ provider:history.state.provider, product_id:customProduct.id, garment:history.state.productId, roster_size:quantity })
      onAdd?.(customProduct, {
        variant,
        options:variant.values || {},
        quantity,
         customization:{ requestId, fields, note, hasLogo:Boolean(logoLayers.length), hasArtwork:Boolean(artworkLayers.length), logoConsent:Boolean(imageLayers.length && imageLayers.every(layer => layer.consent)), designer:designerPayload(history.state, selectedDesign, manifest, customProduct, manifestUrl) }
      })
      setAdded(true)
      setRequestKey(`request_${globalThis.crypto.randomUUID().replace(/-/g,'')}`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The custom request could not be saved. Please retry.')
    } finally {
      setSubmitting(false)
    }
  }

  if (manifestError) return <main className="designer-failure"><span>90+</span><h1>Designer assets need attention.</h1><p>{manifestError}</p><button type="button" onClick={() => window.location.reload()}>Retry</button></main>
  if (!manifest) return <main className="designer-loading" role="status"><span>90+</span><p>Loading local 3D garment assets…</p></main>

  const activeDesignerConfig = custom3DDesignerConfig(listingProduct)
  const isRetailListing = activeDesignerConfig?.catalogVisibility === 'RETAIL'
  const backTarget = listingProduct?.handle ? `/product/${listingProduct.handle}` : '/custom'
  const headerTitle = isRetailListing ? listingProduct.title : stripBoombahBrandingText(manifest.product.name)
  const headerLabel = isRetailListing ? 'Customize this jersey in 3D' : 'Jersevo 3D kit builder'
  const Panel = activeTab === 'design' ? DesignPanel : activeTab === 'colors' ? ColorPanel : activeTab === 'patterns' ? PatternPanel : activeTab === 'text' ? TextPanel : activeTab === 'logos' ? LogoPanel : ArtworkPanel
  return <main className="custom-designer">
    <header className="custom-designer__header">
      <button type="button" className="custom-designer__back" onClick={() => onNavigate?.(backTarget)}><ArrowLeft size={17}/> {isRetailListing ? 'Back to product' : 'Custom lab'}</button>
      <div><span>{headerLabel}</span><strong>{headerTitle}</strong></div>
      <p><span className={`custom-designer__status is-${stageStatus}`}/>{stageStatus === 'ready' ? `${isRetailListing ? 'Retail jersey' : (manifestIsBoombah(manifest) ? 'Teamwear' : (manifest?.product?.sportLabel || manifest?.product?.catalogGroupLabel || 'Sportswear'))} 3D · mirrored assets` : stageStatus === 'error' ? 'Preview unavailable' : 'Loading model'}</p>
    </header>
    <div className="custom-designer__workspace">
      <section className="designer-stage" aria-label="3D jersey workspace" style={activeScene.background === 'transparent' ? undefined : { background:activeScene.background }}>
        <div className="designer-stage__meta"><span>{selectedDesign?.name || 'Custom design'}</span><strong>{history.state.text.team || 'Your team'}</strong><label className="designer-stage__scene"><span>Scene</span><select value={scenePreset} onChange={event => setScenePreset(event.target.value)} aria-label="Mockup scene">{MOCKUP_SCENE_PRESETS.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}</select></label></div>
         <JerseyStage ref={stageRef} manifest={manifest} design={history.state.design} colors={history.state.colors} pattern={history.state.pattern} text={previewText} layers={history.state.layers} onStatus={setStageStatus}/>
        {stageStatus === 'loading' && <div className="designer-stage__loading"><span>90+</span><p>Stitching the 3D preview…</p></div>}
        {stageStatus === 'error' && <div className="designer-stage__loading is-error"><span>!</span><p>The design is saved. Reload to restore the 3D preview.</p></div>}
        <div className="designer-stage__tools" aria-label="3D view controls">
          <button type="button" onClick={() => stageRef.current?.zoom(1)} aria-label="Zoom in"><ZoomIn size={18}/></button>
          <button type="button" onClick={() => stageRef.current?.zoom(-1)} aria-label="Zoom out"><ZoomOut size={18}/></button>
          <button type="button" onClick={() => stageRef.current?.rotate(-1)} aria-label="Rotate left"><Rotate3D size={18}/></button>
          <button type="button" onClick={() => stageRef.current?.reset()} aria-label="Reset 3D view"><span>0°</span></button>
          <button type="button" onClick={exportPng} aria-label="Download preview PNG"><Download size={17}/></button>
          <button type="button" onClick={exportJson} aria-label="Download design JSON"><FileJson size={17}/></button>
        </div>
        <div className="designer-stage__history">
          <button type="button" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={16}/> Undo</button>
          <button type="button" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={16}/> Redo</button>
        </div>
        <p className="designer-stage__hint"><Move size={14}/> Drag to rotate · pinch or scroll to zoom</p>
      </section>
      <aside className="designer-controls">
        <nav className="designer-tabs" aria-label="Design tools">{TABS.map(tab => { const Icon = tab.icon; return <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}><Icon size={17}/><span>{tab.label}</span></button> })}</nav>
        <div className="designer-controls__scroll"><Panel manifest={manifest} catalog={catalog} owayoCatalog={owayoCatalog} mockupCatalog={mockupCatalog} owayoAvailable={Boolean(owayoManifest)} state={history.state} update={history.update} designerConfig={activeDesignerConfig} onProviderChange={changeProvider} onOpenDesign={() => setActiveTab('design')} onProductChange={loadBoombahProduct} onOwayoProductChange={loadOwayoProduct}/></div>
        <Roster state={history.state} update={history.update} sizes={selectedDesign?.sizes || manifest.product.sizes || []}/>
        <footer className="designer-order">
          <div className="designer-order__price"><span>{quantity} {quantity === 1 ? 'piece' : 'pieces'}{discount ? ` · ${Math.round(discount * 100)}% team saving` : ''}</span><strong>${total.toFixed(2)}</strong><small>{discount ? `$${unitPrice.toFixed(2)} each before team pricing` : 'Artwork review included'}</small></div>
          {submitError && <p className="designer-order__error" role="alert">{submitError}</p>}
          <div className="designer-order__actions"><button type="button" className="designer-save" onClick={saveNow}><Save size={16}/>{saved ? 'Draft saved' : 'Save draft'}</button><button type="button" className="designer-add" disabled={submitting || listingLoading || previewOnly || !variant} onClick={addToBag}><ShoppingBag size={17}/>{submitting ? 'Saving design…' : listingLoading ? 'Checking live listing…' : added ? 'Added to bag' : previewOnly ? 'Preview only · listing pending' : customProduct && variant ? 'Add team order' : 'Choose a live jersey'}</button></div>
          {previewOnly && !listingLoading && <p className="designer-order__preview-note">The 3D studio is ready. This exact garment needs a published listing before checkout.{listingError ? ` ${listingError}` : ''}</p>}
        </footer>
      </aside>
    </div>
    <section className="designer-assurance" aria-label="Design review process"><div><CheckCircle2 size={19}/><span><strong>Design check</strong><small>Placement, spelling and print zones reviewed before production.</small></span></div><div><UsersRound size={19}/><span><strong>One design, every player</strong><small>Names, numbers and sizes stay organized in one roster.</small></span></div><div><Shirt size={19}/><span><strong>Production-ready handoff</strong><small>The exact design state travels with the cart line.</small></span></div></section>
  </main>
}
