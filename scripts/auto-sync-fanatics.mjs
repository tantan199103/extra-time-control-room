#!/usr/bin/env node

/**
 * Compatibility entry point for the former Fanatics synchronizer.
 *
 * The old implementation drove a browser against fanatics.com and copied
 * product pages/media. That is not an acceptable default for a commercial
 * catalogue. Imports now accept only a licensed feed or an owner-provided
 * export through import-fanatics-catalog.mjs. The normalizer still performs a
 * dry-run, keeps rows in DRAFT, and blocks SEO until provenance is approved.
 */

import { run as runFeedImport } from './import-fanatics-catalog.mjs'

function hasArg(name) {
  return process.argv.includes(name)
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

export function usage() {
  console.log(`\nFanatics licensed-feed importer\n\n` +
    `  node scripts/auto-sync-fanatics.mjs --file <export.json> [--write] [--media]\n` +
    `  node scripts/auto-sync-fanatics.mjs --json '<payload>' [--write] [--media]\n\n` +
    `The former browser crawler has been removed. Do not pass --url.\n` +
    `--write requires a licensed feed, written permission, or owner-provided export\n` +
    `recorded with FANATICS_SOURCE_AUTHORIZED=true. --media additionally requires\n` +
    `FANATICS_MEDIA_AUTHORIZED=true and an explicit photography licence.\n`)
}

/**
 * Preserve the old function name for internal callers while changing its
 * source contract from remote browsing to a structured file/JSON payload.
 */
export async function runAutoSync({
  file = argValue('--file', ''),
  json = argValue('--json', ''),
  url = argValue('--url', ''),
  maxProducts = Math.max(0, Number(argValue('--limit', 0)) || 0),
  isDryRun = !hasArg('--write'),
  withMedia = hasArg('--media')
} = {}) {
  if (url) {
    throw new Error('Remote Fanatics URLs are not accepted. Use a licensed API/feed or an owner-provided JSON export with --file or --json.')
  }
  if (!file && !json) {
    throw new Error('No authorized feed supplied. Provide --file <export.json> or --json <payload>.')
  }
  return runFeedImport({
    file,
    json,
    isDryRun,
    withMedia,
    limitCount: maxProducts
  })
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/auto-sync-fanatics.mjs')
if (isMain) {
  if (hasArg('--help') || hasArg('-h')) {
    usage()
    process.exit(0)
  }
  runAutoSync().catch(error => {
    console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
