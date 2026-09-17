import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('extension manifest keeps bridge permissions and origins narrow', async () => {
  const manifest = JSON.parse(await read('../extension/public/manifest.json'))
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.permissions.sort(), ['scripting', 'sidePanel', 'storage', 'tabs'].sort())
  assert.ok(!manifest.permissions.includes('cookies'))
  assert.ok(!manifest.permissions.includes('downloads'))
  assert.ok(!manifest.host_permissions.includes('<all_urls>'))
  assert.ok(manifest.host_permissions.includes('https://chatgpt.com/*'))
  assert.ok(!manifest.host_permissions.some(origin => origin.includes('localhost')))
  const development = JSON.parse(await read('../extension/public/manifest.dev.json'))
  assert.ok(development.host_permissions.includes('http://localhost:5173/*'))
})

test('ChatGPT adapter is scoped to selected assistant messages', async () => {
  const source = await read('../extension/public/chatgpt.js')
  assert.match(source, /data-message-author-role=\\?"assistant\\?"/)
  assert.doesNotMatch(source, /document\.body\.innerText|document\.documentElement\.innerText/)
  assert.match(source, /root\.querySelectorAll\('img'\)/)
  assert.match(source, /POD_BRIDGE_RESCAN/)
  assert.match(source, /CAPTURE_ASSET/)
  assert.doesNotMatch(source, /payload:\s*\{\s*messageKey,\s*text:\s*textOf\(node\),\s*images/)
})

test('bridge transport chunks assets and validates origin, nonce and checksum', async () => {
  const [panel, receiver, relay] = await Promise.all([read('../extension/sidepanel.jsx'), read('../src/PodBridgeReceiver.jsx'), read('../extension/public/webapp.js')])
  assert.match(panel, /POD_BRIDGE_LIMITS\.chunkBytes/)
  assert.match(receiver, /event\.origin !== window\.location\.origin/)
  assert.match(receiver, /envelope\.nonce !== nonce\.current/)
  assert.match(receiver, /failed its SHA-256 check/)
  assert.match(relay, /pod-bridge-response/)
})

test('bridge receiver has no publish transition', async () => {
  const receiver = await read('../src/PodBridgeReceiver.jsx')
  assert.doesNotMatch(receiver, /status\s*[:=]\s*['"]PUBLISHED['"]/)
  assert.match(receiver, /candidate\.status = 'DRAFT'/)
})
