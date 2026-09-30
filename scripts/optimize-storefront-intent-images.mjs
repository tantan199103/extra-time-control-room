import { stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const assetDirectory = resolve(root, 'public', 'assets')
const assets = ['for-you', 'for-two', 'for-family', 'for-squad']
const widths = [320, 600, 896]

for (const asset of assets) {
  const source = resolve(assetDirectory, `${asset}.webp`)
  for (const width of widths) {
    const output = resolve(assetDirectory, `${asset}-${width}.webp`)
    const buffer = await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement:true })
      .webp({ quality:78, effort:6, smartSubsample:true })
      .toBuffer()
    await writeFile(output,buffer)
    const metadata = await sharp(buffer).metadata()
    if (metadata.format !== 'webp' || metadata.width !== width) {
      throw new Error(`${asset}-${width}.webp was not encoded as the expected WebP derivative.`)
    }
  }
}

const report = []
for (const asset of assets) {
  const sourceBytes = (await stat(resolve(assetDirectory,`${asset}.webp`))).size
  const derivatives = Object.fromEntries(await Promise.all(widths.map(async width => [width,(await stat(resolve(assetDirectory,`${asset}-${width}.webp`))).size])))
  report.push({ asset, sourceBytes, derivatives })
}
console.log(JSON.stringify(report,null,2))
