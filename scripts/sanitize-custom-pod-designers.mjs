import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DESIGNER_DIR = path.resolve(ROOT, 'public/designer')

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item)
    if (fs.statSync(full).isDirectory()) {
      walkDir(full, callback)
    } else {
      callback(full)
    }
  }
}

console.log('--- EXHAUSTIVE DE-BRANDING PASS FOR CUSTOM POD ---')

walkDir(DESIGNER_DIR, (filePath) => {
  if (!filePath.endsWith('.json') && !filePath.endsWith('.svg')) return

  let content = fs.readFileSync(filePath, 'utf8')
  const original = content

  // 1. URLs
  content = content.replace(/https?:\/\/(?:www\.)?owayo\.com[^\s",]*/gi, '')
  content = content.replace(/https?:\/\/static\.owayo-cdn\.com[^\s",]*/gi, '')
  content = content.replace(/https?:\/\/(?:www\.|builder\.|media\.)?boombah\.com[^\s",]*/gi, '')
  content = content.replace(/https?:\/\/res\.cloudinary\.com\/boombld[^\s",]*/gi, '')

  // 2. Paths
  content = content.replace(/\/designer\/owayo\//g, '/designer/studio/')
  content = content.replace(/designer\/owayo\//g, 'designer/studio/')
  content = content.replace(/\/designer\/boombah\//g, '/designer/teamwear/')
  content = content.replace(/designer\/boombah\//g, 'designer/teamwear/')

  // 3. Provider identifiers
  content = content.replace(/"provider":\s*"owayo"/gi, '"provider": "studio"')
  content = content.replace(/"provider":\s*"boombah"/gi, '"provider": "teamwear"')

  // 4. Specific strings
  content = content.replace(/\bBoombah Logo Color\b/gi, 'Brand Accent Color')
  content = content.replace(/\bBoombah\s+/gi, 'Custom ')
  content = content.replace(/\bBoombah\b/gi, 'Custom POD')
  content = content.replace(/\bboombah-logo\b/gi, 'vendor-logo')
  content = content.replace(/\bowayo\s+Reißverschlussfarben\b/gi, 'Zipper Color')
  content = content.replace(/\bowayo\s+Farbverlauf-Logo\b/gi, 'Gradient Accent')
  content = content.replace(/\bOwayo\s+vendor\s+marks/gi, 'Vendor marks')
  content = content.replace(/\bowayo\b/gi, 'studio')

  if (filePath.endsWith('.json')) {
    try {
      const obj = JSON.parse(content)

      // Remove scraper-derived fields
      delete obj.source
      delete obj.ownerConfirmedByOperator
      delete obj.configurator
      delete obj.productEndpoint
      delete obj.assetOrigin
      delete obj.assetOrigins
      delete obj.builder
      delete obj.site

      // If catalog.json with products array
      if (Array.isArray(obj.products)) {
        for (const p of obj.products) {
          delete p.sourceUrl
        }
      }

      // Check for clean branding field
      if (obj.branding) {
        obj.branding = {
          removed: 'Vendor marks, production colors, cut guides and artwork targets from synchronized templates'
        }
      }

      content = JSON.stringify(obj, null, 2) + '\n'
    } catch (e) {
      // not strict JSON or parse error, keep string replacement
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8')
  }
})

console.log('Exhaustive de-branding pass complete!')
