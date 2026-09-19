// The normal build only generates static SEO pages. A one-shot, explicitly
// requested Vercel build may also run the trusted Fangear importer while the
// production service key is available server-side. The flag is never enabled
// by default and is intentionally not persisted in the repository.
await import('./generate-seo-pages.mjs')

if (String(process.env.FANGEAR_IMPORT_ON_BUILD || '').toLowerCase() === 'true') {
  process.argv.push('--write')
  if (String(process.env.FANGEAR_IMPORT_MEDIA || 'true').toLowerCase() !== 'false') process.argv.push('--media')
  const importer = await import('./import-fangear-catalog.mjs')
  await importer.run()
}
