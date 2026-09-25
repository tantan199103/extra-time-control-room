import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { LEAGUE_TAXONOMY } from '../src/lib/league-taxonomy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const assetRoot = path.join(rootDir, 'public', 'assets', 'leagues', 'marks', 'teams')
const manifestPath = path.join(rootDir, 'public', 'assets', 'leagues', 'marks', 'team-sources.json')
const reportPath = path.join(rootDir, 'docs', 'team-logo-audit.json')
const writeReport = process.argv.includes('--write')

let manifest = {}
try {
  manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'))
} catch {
  manifest = {}
}

const rows = []
for (const league of LEAGUE_TAXONOMY) {
  for (const team of league.teams) {
    const key = `${league.key}/${team.slug}`
    const file = path.join(assetRoot, league.key, `${team.slug}.webp`)
    const expectedSrc = `/assets/leagues/marks/teams/${league.key}/${team.slug}.webp`
    const row = {
      key,
      league: league.key,
      team: team.name,
      slug: team.slug,
      file: expectedSrc,
      exists: fs.existsSync(file),
      fallback: Boolean(team.media?.fallback),
      mappingValid: team.media?.src === expectedSrc && team.media?.fallback === false,
      sourceRecorded: Boolean(manifest.assets?.[key])
    }
    if (row.exists) {
      try {
        const metadata = await sharp(file).metadata()
        row.format = metadata.format
        row.width = metadata.width
        row.height = metadata.height
        row.hasAlpha = Boolean(metadata.hasAlpha)
        row.bytes = fs.statSync(file).size
        row.fileValid = metadata.format === 'webp' && metadata.width > 0 && metadata.height > 0
        row.valid = row.fileValid && row.mappingValid
        if (!row.mappingValid) row.error = `media resolver returned ${team.media?.src || 'no source'}`
      } catch (error) {
        row.fileValid = false
        row.valid = false
        row.error = error instanceof Error ? error.message : String(error)
      }
    } else {
      row.fileValid = false
      row.valid = false
    }
    rows.push(row)
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  total: rows.length,
  present: rows.filter(row => row.exists && row.valid).length,
  missing: rows.filter(row => !row.exists).map(row => row.key),
  invalid: rows.filter(row => row.exists && !row.valid).map(row => ({ key: row.key, error: row.error || `${row.format || 'unknown'} asset` })),
  fallback: rows.filter(row => row.fallback).map(row => row.key),
  unrecordedSources: rows.filter(row => row.exists && !row.sourceRecorded).map(row => row.key),
  rows
}

console.log(`Team logo audit: ${report.present}/${report.total} valid local WebP assets`)
if (report.missing.length) console.log(`Missing: ${report.missing.join(', ')}`)
if (report.invalid.length) console.log(`Invalid: ${report.invalid.map(item => item.key).join(', ')}`)
if (report.fallback.length) console.log(`Fallback mappings: ${report.fallback.join(', ')}`)

if (writeReport) {
  await fsPromises.mkdir(path.dirname(reportPath), { recursive: true })
  await fsPromises.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${path.relative(rootDir, reportPath)}`)
}

if (report.missing.length || report.invalid.length || report.fallback.length) process.exitCode = 1
