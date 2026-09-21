import React, { useEffect, useId, useRef, useState } from 'react'

const MODEL_URL = '/assets/models/jersey.glb'
const MAX_NAME_LENGTH = 12
const MAX_NUMBER_LENGTH = 2

function cleanName(value) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9À-Ỹ -]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME_LENGTH)
}

function cleanNumber(value) {
  return value.replace(/\D/g, '').slice(0, MAX_NUMBER_LENGTH)
}

function drawDecal(canvas, name, number) {
  const width = 1024
  const height = 1220
  const context = canvas.getContext('2d')
  if (!context) return
  canvas.width = width
  canvas.height = height
  context.clearRect(0, 0, width, height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#f4f3ee'
  context.strokeStyle = '#f8f04a'
  context.lineJoin = 'round'

  const nameText = name || 'YOUR NAME'
  const nameSize = Math.max(42, Math.min(92, 560 / Math.max(nameText.length, 6)))
  context.font = `800 ${nameSize}px "Arial Narrow", "Barlow Condensed", Arial, sans-serif`
  context.letterSpacing = '12px'
  context.fillText(nameText, width / 2, 235)

  const numberText = number || '00'
  context.font = '900 420px "Arial Narrow", "Barlow Condensed", Arial, sans-serif'
  context.lineWidth = 10
  context.strokeText(numberText, width / 2, 665)
  context.fillText(numberText, width / 2, 665)
}

function FallbackJersey({ name, number }) {
  const uid = useId().replace(/:/g, '')
  const patternId = `home-jersey-grid-${uid}`
  const clipId = `home-shirt-clip-${uid}`
  return (
    <svg className="jersey-svg" viewBox="0 0 520 600" role="img" aria-label={`Custom jersey preview with ${name || 'your name'} number ${number || '00'}`}>
      <defs>
        <pattern id={patternId} width="26" height="26" patternUnits="userSpaceOnUse"><path d="M 26 0 L 0 0 0 26" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2" /></pattern>
        <clipPath id={clipId}><path d="M185 70 116 101 32 181l64 91 54-35v283h220V237l54 35 64-91-84-80-69-31c-22 36-52 45-75 45s-53-9-75-45Z" /></clipPath>
      </defs>
      <path d="M185 70 116 101 32 181l64 91 54-35v283h220V237l54 35 64-91-84-80-69-31c-22 36-52 45-75 45s-53-9-75-45Z" fill="#131313" stroke="#f2f1e9" strokeWidth="3" />
      <rect x="20" y="55" width="480" height="480" fill={`url(#${patternId})`} color="#f8f04a" clipPath={`url(#${clipId})`} />
      <path d="M185 70c17 54 53 65 75 65s58-11 75-65" fill="none" stroke="#f2f1e9" strokeWidth="14" />
      <path d="M335 75c34 120 24 291 35 445" fill="none" stroke="#f8f04a" strokeWidth="5" />
      <path d="m32 181 64 91m392-91-64 91M150 237v283m220-283v283" fill="none" stroke="#f2f1e9" strokeWidth="3" opacity=".7" />
      <text x="260" y="224" textAnchor="middle" fill="#f4f3ee" fontFamily="Barlow Condensed" fontWeight="700" fontSize="42" letterSpacing="3">{name || 'YOUR NAME'}</text>
      <text x="260" y="410" textAnchor="middle" fill="#f4f3ee" stroke="#f8f04a" strokeWidth="2" paintOrder="stroke" fontFamily="Barlow Condensed" fontWeight="800" fontSize="190" letterSpacing="-8">{number || '00'}</text>
      <g transform="translate(383 170)"><circle r="31" fill="#f4f3ee" /><text y="8" textAnchor="middle" fill="#0a0a0a" fontFamily="Barlow Condensed" fontWeight="800" fontSize="24">90+</text></g>
    </svg>
  )
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch {
    return false
  }
}

function ThreeRearView({ name, number, onReady, onError, shouldLoad }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const decalCanvasRef = useRef(null)
  const decalTextureRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    if (!shouldLoad || !canvasRef.current || !stageRef.current || !hasWebGL()) {
      if (shouldLoad && !hasWebGL()) onError?.()
      return undefined
    }

    let disposed = false
    let resizeObserver
    let renderer
    let scene
    let camera
    let decalMesh

    const render = () => {
      if (!disposed && renderer && scene && camera) renderer.render(scene, camera)
    }

    const setup = async () => {
      try {
        const [THREE, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/libs/meshopt_decoder.module.js')
        ])
        if (disposed) return

        renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true, powerPreference: 'high-performance' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.05
        rendererRef.current = renderer

        scene = new THREE.Scene()
        sceneRef.current = scene
        camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100)
        camera.position.set(0, 0.02, 2.45)
        camera.lookAt(0, 0.02, 0)
        cameraRef.current = camera

        scene.add(new THREE.HemisphereLight(0xf5f2e9, 0x171717, 2.2))
        const keyLight = new THREE.DirectionalLight(0xffffff, 3.1)
        keyLight.position.set(-1.4, 2.2, 3)
        scene.add(keyLight)
        const fillLight = new THREE.DirectionalLight(0xf8f04a, 0.55)
        fillLight.position.set(1.5, 0.2, 2)
        scene.add(fillLight)

        const loader = new GLTFLoader()
        loader.setMeshoptDecoder(MeshoptDecoder)
        const gltf = await loader.loadAsync(MODEL_URL)
        if (disposed) return

        const model = gltf.scene
        const bounds = new THREE.Box3().setFromObject(model)
        const size = bounds.getSize(new THREE.Vector3())
        const center = bounds.getCenter(new THREE.Vector3())
        model.position.sub(center)
        model.scale.setScalar(1.72 / Math.max(size.y, 0.01))
        model.rotation.y = Math.PI
        model.traverse(object => {
          if (!object.isMesh) return
          object.castShadow = false
          object.receiveShadow = false
          if (object.material) {
            object.material.roughness = Math.max(object.material.roughness || 0.7, 0.72)
          }
        })
        scene.add(model)

        const decalCanvas = document.createElement('canvas')
        decalCanvasRef.current = decalCanvas
        drawDecal(decalCanvas, name, number)
        const decalTexture = new THREE.CanvasTexture(decalCanvas)
        decalTexture.colorSpace = THREE.SRGBColorSpace
        decalTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        decalTextureRef.current = decalTexture
        const decalMaterial = new THREE.MeshBasicMaterial({ map: decalTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
        decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.69, 0.82), decalMaterial)
        decalMesh.position.set(0, 0.14, 0.29)
        scene.add(decalMesh)

        const resize = () => {
          if (!stageRef.current || !renderer || !camera) return
          const { clientWidth, clientHeight } = stageRef.current
          if (!clientWidth || !clientHeight) return
          renderer.setSize(clientWidth, clientHeight, false)
          camera.aspect = clientWidth / clientHeight
          camera.updateProjectionMatrix()
          render()
        }
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(stageRef.current)
        resize()
        onReady?.()
      } catch (error) {
        if (!disposed) onError?.(error)
      }
    }

    setup()
    return () => {
      disposed = true
      resizeObserver?.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      decalMesh?.geometry.dispose()
      if (decalMesh?.material) {
        decalMesh.material.map?.dispose()
        decalMesh.material.dispose()
      }
      renderer?.dispose()
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
    }
  }, [shouldLoad])

  useEffect(() => {
    if (!decalCanvasRef.current || !decalTextureRef.current) return
    drawDecal(decalCanvasRef.current, name, number)
    decalTextureRef.current.needsUpdate = true
    if (rendererRef.current && sceneRef.current && cameraRef.current) rendererRef.current.render(sceneRef.current, cameraRef.current)
  }, [name, number])

  return <div className="home-personalizer__canvas-stage" ref={stageRef}><canvas ref={canvasRef} aria-label="Live rear view jersey preview" /></div>
}

