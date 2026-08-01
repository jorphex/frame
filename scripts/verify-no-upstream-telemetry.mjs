import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const roots = ['app', 'main', 'resources']
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx'])
const forbidden = [/@sentry\//i, /ingest\.sentry\.io/i]

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(entryPath)
      return extensions.has(path.extname(entry.name)) ? [entryPath] : []
    })
  )
  return files.flat()
}

const files = ['package.json', ...(await Promise.all(roots.map(sourceFiles))).flat()]
const violations = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  if (forbidden.some((pattern) => pattern.test(source))) violations.push(file)
}

if (violations.length) {
  throw new Error(`Upstream telemetry reference found in: ${violations.join(', ')}`)
}

console.log(`Verified ${files.length} application files contain no upstream telemetry client or endpoint.`)
