import { loadKuboModule } from './modules'

import type { KuboClient } from './modules'

const DEFAULT_IPFS_API_URL = 'https://ipfs.nebula.land'
const DEFAULT_MAX_JSON_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_ARCHIVE_BYTES = 256 * 1024 * 1024

type ClientFactory = () => Promise<KuboClient>

export function getKuboOptions(env: NodeJS.ProcessEnv = process.env) {
  const url = new URL(env['FRAME_IPFS_API_URL'] || DEFAULT_IPFS_API_URL)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported IPFS API protocol: ${url.protocol}`)
  }

  if (url.username || url.password) {
    throw new Error('IPFS API credentials must be provided through NEBULA_AUTH_TOKEN')
  }

  const headers: Record<string, string> = {}
  const authToken = env['NEBULA_AUTH_TOKEN']
  if (authToken) {
    headers['authorization'] = `Basic ${Buffer.from(`${authToken}:`).toString('base64')}`
  }

  return { url: url.toString(), headers }
}

async function defaultClientFactory() {
  const { create } = await loadKuboModule()
  return create(getKuboOptions())
}

export default function createIpfs(
  clientFactory: ClientFactory = defaultClientFactory,
  maxJsonBytes = DEFAULT_MAX_JSON_BYTES,
  maxArchiveBytes = DEFAULT_MAX_ARCHIVE_BYTES
) {
  let client: Promise<KuboClient> | undefined
  const getClient = () => (client ||= clientFactory())

  const getFile = async (path: string) => {
    const chunks: Buffer[] = []
    let size = 0

    for await (const chunk of (await getClient()).cat(path)) {
      size += chunk.byteLength
      if (size > maxJsonBytes) {
        throw new Error(`IPFS JSON response exceeds ${maxJsonBytes} bytes`)
      }
      chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
  }

  return {
    async *get(path: string, options?: { archive?: boolean }) {
      let size = 0
      for await (const chunk of (await getClient()).get(path, options)) {
        size += chunk.byteLength
        if (options?.archive && size > maxArchiveBytes) {
          throw new Error(`IPFS archive exceeds ${maxArchiveBytes} bytes`)
        }
        yield chunk
      }
    },
    async getJson<T = unknown>(path: string): Promise<T> {
      const file = await getFile(path)
      return (file.length ? JSON.parse(file.toString()) : {}) as T
    }
  }
}