export default function HomeJerseyPersonalizer() {
  const rootRef = useRef(null)
  const [name, setName] = useState('TAN')
  const [number, setNumber] = useState('07')
  const [shouldLoad, setShouldLoad] = useState(false)
  const [modelState, setModelState] = useState('idle')

  useEffect(() => {
    const element = rootRef.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true)
      return undefined
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setShouldLoad(true)
        observer.disconnect()
      }
    }, { rootMargin: '280px 0px', threshold: 0.01 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const showFallback = modelState !== 'ready'

  return (
    <div className="home-personalizer" ref={rootRef}>
      <div className="home-personalizer__stage-wrap">
        <span className="axis-label axis-label--top">LIVE REAR VIEW · MADE ON DEMAND</span>
        {showFallback && <div className="home-personalizer__fallback" aria-hidden={false}><FallbackJersey name={name} number={number} /></div>}
        {shouldLoad && <ThreeRearView name={name} number={number} shouldLoad={shouldLoad} onReady={() => setModelState('ready')} onError={() => setModelState('error')} />}
        <span className="axis-label axis-label--bottom">NAME + NUMBER / LIVE PREVIEW</span>
      </div>
      <form className="home-personalizer__controls" onSubmit={event => event.preventDefault()}>
        <div className="home-personalizer__field">
          <label htmlFor="home-jersey-name">NAME <span>MAX {MAX_NAME_LENGTH}</span></label>
          <input id="home-jersey-name" value={name} maxLength={MAX_NAME_LENGTH} autoComplete="off" spellCheck="false" onChange={event => setName(cleanName(event.target.value))} placeholder="YOUR NAME" />
        </div>
        <div className="home-personalizer__field home-personalizer__field--number">
          <label htmlFor="home-jersey-number">NUMBER <span>00–99</span></label>
          <input id="home-jersey-number" value={number} maxLength={MAX_NUMBER_LENGTH} inputMode="numeric" autoComplete="off" onChange={event => setNumber(cleanNumber(event.target.value))} placeholder="07" />
        </div>
        <p className="home-personalizer__hint">The artwork stays fixed. Edit only the name and number, then continue to the product.</p>
      </form>
    </div>
  )
}
