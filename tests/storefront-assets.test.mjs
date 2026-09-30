import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const assetPath = name => fileURLToPath(new URL(`../public/assets/${name}`,import.meta.url))

test('home intent photography uses bounded real WebP derivatives', async () => {
  const budgets = new Map([[320,55_000],[600,135_000],[896,240_000]])
  for (const asset of ['for-you','for-two','for-family','for-squad']) {
    for (const [width,maxBytes] of budgets) {
      const path = assetPath(`${asset}-${width}.webp`)
      const [metadata,file] = await Promise.all([sharp(path).metadata(),stat(path)])
      assert.equal(metadata.format,'webp',`${asset}-${width} must contain WebP bytes`)
      assert.equal(metadata.width,width,`${asset}-${width} width`)
      assert.ok(file.size <= maxBytes,`${asset}-${width} is ${file.size} bytes; budget is ${maxBytes}`)
    }
  }
})

test('home intent images expose responsive candidates and reserve their aspect ratio', async () => {
  const source = await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  assert.match(source,/\$\{card\.asset\}-320\.webp 320w, \/assets\/\$\{card\.asset\}-600\.webp 600w, \/assets\/\$\{card\.asset\}-896\.webp 896w/)
  assert.match(source,/sizes="\(max-width: 780px\) 50vw, 25vw"/)
  assert.match(source,/width="896" height="1200"[^>]+loading="lazy" decoding="async"/)
  assert.match(source,/src="\/assets\/for-two-600\.webp"[^>]+sizes="\(max-width: 780px\) 84vw, 45vw"/)
})
