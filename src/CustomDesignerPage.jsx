import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
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
import { createCustomizationOrder, getCustomerSessionId, uploadCustomerReference } from './lib/storefront-api'
import { DEFAULT_QUANTITY_DISCOUNT_POLICY, quantityDiscountForQty } from './lib/quantity-pricing'
import './custom-designer.css'

const MANIFEST_URL = '/designer/owayo/cycling-c3/manifest.json'
const DRAFT_KEY = 'jersevo-3d-designer-draft-v1'
const COLOR_SWATCHES = [
  '#111311', '#F8F8F4', '#F3ED45', '#2876FF', '#EF3340', '#F97316',
  '#7C3AED', '#EC4899', '#12B981', '#00A6A6', '#82C91E', '#7DD3FC',
  '#8B5E3C', '#B7BAC2', '#555B66', '#F1C27D', '#6E1423', '#16324F'
]
const TABS = [
  { id:'design', label:'Design', icon:Shirt },
  { id:'colors', label:'Colors', icon:Palette },
  { id:'text', label:'Text', icon:Type },
  { id:'logos', label:'Logos', icon:ImageIcon }
]

function id() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function initialDesignerState() {
  return {
    design:'etape',
    colors:{ A:'#111311', B:'#F3ED45', C:'#2876FF', K:'#111311' },
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

function maskMaterial(maskMap, paletteMap) {
  maskMap.minFilter = THREE.NearestFilter
  maskMap.magFilter = THREE.NearestFilter
  maskMap.generateMipmaps = false
  maskMap.colorSpace = THREE.NoColorSpace
  const material = new THREE.ShaderMaterial({
    uniforms:{ maskMap:{ value:maskMap }, paletteMap:{ value:paletteMap } },
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

const JerseyStage = forwardRef(function JerseyStage({ manifest, design, colors, text, logo, onStatus }, ref) {
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
        const response = await fetch(manifest.model.uri)
        if (!response.ok) throw new Error(`Model request failed (${response.status}).`)
        const parsed = parseMirl(await response.arrayBuffer())
        if (cancelled) return
        const partMeshes = new Map()
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
        const frontDirection = averageZ(frontPart) >= averageZ(backPart) ? 1 : -1
        const cameraDistance = Math.max(...parsed.dimensions) * 2.08
        camera.position.set(0, .1, frontDirection * cameraDistance)
        controls.target.set(0, 0, 0)
        controls.update()
        const floor = new THREE.Mesh(
          new THREE.CircleGeometry(parsed.dimensions[0] * .42, 64),
          new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:.13, depthWrite:false })
        )
        floor.rotation.x = -Math.PI / 2
        floor.position.set(0, -parsed.dimensions[1] / 2 - .08, 0)
        scene.add(floor)
        runtimeRef.current = { scene, camera, renderer, controls, model, decoration, palette, parsed, partMeshes, frontDirection, cameraDistance, floor }
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
      renderer.dispose()
      renderer.domElement.remove()
      runtimeRef.current = null
    }
  }, [manifest, onStatus])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !manifest) return
    runtime.palette.image.data.set(paletteBytes(manifest, colors))
    runtime.palette.needsUpdate = true
    renderRef.current()
  }, [manifest, colors, readyRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    const selected = manifest?.designs?.find(item => item.slug === design)
    if (!runtime || !selected) return undefined
    let cancelled = false
    const loader = new THREE.TextureLoader()
    Promise.all([...runtime.partMeshes].map(async ([name, mesh]) => {
      const uri = matchMirlTexture(name, selected.textures)
      if (!uri) return
      const mask = await loader.loadAsync(uri)
      if (cancelled) { mask.dispose(); return }
      const previous = mesh.material
      mesh.material = maskMaterial(mask, runtime.palette)
      previous?.userData?.maskMap?.dispose?.()
      previous?.dispose?.()
    })).then(() => !cancelled && renderRef.current()).catch(error => console.error('Design texture load failed', error))
    return () => { cancelled = true }
  }, [manifest, design, readyRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return undefined
    let cancelled = false
    const { decoration, parsed, frontDirection } = runtime
    while (decoration.children.length) {
      const child = decoration.children[0]
      decoration.remove(child)
      disposeObject(child)
    }
    const height = parsed.dimensions[1]
    const frontZ = frontDirection > 0 ? parsed.dimensions[2] / 2 + .08 : -parsed.dimensions[2] / 2 - .08
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

function DesignPanel({ manifest, state, update }) {
  const [showAll, setShowAll] = useState(false)
  const designs = showAll ? manifest.designs : manifest.designs.slice(0, 12)
  return <div className="designer-panel designer-panel--design">
    <div className="designer-panel__intro"><h2>Choose a base design</h2><p>The garment cut stays fixed. Switch artwork without reloading the 3D stage.</p></div>
    <div className="designer-design-grid">
      {designs.map(item => <button type="button" className={state.design === item.slug ? 'is-active' : ''} key={item.slug} onClick={() => update(current => ({ ...current, design:item.slug }))}>
        <span className="designer-design-grid__art"><img src={item.preview} alt="" loading="lazy" decoding="async"/></span>
        <span>{item.name}</span>{state.design === item.slug && <Check size={15}/>}
      </button>)}
    </div>
    {manifest.designs.length > 12 && <button type="button" className="designer-design-more" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show featured designs' : `Show all ${manifest.designs.length} designs`}</button>}
  </div>
}

function ColorPanel({ manifest, state, update }) {
  const active = manifest.designs.find(item => item.slug === state.design)
  const codes = (active?.baseColors?.length ? active.baseColors : ['A','B','C']).slice(0, 5)
  const label = code => manifest.product.colorCodes.find(item => item.colorCode === code)?.Farbname || `Color ${code}`
  return <div className="designer-panel designer-panel--colors">
    <div className="designer-panel__intro"><h2>Build your color story</h2><p>Each swatch updates the encoded material mask on the live garment.</p></div>
    {codes.map(code => <section className="designer-color-row" key={code}>
      <div><span className="designer-color-row__current" style={{ backgroundColor:state.colors[code] || '#F8F8F4' }}/><strong>{label(code)}</strong><small>{state.colors[code] || '#F8F8F4'}</small></div>
      <div className="designer-swatches">{COLOR_SWATCHES.map(color => <button key={color} type="button" style={{ '--designer-swatch':color }} className={(state.colors[code] || '').toUpperCase() === color.toUpperCase() ? 'is-active' : ''} aria-label={`Set ${label(code)} to ${color}`} onClick={() => update(current => ({ ...current, colors:{ ...current.colors, [code]:color } }))}><span/></button>)}</div>
    </section>)}
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
  const visibleSizes = sizes.map(item => item.name || item.size).filter(value => value && !/choose/i.test(value))
  const change = (playerId, patch) => update(current => ({ ...current, roster:current.roster.map(player => player.id === playerId ? { ...player, ...patch } : player) }))
  const remove = playerId => update(current => ({ ...current, roster:current.roster.filter(player => player.id !== playerId) }))
  const add = () => update(current => current.roster.length >= 99 ? current : ({ ...current, roster:[...current.roster, { id:id(), name:'', number:'', size:visibleSizes[4] || 'M' }] }))
  return <details className="designer-roster">
    <summary><span><UsersRound size={17}/><strong>Team roster</strong><small>{state.roster.length} {state.roster.length === 1 ? 'player' : 'players'}</small></span><Plus size={16}/></summary>
    <div className="designer-roster__body">
      {state.roster.map((player, index) => <div className="designer-roster__row" key={player.id}>
        <b>{String(index + 1).padStart(2, '0')}</b>
        <input aria-label={`Player ${index + 1} name`} placeholder="Player name" value={player.name} onChange={event => change(player.id,{ name:event.target.value })}/>
        <input aria-label={`Player ${index + 1} number`} placeholder="No." value={player.number} inputMode="numeric" maxLength={3} onChange={event => change(player.id,{ number:event.target.value.replace(/[^0-9]/g, '') })}/>
        <select aria-label={`Player ${index + 1} size`} value={player.size} onChange={event => change(player.id,{ size:event.target.value })}>{visibleSizes.map(size => <option key={size}>{size}</option>)}</select>
        <button type="button" disabled={state.roster.length === 1} aria-label={`Remove player ${index + 1}`} onClick={() => remove(player.id)}><Trash2 size={14}/></button>
      </div>)}
      <button type="button" className="designer-roster__add" disabled={state.roster.length >= 99} onClick={add}><Plus size={15}/> {state.roster.length >= 99 ? 'Roster limit reached' : 'Add player'}</button>
    </div>
  </details>
}

function activeVariant(product, state) {
  const variants = (product?.variants || []).filter(variant => String(variant.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Number(variant.inventory ?? 1000) > 0)
  const requestedSize = String(state.roster[0]?.size || '').match(/\((.*?)\)/)?.[1] || state.roster[0]?.size || ''
  return variants.find(variant => Object.values(variant.values || {}).some(value => String(value).toUpperCase() === String(requestedSize).toUpperCase())) || variants[0]
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
  const model = String(manifest?.product?.model || '253m_KA').trim()
  const colors = Object.entries(state.colors || {}).slice(0, 4).map(([key, value]) => `${key} ${value}`).join(', ')
  return `3D kit · ${design} · ${model} · ${team} · ${state.roster.length} player${state.roster.length === 1 ? '' : 's'} · ${colors}`.slice(0, 500)
}

function designerPayload(state, selectedDesign, manifest) {
  return {
    source:'JERSEVO_3D_DESIGNER',
    version:1,
    manifest:MANIFEST_URL,
    model:manifest?.product?.model || '253m_KA',
    product:manifest?.product?.name || 'Cycling Jersey C3 Basic Short Sleeve',
    designSlug:state.design,
    designName:selectedDesign?.name || state.design,
    colors:state.colors,
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
  const [manifest, setManifest] = useState(null)
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
    fetch(MANIFEST_URL).then(response => {
      if (!response.ok) throw new Error(`Designer assets returned ${response.status}.`)
      return response.json()
    }).then(data => {
      if (cancelled) return
      setManifest(data)
      try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
        if (draft?.design && data.designs.some(item => item.slug === draft.design)) history.replace({ ...initialDesignerState(), ...draft })
        else if (!data.designs.some(item => item.slug === history.state.design)) history.update(current => ({ ...current, design:data.designs[0]?.slug || current.design }))
      } catch {}
    }).catch(error => !cancelled && setManifestError(error.message || 'Designer assets could not be loaded.'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setSaved(false)
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(history.state)); setSaved(true) } catch { setSaved(false) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [history.state])

  const customProduct = useMemo(() => {
    const candidates = products.filter(product => {
    const searchText = [product?.name, product?.title, product?.type, product?.productGroup, product?.taxonomy?.category].filter(Boolean).join(' ')
    return product?.customFields?.length && /jersey|shirt|kit/i.test(searchText) && activeVariant(product,history.state)
    })
    return candidates.find(product => product.customFields.some(field => field.type === 'logo')) || candidates[0]
  }, [products,history.state.roster])
  const variant = activeVariant(customProduct, history.state)
  const unitPrice = Number(variant?.price ?? customProduct?.price ?? 79)
  const quantity = Math.max(1, history.state.roster.length)
  const discount = quantityDiscountForQty(quantity, DEFAULT_QUANTITY_DISCOUNT_POLICY).discountPercent / 100
  const total = unitPrice * quantity * (1 - discount)
  const selectedDesign = manifest?.designs?.find(item => item.slug === history.state.design)
  const saveNow = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(history.state)); setSaved(true) } catch { setSaved(false) }
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
        designer:designerPayload(history.state, selectedDesign, manifest)
      })
      const requestId = result?.data?.id
      if (!requestId) throw new Error('The design request was not created. Please retry.')
      onAdd?.(customProduct, {
        variant,
        options:variant.values || {},
        quantity,
        customization:{ requestId, fields, note, hasLogo:Boolean(history.state.logo.dataUrl), logoConsent:Boolean(history.state.logo.consent), designer:designerPayload(history.state, selectedDesign, manifest) }
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

  const Panel = activeTab === 'design' ? DesignPanel : activeTab === 'colors' ? ColorPanel : activeTab === 'text' ? TextPanel : LogoPanel
  return <main className="custom-designer">
    <header className="custom-designer__header">
      <button type="button" className="custom-designer__back" onClick={() => onNavigate?.('/custom')}><ArrowLeft size={17}/> Custom lab</button>
      <div><span>Jersevo 3D kit builder</span><strong>{manifest.product.name}</strong></div>
      <p><span className={`custom-designer__status is-${stageStatus}`}/>{stageStatus === 'ready' ? 'Live 3D · local assets' : stageStatus === 'error' ? 'Preview unavailable' : 'Loading model'}</p>
    </header>
    <div className="custom-designer__workspace">
      <section className="designer-stage" aria-label="3D jersey workspace">
        <div className="designer-stage__meta"><span>{selectedDesign?.name || 'Custom design'}</span><strong>{history.state.text.team || 'Your team'}</strong></div>
        <JerseyStage ref={stageRef} manifest={manifest} design={history.state.design} colors={history.state.colors} text={history.state.text} logo={history.state.logo} onStatus={setStageStatus}/>
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
        <div className="designer-controls__scroll"><Panel manifest={manifest} state={history.state} update={history.update}/></div>
        <Roster state={history.state} update={history.update} sizes={manifest.product.sizes || []}/>
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
