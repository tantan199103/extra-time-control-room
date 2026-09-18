import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Cloud Run deployment keeps the API container and public secrets out of Git', async () => {
  const dockerfile = await readFile(new URL('../backend/Dockerfile', import.meta.url), 'utf8')
  const script = await readFile(new URL('../deploy/cloudrun/deploy.ps1', import.meta.url), 'utf8')
  const envExample = await readFile(new URL('../.env.backend.example', import.meta.url), 'utf8')
  assert.match(dockerfile, /CMD \["node", "backend\/src\/server\.mjs"\]/)
  assert.match(script, /gcloud run deploy/)
  assert.match(script, /--update-secrets/)
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY\s*=/)
  assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=/)
})

test('Cloud Run domain is kept separate from the Vercel apex records', async () => {
  const docs = await readFile(new URL('../deploy/cloudrun/README.md', import.meta.url), 'utf8')
  assert.match(docs, /api\.jersevo\.com/)
  assert.match(docs, /Do not guess an A record from the Vercel IP/)
  assert.match(docs, /Secret Manager/)
})
