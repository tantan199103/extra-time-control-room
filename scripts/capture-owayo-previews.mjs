import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const ROOT = resolve(process.cwd())
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9222
const PROFILE = join(tmpdir(), 'jersevo-owayo-preview-chrome')
const BASE = process.env.PREVIEW_CAPTURE_BASE || 'https://www.jersevo.com'
function defaultDesignFor(id) {
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'designer', 'owayo', id, 'manifest.json'), 'utf8'))
    return manifest.designs?.find(item => item?.slug)?.slug || ''
  } catch { return '' }
}

const TARGETS = (process.argv.slice(2).length ? process.argv.slice(2) : ['cycling-c5']).map(value => {
  const [id, requestedDesign] = String(value).split(':', 2)
  const design = requestedDesign || defaultDesignFor(id) || (/^cycling-(?:m|ml|f|fl)/i.test(id) ? 'derny' : 'etape')
  return { id, design, named:Boolean(requestedDesign) }
})

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

async function waitForDebugPort() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      if (response.ok) return response.json()
    } catch {}
    await sleep(250)
  }
  throw new Error('Chrome remote debugging endpoint did not start.')
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
    this.events = new Map()
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.addEventListener('open', () => resolveReady())
      this.ws.addEventListener('error', event => rejectReady(event.error || new Error('CDP websocket failed.')))
    })
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePending, reject: rejectPending } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) rejectPending(new Error(message.error.message || 'CDP command failed.'))
        else resolvePending(message.result)
        return
      }
      const listeners = this.events.get(message.method) || []
      listeners.forEach(listener => listener(message.params || {}))
    })
  }

  async command(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    const listeners = this.events.get(method) || []
    listeners.push(listener)
    this.events.set(method, listeners)
  }

  close() {
    this.ws.close()
  }
}

async function waitFor(cdp, expression, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await cdp.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result?.result?.value) return result.result.value
    await sleep(500)
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}

async function captureOne(cdp, { id, design, named }) {
  const url = `${BASE}/custom/design?provider=owayo&product=${encodeURIComponent(id)}&design=${design}&preview=1`
  await cdp.command('Page.navigate', { url })
  await waitFor(cdp, `document.readyState === 'complete'`)
  await waitFor(cdp, `(() => { const c = document.querySelector('canvas'); return Boolean(c && c.width > 10 && c.height > 10 && document.body.innerText.includes('mirrored assets')); })()`)
  await sleep(2800)
  await cdp.command('Runtime.evaluate', { expression: `(() => {
    const style = document.createElement('style')
    style.textContent = '.designer-stage__hint,.designer-stage__tools,.designer-stage__history,.designer-stage__meta,.designer-stage__scene{display:none!important}'
    document.head.appendChild(style)
    return true
  })()`, returnByValue: true })
  await sleep(120)
  const rect = await waitFor(cdp, `(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x:Math.max(0,r.x), y:Math.max(0,r.y), width:Math.max(1,r.width), height:Math.max(1,r.height) }; })()`)
  const screenshot = await cdp.command('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { ...rect, scale: 1 } })
  const targetDir = join(ROOT, 'public', 'designer', 'owayo', id, 'previews')
  await mkdir(targetDir, { recursive: true })
  const fileStem = named ? `garment-${design.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}` : 'garment-render'
  const pngPath = join(targetDir, `${fileStem}.png`)
  const webpPath = join(targetDir, `${fileStem}.webp`)
  await writeFile(pngPath, Buffer.from(screenshot.data, 'base64'))
  const source = sharp(pngPath)
  const metadata = await source.metadata()
  const usableHeight = Math.max(1, Math.round((metadata.height || 1) * 0.88))
  await source.extract({ left: 0, top: 0, width: metadata.width || 1, height: usableHeight })
    .resize({ width: 720, height: 960, fit: 'contain', background: '#f5f6f3' })
    .webp({ quality: 84 })
    .toFile(webpPath)
  await rm(pngPath, { force: true })
  return { id, design, rect, path: webpPath }
}

await mkdir(PROFILE, { recursive: true })
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=960,960',
  `--user-data-dir=${PROFILE}`,
  'about:blank'
], { windowsHide: true, stdio: 'ignore' })

try {
  const pages = await waitForDebugPort()
  const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
  if (!page) throw new Error('No page target was returned by Chrome.')
  const cdp = new Cdp(page.webSocketDebuggerUrl)
  await cdp.command('Page.enable')
  await cdp.command('Runtime.enable')
  await cdp.command('Emulation.setDeviceMetricsOverride', { width: 960, height: 960, deviceScaleFactor: 1, mobile: false })
  const results = []
  for (const target of TARGETS) results.push(await captureOne(cdp, target))
  cdp.close()
  console.log(JSON.stringify(results, null, 2))
} finally {
  chrome.kill()
}
