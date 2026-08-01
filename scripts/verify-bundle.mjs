import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../bundle', import.meta.url))
const renderers = ['tray', 'dash', 'dapp', 'onboard', 'notify']

if (!existsSync(root)) throw new Error('bundle directory does not exist')

const files = readdirSync(root)

for (const renderer of renderers) {
  const htmlPath = join(root, `${renderer}.html`)
  if (!existsSync(htmlPath)) throw new Error(`missing ${basename(htmlPath)}`)

  const html = readFileSync(htmlPath, 'utf8')
  const references = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)].map(([, reference]) =>
    basename(reference)
  )

  for (const reference of references) {
    if (!existsSync(join(root, reference))) {
      throw new Error(`${renderer}.html references missing asset ${reference}`)
    }
  }

  const expectedAssets = references.filter((reference) =>
    new RegExp(`^${renderer}\\.[a-f0-9]+\\.(?:js|css)$`).test(reference)
  )
  const expectedJavaScript = expectedAssets.filter((asset) => asset.endsWith('.js'))
  const expectedStyles = expectedAssets.filter((asset) => asset.endsWith('.css'))
  const actualAssets = files.filter((file) => new RegExp(`^${renderer}\\.[a-f0-9]+\\.(?:js|css)$`).test(file))

  if (expectedJavaScript.length !== 1 || expectedStyles.length !== 2) {
    throw new Error(
      `${renderer}.html must reference one JavaScript and two CSS assets; found ${expectedJavaScript.length} and ${expectedStyles.length}`
    )
  }

  if (
    actualAssets.length !== expectedAssets.length ||
    actualAssets.some((asset) => !expectedAssets.includes(asset))
  ) {
    throw new Error(`${renderer} has stale or unreferenced assets: ${actualAssets.join(', ')}`)
  }

  const sourceMaps = files.filter((file) =>
    new RegExp(`^${renderer}\\.[a-f0-9]+\\.(?:js|css)\\.map$`).test(file)
  )

  for (const sourceMap of sourceMaps) {
    if (!actualAssets.includes(sourceMap.slice(0, -4))) {
      throw new Error(`${renderer} has stale source map ${sourceMap}`)
    }
  }
}

console.log(`Verified ${renderers.length} renderer bundles with no stale assets.`)
