#!/usr/bin/env node

// Mirror Owayo's selectable pattern catalogue for the local cycling designer.
// Ready designs are stored in the garment manifest, but patterns are a
// separate stock-logo service and therefore need a separate, explicit sync.
// The browser never calls Owayo: it only reads the checked-in local assets.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { catalogRequestHeaders } from './http-user-agent.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = resolve(root, 'public')
const manifestPath = resolve(root, 'public/designer/owayo/cycling-c3/manifest.json')
const outputRoot = resolve(root, 'public/designer/owayo/cycling-c3')
const sourceOrigin = 'https://www.owayo.com'
const language = process.env.OWAYO_PATTERN_LANG || 'en'
const sport = process.env.OWAYO_PATTERN_SPORT || 'radtrikots_c3'
const write = process.argv.includes('--write')

function slug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function publicPath(path) {
  return `/${path.slice(publicRoot.length + 1).replaceAll('\\', '/')}`
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: catalogRequestHeaders({ accept: '*/*' })
  })
  if (!response.ok) throw new Error(`Pattern asset request failed (${response.status}) ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

function cleanSvg(buffer) {
  let svg = buffer.toString('utf8')
  // The preview endpoint returns static SVG. Remove editor metadata and any
  // executable/external content before it is made public to the storefront.
  svg = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    // Owayo mixes self-closing metadata nodes with paired nodes. Remove
    // self-closing nodes first; a broad paired-node regex would otherwise
    // consume the next <g> when it starts at a self-closing node.
    .replace(/<metadata\b[^>]*\/\s*>/gi, '')
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s(?:href|xlink:href)=["'](?:https?:|data:text\/html)[^"']*["']/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!/^<\?xml|<svg\b/i.test(svg)) throw new Error('Pattern preview was not an SVG document.')
  return Buffer.from(`${svg}\n`)
}

async function writeAsset(path, buffer, checksums) {
  if (write) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, buffer)
  }
  checksums[publicPath(path)] = { bytes: buffer.length, sha256: sha256(buffer) }
  return publicPath(path)
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

function uniquePatterns(categories) {
  const byId = new Map()
  for (const category of categories) {
    for (const item of Array.isArray(category.logos) ? category.logos : []) {
      if (!item || item.discarded || item.IsPattern === false) continue
      const id = String(item.stockLogoID || '').trim()
      if (!id) continue
      const current = byId.get(id)
      if (current) {
        current.categoryKeys.push(slug(category.name))
        current.categoryNames.push(category.nameLocalized || category.name)
        continue
      }
      byId.set(id, {
        id,
        name: item.nameLocalized || item.Name || `Pattern ${id}`,
        sourceName: item.Name || item.nameLocalized || `Pattern ${id}`,
        categoryKeys: [slug(category.name)],
        categoryNames: [category.nameLocalized || category.name],
        colors: Array.isArray(item.colors) ? item.colors.map((color, index) => ({
          slot: index + 1,
          color: color.colorCode || '',
          value: color.colorIntValue,
          name: color.NameImWeb || color.displayName || ''
        })) : [],
        colorVersions: Array.isArray(item.colorVersions) ? item.colorVersions.map(version => ({
          id: version.id,
          name: version.name,
          colors: version.colors || []
        })) : [],
        standardSizeCM: Number(item.standardSizeCM) || null,
        minSizeCM: Number(item.minSizeCM) || null,
        maxSizeCM: Number(item.maxSizeCM) || null,
        sourcePreview: item.previewPicture || ''
      })
    }
  }
  return [...byId.values()].map(item => {
    const base = slug(item.name) || `pattern-${item.id}`
    return { ...item, slug: `${base}-${item.id}` }
  })
}

export async function syncOwayoPatterns({ manifest, checksums = {}, persist = write } = {}) {
  if (!manifest?.product?.normalizedSlug) throw new Error('Owayo manifest product metadata is required.')
  const response = await fetch(`${sourceOrigin}/konfigurator_php/stocklogos/getAllLogos.php?lang=${encodeURIComponent(language)}&sport=${encodeURIComponent(sport)}`, {
    headers: catalogRequestHeaders({ accept: 'application/json' })
  })
  if (!response.ok) throw new Error(`Owayo pattern catalogue request failed (${response.status}).`)
  const categories = await response.json()
  if (!Array.isArray(categories)) throw new Error('Owayo pattern catalogue response was not an array.')
  const patternCategories = categories
    .filter(category => category?.isPatternKategorie === true)
    .map(category => ({
      key: slug(category.name),
      name: category.name,
      label: category.nameLocalized || category.name,
      patternIds: (category.logos || []).filter(item => !item.discarded).map(item => String(item.stockLogoID)).filter(Boolean)
    }))
    .filter(category => category.patternIds.length)
  const patterns = uniquePatterns(categories)
  const patternDir = join(outputRoot, 'patterns')
  const nextChecksums = Object.fromEntries(Object.entries(checksums).filter(([key]) => !key.startsWith('/public/')))
  const synced = await mapConcurrent(patterns, 4, async (pattern, index) => {
    const svg = cleanSvg(await fetchBuffer(`${sourceOrigin}/konfigurator_php/stocklogos/getVorschauSVG.php?id=${encodeURIComponent(pattern.id)}`))
    const svgPath = join(patternDir, `${pattern.slug}.svg`)
    const previewPath = join(patternDir, `${pattern.slug}.webp`)
    const preview = await sharp(svg, { density: 144, failOn: 'none' })
      .resize({ width: 520, height: 330, fit: 'contain', background: { r: 244, g: 245, b: 242, alpha: 1 } })
      .webp({ quality: 84, effort: 5 })
      .toBuffer()
    const texture = await writeAsset(svgPath, svg, nextChecksums)
    const previewUrl = await writeAsset(previewPath, preview, nextChecksums)
    process.stdout.write(`Synced pattern ${index + 1}/${patterns.length}: ${pattern.name}\n`)
    return {
      id: pattern.id,
      slug: pattern.slug,
      name: pattern.name,
      sourceName: pattern.sourceName,
      categoryKeys: [...new Set(pattern.categoryKeys)],
      categoryNames: [...new Set(pattern.categoryNames)],
      colors: pattern.colors,
      colorVersions: pattern.colorVersions,
      standardSizeCM: pattern.standardSizeCM,
      minSizeCM: pattern.minSizeCM,
      maxSizeCM: pattern.maxSizeCM,
      preview: previewUrl,
      texture,
      sourceId: Number(pattern.id)
    }
  })
  const syncedIds = new Set(synced.map(item => item.id))
  const nextCategories = patternCategories.map(category => ({
    ...category,
    patternIds: category.patternIds.filter(id => syncedIds.has(id))
  }))
  return {
    patterns: synced,
    patternCategories: nextCategories,
    patternLibrary: {
      provider: 'owayo',
      language,
      sport,
      source: `${sourceOrigin}/konfigurator_php/stocklogos/getAllLogos.php`,
      syncedAt: new Date().toISOString(),
      total: synced.length,
      rights: 'Operator-authorized local mirror for the Jersevo cycling designer; retain source attribution internally.'
    },
    checksums: nextChecksums
  }
}

async function cli() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const result = await syncOwayoPatterns({ manifest, checksums: manifest.checksums || {}, persist: write })
  const next = {
    ...manifest,
    patterns: result.patterns,
    patternCategories: result.patternCategories,
    patternLibrary: result.patternLibrary,
    checksums: result.checksums
  }
  if (write) await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
  const report = {
    mode: write ? 'WRITE' : 'DRY_RUN',
    categories: result.patternCategories.length,
    patterns: result.patterns.length,
    assets: result.patterns.length * 2,
    manifest: publicPath(manifestPath)
  }
  await mkdir(resolve(root, 'artifacts'), { recursive: true })
  if (write) await writeFile(resolve(root, 'artifacts/owayo-pattern-sync.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli()
