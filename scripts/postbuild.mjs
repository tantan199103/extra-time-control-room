import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// The normal build only generates static SEO pages. Explicit one-shot Vercel
// builds may also run the deterministic catalogue optimizer and the controlled
// publish wave while the production service key is available server-side.
// Neither flag is enabled by default; a normal local/CI build is read-only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Vite reads .env files for the browser bundle, but Node postbuild scripts do
// not. Load the local server configuration when present so a local production
// build generates SEO/sitemap/feed files from the same live catalogue as the
// deployed build. Explicit process variables always win; no secret is written
// into dist or exposed to the client bundle.
for (const envFile of ['.env.local', '.env']) {
  const path = resolve(root, envFile)
  if (!fs.existsSync(path)) continue
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    const name = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[name]) process.env[name] = value
  }
}

function runScript(script, args = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts', script), ...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${script} exited with code ${code}`))
    })
  })
}

if (String(process.env.SEO_OPTIMIZE_ON_BUILD || '').toLowerCase() === 'true') {
  await runScript('optimize-seo-listings.mjs', ['--write'])
}

if (String(process.env.SEO_PUBLISH_WAVE_ON_BUILD || '').toLowerCase() === 'true') {
  await runScript('publish-seo-wave.mjs', ['--write'])
}

if (String(process.env.FANGEAR_IMPORT_ON_BUILD || '').toLowerCase() === 'true') {
  process.argv.push('--write')
  if (String(process.env.FANGEAR_IMPORT_MEDIA || 'true').toLowerCase() !== 'false') process.argv.push('--media')
  const importer = await import('./import-fangear-catalog.mjs')
  await importer.run()
}

// Generate static pages last so they reflect any explicitly requested
// optimizer/import/publish changes made during this build.
await import('./generate-seo-pages.mjs')

// Merchant Center consumes a static snapshot.  The generator has its own
// exact-count/keyset completeness guard and is intentionally last so a
// partially generated SEO build can never leave a fresh-looking feed behind.
await runScript('generate-merchant-feed.mjs')
