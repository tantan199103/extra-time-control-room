import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Grid3X3,
  Image as ImageIcon,
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
import { createCustomizationOrder, fetchStorefrontProduct, getCustomerSessionId, uploadCustomerReference } from './lib/storefront-api'
import { DEFAULT_QUANTITY_DISCOUNT_POLICY, quantityDiscountForQty } from './lib/quantity-pricing'
import { findActiveVariant } from './lib/variant-selection'
import './custom-designer.css'

const OWAYO_MANIFEST_URL = '/designer/owayo/cycling-c3/manifest.json'
const BOOMBAH_CATALOG_URL = '/designer/boombah/catalog.json'
const ASSET_CACHE_BUSTER = '1'
const DRAFT_KEY = 'jersevo-3d-designer-draft-v1'
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
  { id:'logos', label:'Logos', icon:ImageIcon }
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
  for (const zone of zones) {
    const code = String(zone.code || '')
    const marker = new RegExp(`<rect\\b(?=[^>]*\\bid=["']paramcolor-${escapeRegex(code)}["'])[^>]*>`, 'i').exec(svg)?.[0]
    const sourceColor = marker?.match(/\bfill=["']([^"']+)["']/i)?.[1]
    if (sourceColor && zone.editable !== false) replacements.set(sourceColor.toLowerCase(), colorHex(colors?.[code], '#F8F8F4'))
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

function initialDesignerState() {
  return {
    provider:'owayo',
    listingId:'',
    listingHandle:'',
    productId:'FASTPITCH3D',
    styleCode:'SS',
    design:'',
    colors:{ A:'#111311', B:'#F3ED45', C:'#2876FF', K:'#111311' },
    pattern:{ id:'', slug:'', colorCode:'A', scale:1, opacity:.82 },
    text:{ team:'JERSEVO', name:'YOUR NAME', number:'90', scale:1, color:'#F8F8F4' },
    logo:{ dataUrl:'', name:'', x:0, y:0, scale:1, rotation:0, consent:false },
    roster:[{ id:id(), name:'Your name', number:'90', size:'M' }]
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

function maskMaterial(maskMap, paletteMap, patternFallback) {
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
      patternScale:{ value:1 }
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
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        vec4 mask = texture2D(maskMap, vUv);
        float paletteIndex = floor(mask.r * 255.0 + 0.5);
        vec3 base = texture2D(paletteMap, vec2((paletteIndex + 0.5) / 256.0, 0.5)).rgb;
        vec3 normal = normalize(vNormalView);
        if (!gl_FrontFacing) normal = -normal;
        float keyLight = max(dot(normal, normalize(vec3(-0.35, 0.65, 0.85))), 0.0);
        float fillLight = max(dot(normal, normalize(vec3(0.75, -0.15, 0.45))), 0.0);
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        vec3 color = base * (0.52 + keyLight * 0.48 + fillLight * 0.14) + rim * 0.055;
        float target = 1.0 - step(0.5, abs(paletteIndex - patternIndex));
        vec4 motif = texture2D(patternMap, fract(vUv * max(patternScale, 0.05)));
        color = mix(color, motif.rgb * (0.78 + keyLight * 0.22), target * patternEnabled * patternOpacity * motif.a);
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

function textTexture(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, 1024, 1024)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  const draw = (value, y, font, lineWidth) => {
    context.font = font
    context.lineWidth = lineWidth
    context.strokeStyle = contrastColor(text.color)
    context.fillStyle = text.color
    context.strokeText(String(value || '').toUpperCase(), 512, y)
    context.fillText(String(value || '').toUpperCase(), 512, y)
  }
  draw(text.team, 170, '700 92px Manrope, sans-serif', 18)
  draw(text.name, 360, '800 118px Manrope, sans-serif', 22)
  draw(text.number, 690, '800 430px Barlow Condensed, sans-serif', 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

function averageZ(part) {
  if (!part) return 0
  let sum = 0
  for (let index = 2; index < part.positions.length; index += 3) sum += part.positions[index]
  return sum / (part.positions.length / 3)
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
  return !/\b(?:shoe|shoes|accessor(?:y|ies)|bag|backpack|sock|socks)\b/.test(identity)
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

const JerseyStage = forwardRef(function JerseyStage({ manifest, design, colors, pattern, text, logo, onStatus }, ref) {
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
    }
  }), [])

  useEffect(() => {
    if (!manifest || !hostRef.current) return undefined
    let cancelled = false
    const host = hostRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(31, 1, .1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' })
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
        runtimeRef.current = { scene, camera, renderer, controls, model, decoration, palette, patternFallback, patternTexture:null, parsed, dimensions, partMeshes, frontDirection, cameraDistance, floor, boombah:manifestIsBoombah(manifest) }
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
      patternFallback.dispose()
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
      mesh.material = maskMaterial(mask, runtime.palette, runtime.patternFallback)
      previous?.userData?.maskMap?.dispose?.()
      previous?.dispose?.()
    })).then(() => !cancelled && renderRef.current()).catch(error => console.error('Design texture load failed', error))
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
    const showGarmentPersonalization = supportsBoombahGarmentPersonalization(manifest, selected)
    if (!showGarmentPersonalization) {
      renderRef.current()
      return undefined
    }
    const frontZ = frontDirection > 0 ? dimensions[2] / 2 + .08 : -dimensions[2] / 2 - .08
    const backZ = -frontZ
    const textMap = textTexture(text)
    const textPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1 * Number(text.scale || 1), 3.1 * Number(text.scale || 1)),
      new THREE.MeshBasicMaterial({ map:textMap, transparent:true, depthWrite:false, side:THREE.DoubleSide })
    )
    textPlane.position.set(0, height * .05, backZ)
    textPlane.rotation.y = frontDirection > 0 ? Math.PI : 0
    decoration.add(textPlane)

    if (logo.dataUrl) {
      const loader = new THREE.TextureLoader()
      loader.loadAsync(logo.dataUrl).then(texture => {
        if (cancelled) { texture.dispose(); return }
        texture.colorSpace = THREE.SRGBColorSpace
        const width = 1.45 * Number(logo.scale || 1)
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(width, width),
          new THREE.MeshBasicMaterial({ map:texture, transparent:true, depthWrite:false, side:THREE.DoubleSide })
        )
        plane.position.set(Number(logo.x || 0) * 1.7, height * .12 + Number(logo.y || 0) * 1.7, frontZ)
        plane.rotation.z = THREE.MathUtils.degToRad(Number(logo.rotation || 0))
        plane.rotation.y = frontDirection > 0 ? 0 : Math.PI
        decoration.add(plane)
        renderRef.current()
      }).catch(error => console.error('Logo preview load failed', error))
    }
    renderRef.current()
    return () => { cancelled = true }
  }, [text, logo, readyRevision])

  return <div className="designer-stage__canvas" ref={hostRef} role="img" aria-label="Interactive 3D preview of the custom jersey" />
})

