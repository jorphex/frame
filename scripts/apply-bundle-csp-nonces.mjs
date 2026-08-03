import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../bundle', import.meta.url))
const scriptTagPattern = /<script\b[^>]*>/gi

export function applyScriptNonce(html, fileName) {
  const nonceMatches = [...html.matchAll(/'nonce-([^']+)'/g)]
  const nonces = new Set(nonceMatches.map((match) => match[1]))

  if (nonces.size !== 1) {
    throw new Error(`${fileName} must declare exactly one CSP script nonce`)
  }

  const [nonce] = nonces
  let scriptCount = 0
  const output = html.replace(scriptTagPattern, (tag) => {
    scriptCount += 1
    const existingNonce = tag.match(/\bnonce\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
    if (existingNonce) {
      const value = existingNonce[1] || existingNonce[2] || existingNonce[3]
      if (value !== nonce) throw new Error(`${fileName} contains a script with the wrong CSP nonce`)
      return tag
    }

    return tag.replace(/^<script\b/i, `<script nonce="${nonce}"`)
  })

  if (scriptCount === 0) throw new Error(`${fileName} contains no scripts`)
  return output
}

if (!existsSync(root)) throw new Error('bundle directory does not exist')

for (const file of readdirSync(root).filter((entry) => entry.endsWith('.html'))) {
  const filePath = join(root, file)
  const html = readFileSync(filePath, 'utf8')
  const output = applyScriptNonce(html, basename(filePath))
  if (output !== html) writeFileSync(filePath, output)
}

console.log('Applied CSP nonces to generated renderer scripts.')
