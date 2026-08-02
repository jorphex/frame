type JsonReader = {
  getJson: <T = unknown>(path: string) => Promise<T>
}

interface ManifestReferences extends Record<string, unknown> {
  name?: unknown
  updated?: unknown
  version?: unknown
  content?: unknown
  icon?: unknown
  contracts?: unknown
  tokens?: unknown
}

interface ManifestContract extends Record<string, unknown> {
  metadata?: unknown
}

export type Manifest = {
  name?: string
  updated?: string
  version?: string
  content?: string
  icon?: unknown
  contracts?: ManifestContract[]
  tokens?: unknown
}

export async function resolveManifest(ipfs: JsonReader, cid: string) {
  const metadata = await ipfs.getJson<ManifestReferences>(cid)
  const manifest: Manifest = {}

  if (typeof metadata.name === 'string') manifest.name = metadata.name
  if (typeof metadata.updated === 'string') manifest.updated = metadata.updated
  if (typeof metadata.version === 'string') manifest.version = metadata.version
  if (typeof metadata.content === 'string') manifest.content = metadata.content
  if (typeof metadata.icon === 'string') {
    const icon = await ipfs.getJson<{ icon?: unknown }>(metadata.icon)
    manifest.icon = icon.icon
  }
  if (typeof metadata.contracts === 'string') {
    const contractManifest = await ipfs.getJson<{ contracts?: ManifestContract[] }>(metadata.contracts)
    manifest.contracts = (contractManifest.contracts || []).map((contract) => ({
      ...contract,
      metadata: Buffer.from(typeof contract.metadata === 'string' ? contract.metadata : '{}')
    }))
  }
  if (typeof metadata.tokens === 'string') {
    const tokenManifest = await ipfs.getJson<{ tokens?: unknown }>(metadata.tokens)
    manifest.tokens = tokenManifest.tokens
  }

  return manifest
}