function DesignPanel({ manifest, catalog, owayoAvailable, state, update, onProviderChange, onProductChange }) {
  const [showAll, setShowAll] = useState(false)
  const filteredDesigns = manifestIsBoombah(manifest) && state.styleCode
    ? manifest.designs.filter(item => item.styleCode === state.styleCode)
    : manifest.designs
  const designs = showAll ? filteredDesigns : filteredDesigns.slice(0, 12)
  const currentProduct = catalog?.products?.find(item => item.id === state.productId)
  const styles = manifestIsBoombah(manifest) ? (manifest.product.styles || []) : []
  return <div className="designer-panel designer-panel--design">
    <div className="designer-library-switch" aria-label="Designer library">
      <div className="designer-library-switch__head"><span>Design library</span><small>{manifestIsBoombah(manifest) ? 'Teamwear 3D' : 'Cycling 3D'}</small></div>
      <div className="designer-library-switch__providers">
        <button type="button" disabled={!owayoAvailable || Boolean(state.listingId)} className={!manifestIsBoombah(manifest) ? 'is-active' : ''} onClick={() => onProviderChange?.('owayo')}>Cycling</button>
        <button type="button" disabled={!catalog?.products?.length || Boolean(state.listingId)} className={manifestIsBoombah(manifest) ? 'is-active' : ''} onClick={() => onProviderChange?.('boombah')}>Teamwear</button>
      </div>
      {manifestIsBoombah(manifest) && catalog?.products?.length > 0 && <>
        <label className="designer-library-switch__field"><span>Sport {state.listingId && <small>· listing locked</small>}</span><select disabled={Boolean(state.listingId)} value={state.productId} onChange={event => onProductChange?.(event.target.value)}>{catalog.products.map(product => <option key={product.id} value={product.id}>{product.sport} · {stripBoombahBrandingText(product.name)}</option>)}</select></label>
        {styles.length > 0 && <label className="designer-library-switch__field"><span>Garment cut</span><select value={state.styleCode || styles[0].code} onChange={event => update(current => ({ ...current, styleCode:event.target.value, design:manifest.designs.find(item => item.styleCode === event.target.value)?.id || current.design }))}>{styles.map(style => <option key={`${style.section}-${style.code}`} value={style.code}>{stripBoombahBrandingText(style.name)}</option>)}</select></label>}
      </>}
      {currentProduct && <p className="designer-library-switch__note">{currentProduct.designs} mirrored templates · model loads on selection</p>}
    </div>
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
  const active = manifest.designs.find(item => item.slug === state.design)
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

function PatternPanel({ manifest, state, update, onProviderChange, onOpenDesign }) {
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
  if (manifestIsBoombah(manifest)) return <div className="designer-panel designer-panel--patterns"><div className="designer-panel__intro"><h2>Patterns are part of Cycling</h2><p>Owayo garment patterns are available in the Cycling library. Switch libraries to browse the mirrored pattern catalogue.</p><button type="button" className="designer-pattern-switch" onClick={() => { onOpenDesign?.(); onProviderChange?.('owayo') }}>Switch to Cycling patterns</button></div></div>
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

function TextPanel({ state, update }) {
  const setText = patch => update(current => ({ ...current, text:{ ...current.text, ...patch } }))
  return <div className="designer-panel designer-panel--text">
    <div className="designer-panel__intro"><h2>Add names and numbers</h2><p>The shared text appears on the back. Individual roster values remain attached to each player.</p></div>
    <label className="designer-field"><span>Team name</span><input value={state.text.team} maxLength={24} onChange={event => setText({ team:event.target.value })}/></label>
    <label className="designer-field"><span>Player name</span><input value={state.text.name} maxLength={24} onChange={event => setText({ name:event.target.value })}/></label>
    <div className="designer-field-row">
      <label className="designer-field"><span>Number</span><input value={state.text.number} inputMode="numeric" maxLength={3} onChange={event => setText({ number:event.target.value.replace(/[^0-9]/g, '') })}/></label>
      <label className="designer-field designer-field--color"><span>Print color</span><input type="color" value={state.text.color} onChange={event => setText({ color:event.target.value })}/><strong>{state.text.color}</strong></label>
    </div>
    <label className="designer-range"><span>Print scale <strong>{Math.round(state.text.scale * 100)}%</strong></span><input type="range" min="0.7" max="1.3" step="0.05" value={state.text.scale} onChange={event => setText({ scale:Number(event.target.value) })}/></label>
    <div className="designer-print-note"><CheckCircle2 size={17}/><p>Names and numbers are checked for spelling and safe print placement before production.</p></div>
  </div>
}

function LogoPanel({ state, update }) {
  const [error, setError] = useState('')
  const setLogo = patch => update(current => ({ ...current, logo:{ ...current.logo, ...patch } }))
  const select = file => {
    if (!file) return
    if (!/^image\/(?:png|jpe?g|webp|svg\+xml)$/i.test(file.type)) { setError('Use a PNG, JPG, WebP or SVG file.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Logo files must be 5 MB or smaller.'); return }
    const reader = new FileReader()
    reader.onload = () => { setError(''); setLogo({ dataUrl:String(reader.result), name:file.name, consent:false }) }
    reader.onerror = () => setError('That logo could not be read. Choose another file.')
    reader.readAsDataURL(file)
  }
  return <div className="designer-panel designer-panel--logos">
    <div className="designer-panel__intro"><h2>Place your logo</h2><p>Upload a clean transparent file, then tune its position on the front of the garment.</p></div>
    <label className={`designer-logo-drop${state.logo.dataUrl ? ' has-logo' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); select(event.dataTransfer.files?.[0]) }}>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => select(event.target.files?.[0])}/>
      {state.logo.dataUrl ? <><img src={state.logo.dataUrl} alt="Uploaded logo preview"/><span><strong>{state.logo.name}</strong><small>Click or drop a file to replace</small></span></> : <><Upload size={25}/><span><strong>Upload team logo</strong><small>PNG, JPG, WebP or SVG · up to 5 MB</small></span></>}
    </label>
    {error && <p className="designer-field-error" role="alert">{error}</p>}
    {state.logo.dataUrl && <>
      <div className="designer-logo-actions"><button type="button" onClick={() => setLogo({ dataUrl:'', name:'' })}><Trash2 size={15}/> Remove logo</button><span><Move size={14}/> Front chest</span></div>
      {[['x','Horizontal',-1,1,.05],['y','Vertical',-1,1,.05],['scale','Scale',.5,1.8,.05],['rotation','Rotation',-30,30,1]].map(([key,label,min,max,step]) => <label className="designer-range" key={key}><span>{label} <strong>{key === 'rotation' ? `${state.logo[key]}°` : `${Math.round(state.logo[key] * 100)}%`}</strong></span><input type="range" min={min} max={max} step={step} value={state.logo[key]} onChange={event => setLogo({ [key]:Number(event.target.value) })}/></label>)}
      <label className="designer-consent"><input type="checkbox" checked={Boolean(state.logo.consent)} onChange={event => setLogo({ consent:event.target.checked })}/><span>I own this logo or have permission to use it.</span></label>
    </>}
  </div>
}

function Roster({ state, update, sizes }) {
  const visibleSizes = sizes.map(item => {
    if (typeof item === 'string') return { value:item, label:item }
    const value = String(item.code || item.size || item.name || '').trim()
    const label = String(item.name || item.size || item.code || '').trim()
    return { value, label:label || value }
  }).filter(item => item.value && !/choose/i.test(item.label))
  const change = (playerId, patch) => update(current => ({ ...current, roster:current.roster.map(player => player.id === playerId ? { ...player, ...patch } : player) }))
  const remove = playerId => update(current => ({ ...current, roster:current.roster.filter(player => player.id !== playerId) }))
  const add = () => update(current => current.roster.length >= 99 ? current : ({ ...current, roster:[...current.roster, { id:id(), name:'', number:'', size:visibleSizes[4]?.value || visibleSizes[0]?.value || 'M' }] }))
  return <details className="designer-roster">
    <summary><span><UsersRound size={17}/><strong>Team roster</strong><small>{state.roster.length} {state.roster.length === 1 ? 'player' : 'players'}</small></span><Plus size={16}/></summary>
    <div className="designer-roster__body">
      {state.roster.map((player, index) => <div className="designer-roster__row" key={player.id}>
        <b>{String(index + 1).padStart(2, '0')}</b>
        <input aria-label={`Player ${index + 1} name`} placeholder="Player name" value={player.name} onChange={event => change(player.id,{ name:event.target.value })}/>
        <input aria-label={`Player ${index + 1} number`} placeholder="No." value={player.number} inputMode="numeric" maxLength={3} onChange={event => change(player.id,{ number:event.target.value.replace(/[^0-9]/g, '') })}/>
        <select aria-label={`Player ${index + 1} size`} value={visibleSizes.some(size => size.value === player.size) ? player.size : (visibleSizes[0]?.value || '')} onChange={event => change(player.id,{ size:event.target.value })}>{visibleSizes.map(size => <option key={size.value} value={size.value}>{size.label}</option>)}</select>
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

function designerPayload(state, selectedDesign, manifest, listing = null) {
  return {
    source:'JERSEVO_3D_DESIGNER',
    version:2,
    provider:manifest?.provider || 'owayo',
    listingId:listing?.id || state.listingId || '',
    listingHandle:listing?.handle || state.listingHandle || '',
    manifest:manifest?.provider === 'boombah' ? `/designer/boombah/products/${String(manifest.product?.id || '').toLowerCase()}.json` : OWAYO_MANIFEST_URL,
    model:selectedDesign?.modelId || manifest?.product?.model || '253m_KA',
    product:manifest?.product?.name || 'Cycling Jersey C3 Basic Short Sleeve',
    productId:manifest?.product?.id || '',
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
    text:state.text,
    logo:{ name:state.logo.name, x:state.logo.x, y:state.logo.y, scale:state.logo.scale, rotation:state.logo.rotation },
    roster:state.roster.map(player => ({ name:player.name, number:player.number, size:player.size }))
  }
}

async function fileFromDataUrl(dataUrl, name = 'team-logo.png') {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], name, { type:blob.type || 'image/png' })
}

export default function CustomDesignerPage({ products = [], onAdd, onNavigate }) {
  const routeParams = useMemo(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    return {
      listing: params.get('listing') || params.get('handle') || '',
      provider: params.get('provider') || '',
      product: params.get('product') || '',
      style: params.get('style') || '',
      design: params.get('design') || ''
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
  const [owayoManifest, setOwayoManifest] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [manifestError, setManifestError] = useState('')
  const [stageStatus, setStageStatus] = useState('loading')
  const [activeTab, setActiveTab] = useState('design')
  const [saved, setSaved] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [added, setAdded] = useState(false)
  const [requestKey, setRequestKey] = useState(() => `request_${id().replace(/-/g, '')}`)
  const logoUploadRef = useRef({ dataUrl:'', result:null })
  const history = useDesignerHistory(initialDesignerState())
  const stageRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const readJson = async url => {
      const response = await fetch(`${url}?v=${Date.now()}`, { cache:'no-store' })
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
      const [owayoResult, boombahResult] = await Promise.allSettled([readJson(OWAYO_MANIFEST_URL), readJson(BOOMBAH_CATALOG_URL)])
      if (cancelled) return
      const owayo = owayoResult.status === 'fulfilled' ? owayoResult.value : null
      const boombahCatalog = boombahResult.status === 'fulfilled' ? boombahResult.value : null
      if (owayo) setOwayoManifest(owayo)
      if (boombahCatalog) setCatalog(boombahCatalog)
      if (!owayo && !boombahCatalog) throw new Error('Cycling and teamwear designer assets are temporarily unavailable.')
      let draft = null
      try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null') } catch {}
      const requestedProvider = String(designer?.provider || routeParams.provider || draft?.provider || '').toLowerCase()
      const provider = requestedProvider === 'boombah' && boombahCatalog ? 'boombah' : requestedProvider === 'owayo' && owayo ? 'owayo' : (owayo ? 'owayo' : 'boombah')
      const productId = designer?.productId || routeParams.product || draft?.productId || boombahCatalog?.defaultProductId || boombahCatalog?.products?.[0]?.id || ''
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
      history.replace(seed)
      if (provider === 'owayo') {
        setManifest(owayo)
        const first = owayo.designs?.[0]?.slug || 'etape'
        history.update(current => ({ ...current, provider:'owayo', productId:'', styleCode:'', design:owayo.designs?.some(item => item.slug === current.design) ? current.design : first }))
        return
      }
      const product = boombahCatalog.products?.find(item => item.id === productId)
        || (resolvedListing ? null : boombahCatalog.products?.[0])
      if (!product?.manifest) throw new Error('The Boombah catalog has no product manifest.')
      let productResponse
      try {
        productResponse = await readJson(product.manifest)
      } catch (error) {
        if (!owayo) throw error
        setManifest(owayo)
        const first = owayo.designs?.[0]?.slug || 'etape'
        history.update(current => ({ ...current, provider:'owayo', productId:'', styleCode:'', design:first }))
        return
      }
      if (cancelled) return
      setManifest(productResponse)
      const allowedDesigns = designer?.allowedDesignIds?.length ? productResponse.designs?.filter(item => designer.allowedDesignIds.includes(item.id) || designer.allowedDesignIds.includes(item.slug)) : productResponse.designs
      const first = allowedDesigns?.[0] || productResponse.designs?.[0]
      const designMatch = allowedDesigns?.find(item => item.id === seed.design || item.slug === seed.design)
      const styleMatch = designer?.allowedStyleCodes?.length && !designer.allowedStyleCodes.includes(seed.styleCode) ? first?.styleCode : (seed.styleCode || first?.styleCode || '')
      history.update(current => ({ ...current, provider:'boombah', productId:product.id, styleCode:styleMatch, design:designMatch?.id || first?.id || '', colors:{ ...current.colors, ...(first?.defaultColors || {}) } }))
    }
    bootstrap().catch(error => {
      if (cancelled) return
      setListingLoading(false)
      setListingError(error.message || 'The selected listing could not be opened.')
      setManifestError(error.message || 'Designer assets could not be loaded.')
    })
    return () => { cancelled = true }
  }, [draftKey])

  const loadBoombahProduct = useCallback(async productId => {
    if (routeParams.listing && productId !== routeParams.product) return
    const product = catalog?.products?.find(item => item.id === productId)
    if (!product?.manifest) return
    setStageStatus('loading')
    setManifestError('')
    try {
      const response = await fetch(`${product.manifest}?v=${Date.now()}`, { cache:'no-store' })
      if (!response.ok) throw new Error(`Boombah product assets returned ${response.status}.`)
      const next = await response.json()
      setManifest(next)
      const first = next.designs?.[0]
      history.update(current => ({ ...current, provider:'boombah', productId, styleCode:first?.styleCode || '', design:first?.id || first?.slug || '' , colors:{ ...current.colors, ...(first?.defaultColors || {}) } }))
    } catch (error) {
      setManifestError(error.message || 'Boombah product assets could not be loaded.')
    }
  }, [catalog, history.update, routeParams.listing, routeParams.product])

  const changeProvider = useCallback(provider => {
    if (routeParams.listing) return
    if (provider === 'owayo' && owayoManifest) {
      setManifest(owayoManifest)
      const first = owayoManifest.designs?.[0]?.slug || 'etape'
      history.update(current => ({ ...current, provider:'owayo', productId:'', styleCode:'', design:first }))
      return
    }
    const productId = catalog?.defaultProductId || catalog?.products?.[0]?.id
    if (provider === 'boombah' && productId) loadBoombahProduct(productId)
  }, [catalog, history.update, loadBoombahProduct, owayoManifest, routeParams.listing])

  useEffect(() => {
    setSaved(false)
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(history.state)); setSaved(true) } catch { setSaved(false) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [draftKey, history.state])

  const customProduct = useMemo(() => {
    if (routeParams.listing) return listingProduct
    const candidates = products.filter(product => {
    const searchText = [product?.name, product?.title, product?.type, product?.productGroup, product?.taxonomy?.category].filter(Boolean).join(' ')
    return product?.customFields?.length && /jersey|shirt|kit/i.test(searchText) && activeVariant(product,history.state)
    })
    return candidates.find(product => product.customFields.some(field => field.type === 'logo')) || candidates[0]
  }, [listingProduct, products, routeParams.listing, history.state.roster])
  const variant = activeVariant(customProduct, history.state)
  const unitPrice = Number(variant?.price ?? customProduct?.price ?? 79)
  const quantity = Math.max(1, history.state.roster.length)
  const discount = quantityDiscountForQty(quantity, DEFAULT_QUANTITY_DISCOUNT_POLICY).discountPercent / 100
  const total = unitPrice * quantity * (1 - discount)
  const selectedDesign = manifest?.designs?.find(item => item.slug === history.state.design || item.id === history.state.design)
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
      if (history.state.logo.dataUrl && !logoField) throw new Error('This live jersey does not accept a team logo. Choose a jersey with logo personalization.')
      if (history.state.logo.dataUrl && logoField.requiresConsent !== false && !history.state.logo.consent) throw new Error('Confirm that you own or have permission to use the uploaded logo.')
      let logoUrl = ''
      const assetRefs = {}
      if (history.state.logo.dataUrl) {
        let uploaded = logoUploadRef.current.dataUrl === history.state.logo.dataUrl ? logoUploadRef.current.result : null
        if (!uploaded) {
          const file = await fileFromDataUrl(history.state.logo.dataUrl, history.state.logo.name || 'team-logo.png')
          uploaded = await uploadCustomerReference(file, customProduct.id, logoField.key, 'logo')
          logoUploadRef.current = { dataUrl:history.state.logo.dataUrl, result:uploaded }
        }
        logoUrl = uploaded.imageUrl
        assetRefs[logoField.key] = uploaded.storage
      } else {
        logoUploadRef.current = { dataUrl:'', result:null }
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
        note,
        logoConsent:Boolean(history.state.logo.dataUrl && history.state.logo.consent),
        designer:designerPayload(history.state, selectedDesign, manifest, customProduct)
      })
      const requestId = result?.data?.id
      if (!requestId) throw new Error('The design request was not created. Please retry.')
      onAdd?.(customProduct, {
        variant,
        options:variant.values || {},
        quantity,
        customization:{ requestId, fields, note, hasLogo:Boolean(history.state.logo.dataUrl), logoConsent:Boolean(history.state.logo.consent), designer:designerPayload(history.state, selectedDesign, manifest, customProduct) }
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

  const Panel = activeTab === 'design' ? DesignPanel : activeTab === 'colors' ? ColorPanel : activeTab === 'patterns' ? PatternPanel : activeTab === 'text' ? TextPanel : LogoPanel
  return <main className="custom-designer">
    <header className="custom-designer__header">
      <button type="button" className="custom-designer__back" onClick={() => onNavigate?.('/custom')}><ArrowLeft size={17}/> Custom lab</button>
      <div><span>Jersevo 3D kit builder</span><strong>{stripBoombahBrandingText(manifest.product.name)}</strong></div>
      <p><span className={`custom-designer__status is-${stageStatus}`}/>{stageStatus === 'ready' ? `${manifestIsBoombah(manifest) ? 'Teamwear' : 'Cycling'} 3D · mirrored assets` : stageStatus === 'error' ? 'Preview unavailable' : 'Loading model'}</p>
    </header>
    <div className="custom-designer__workspace">
      <section className="designer-stage" aria-label="3D jersey workspace">
        <div className="designer-stage__meta"><span>{selectedDesign?.name || 'Custom design'}</span><strong>{history.state.text.team || 'Your team'}</strong></div>
        <JerseyStage ref={stageRef} manifest={manifest} design={history.state.design} colors={history.state.colors} pattern={history.state.pattern} text={history.state.text} logo={history.state.logo} onStatus={setStageStatus}/>
        {stageStatus === 'loading' && <div className="designer-stage__loading"><span>90+</span><p>Stitching the 3D preview…</p></div>}
        {stageStatus === 'error' && <div className="designer-stage__loading is-error"><span>!</span><p>The design is saved. Reload to restore the 3D preview.</p></div>}
        <div className="designer-stage__tools" aria-label="3D view controls">
          <button type="button" onClick={() => stageRef.current?.zoom(1)} aria-label="Zoom in"><ZoomIn size={18}/></button>
          <button type="button" onClick={() => stageRef.current?.zoom(-1)} aria-label="Zoom out"><ZoomOut size={18}/></button>
          <button type="button" onClick={() => stageRef.current?.rotate(-1)} aria-label="Rotate left"><Rotate3D size={18}/></button>
          <button type="button" onClick={() => stageRef.current?.reset()} aria-label="Reset 3D view"><span>0°</span></button>
        </div>
        <div className="designer-stage__history">
          <button type="button" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={16}/> Undo</button>
          <button type="button" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={16}/> Redo</button>
        </div>
        <p className="designer-stage__hint"><Move size={14}/> Drag to rotate · pinch or scroll to zoom</p>
      </section>
      <aside className="designer-controls">
        <nav className="designer-tabs" aria-label="Design tools">{TABS.map(tab => { const Icon = tab.icon; return <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}><Icon size={17}/><span>{tab.label}</span></button> })}</nav>
        <div className="designer-controls__scroll"><Panel manifest={manifest} catalog={catalog} owayoAvailable={Boolean(owayoManifest)} state={history.state} update={history.update} onProviderChange={changeProvider} onOpenDesign={() => setActiveTab('design')} onProductChange={loadBoombahProduct}/></div>
        <Roster state={history.state} update={history.update} sizes={selectedDesign?.sizes || manifest.product.sizes || []}/>
        <footer className="designer-order">
          <div className="designer-order__price"><span>{quantity} {quantity === 1 ? 'piece' : 'pieces'}{discount ? ` · ${Math.round(discount * 100)}% team saving` : ''}</span><strong>${total.toFixed(2)}</strong><small>{discount ? `$${unitPrice.toFixed(2)} each before team pricing` : 'Artwork review included'}</small></div>
          {submitError && <p className="designer-order__error" role="alert">{submitError}</p>}
          <div className="designer-order__actions"><button type="button" className="designer-save" onClick={saveNow}><Save size={16}/>{saved ? 'Draft saved' : 'Save draft'}</button><button type="button" className="designer-add" disabled={submitting} onClick={addToBag}><ShoppingBag size={17}/>{submitting ? 'Saving design…' : added ? 'Added to bag' : customProduct && variant ? 'Add team order' : 'Choose a live jersey'}</button></div>
        </footer>
      </aside>
    </div>
    <section className="designer-assurance" aria-label="Design review process"><div><CheckCircle2 size={19}/><span><strong>Design check</strong><small>Placement, spelling and print zones reviewed before production.</small></span></div><div><UsersRound size={19}/><span><strong>One design, every player</strong><small>Names, numbers and sizes stay organized in one roster.</small></span></div><div><Shirt size={19}/><span><strong>Production-ready handoff</strong><small>The exact design state travels with the cart line.</small></span></div></section>
  </main>
}
