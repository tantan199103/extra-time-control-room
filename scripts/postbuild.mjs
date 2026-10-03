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
// Vercel injects the selected production environment before the build starts.
// Never let an uploaded developer `.env.local` fill a missing server variable
// with credentials/URLs from an older Supabase project. Local builds still
// load `.env.local` for the same deterministic workflow as before.
const isVercelBuild = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_BUILDER)
const envFiles = isVercelBuild ? ['.env'] : ['.env.local', '.env']
for (const envFile of envFiles) {
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
// optimizer/import/publish changes made during this build.  A deployment may
// opt into a shell-only release when the live catalogue is temporarily too
// slow for the build machine (for example while Supabase is running a large
// statement).  This keeps UI/asset fixes deployable without pretending that a
// partial SEO snapshot is complete; the next normal build regenerates it.
const allowPartialBuild = String(process.env.POSTBUILD_ALLOW_PARTIAL || '').toLowerCase() === 'true'
if (allowPartialBuild) {
  console.warn('[postbuild] POSTBUILD_ALLOW_PARTIAL=true; skipping live SEO/feed snapshots for this build.')
} else {
  const merchantSourceSnapshot = resolve(root, 'dist', '.merchant-products.json')
  process.env.MERCHANT_SOURCE_SNAPSHOT = merchantSourceSnapshot
  try {
    await import('./generate-seo-pages.mjs')

    // Merchant Center consumes the exact product rows already verified by the
    // SEO snapshot. It still compares them with a fresh exact count before
    // writing, but avoids downloading every heavy relation a second time.
    await runScript('generate-merchant-feed.mjs')
  } finally {
    try { fs.unlinkSync(merchantSourceSnapshot) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
}
