import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// The normal build only generates static SEO pages. Explicit one-shot Vercel
// builds may also run the deterministic catalogue optimizer and the controlled
// publish wave while the production service key is available server-side.
// Neither flag is enabled by default; a normal local/CI build is read-only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
