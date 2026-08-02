import { z } from 'zod'

import createIpfs from '../nebula/ipfs'

import type { TokenData } from '../contracts/erc20'

export const MAX_ERC1046_METADATA_BYTES = 64 * 1024
const MAX_IPFS_URI_LENGTH = 2048
const MAX_DATA_URI_LENGTH = MAX_ERC1046_METADATA_BYTES * 4 + 128

const uriSchema = z.string().max(2048)
const metadataSchema = z
  .object({
    interop: z.object({ erc1046: z.literal(true) }).passthrough(),
    name: z.string().max(128).optional(),
    symbol: z.string().max(32).optional(),
    decimals: z.number().int().min(0).max(255).optional(),
    description: z
      .string()
      .max(1024)
      .refine((description) => !/[\r\n]/.test(description), 'description must be one paragraph')
      .optional(),
    image: uriSchema.optional(),
    images: z.array(uriSchema).max(32).optional(),
    icons: z.array(uriSchema).max(32).optional()
  })
  .passthrough()

export type Erc1046Metadata = z.infer<typeof metadataSchema>

interface JsonContentReader {
  getJson<T = unknown>(path: string): Promise<T>
}

const defaultIpfs = createIpfs(undefined, MAX_ERC1046_METADATA_BYTES)
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

function parseJson(bytes: Buffer) {
  if (bytes.byteLength > MAX_ERC1046_METADATA_BYTES) {
    throw new RangeError(`ERC-1046 metadata exceeds ${MAX_ERC1046_METADATA_BYTES} bytes`)
  }
  return JSON.parse(utf8Decoder.decode(bytes)) as unknown
}

function dataUriJson(uri: string) {
  if (uri.length > MAX_DATA_URI_LENGTH) {
    throw new RangeError(`ERC-1046 data URI exceeds ${MAX_DATA_URI_LENGTH} characters`)
  }

  const match = uri.match(/^data:application\/json(?:;charset=utf-8)?(;base64)?,([\s\S]*)$/i)
  if (!match) throw new Error('Unsupported ERC-1046 data URI')

  const encoded = match[2] || ''
  if (match[1]) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new Error('Malformed ERC-1046 base64 data URI')
    }
    return parseJson(Buffer.from(encoded, 'base64'))
  }

  try {
    return parseJson(Buffer.from(decodeURIComponent(encoded), 'utf8'))
  } catch (error) {
    if (error instanceof URIError) throw new Error('Malformed ERC-1046 percent-encoded data URI')
    throw error
  }
}

function isCid(value: string) {
  return (
    /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(value) ||
    /^b[a-z2-7]{20,120}$/.test(value) ||
    /^k[0-9a-z]{20,120}$/.test(value) ||
    /^z[1-9A-HJ-NP-Za-km-z]{20,120}$/.test(value)
  )
}

function ipfsPath(uri: string) {
  if (uri.length > MAX_IPFS_URI_LENGTH) throw new Error('ERC-1046 IPFS URI is too long')

  const value = uri.slice('ipfs://'.length)
  if (!value || /[?#%@\\]/.test(value)) throw new Error('Malformed ERC-1046 IPFS URI')

  const [cid, ...segments] = value.split('/')
  if (!cid || !isCid(cid)) throw new Error('ERC-1046 IPFS URI must contain a canonical CID')
  if (
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._~-]{1,128}$/.test(segment)
    )
  ) {
    throw new Error('ERC-1046 IPFS URI contains an unsafe path')
  }

  return [cid, ...segments].join('/')
}

export async function resolveErc1046Metadata(
  tokenUri: string,
  ipfs: JsonContentReader = defaultIpfs
): Promise<Erc1046Metadata> {
  let value: unknown
  if (/^data:/i.test(tokenUri)) {
    value = dataUriJson(tokenUri)
  } else if (/^ipfs:\/\//i.test(tokenUri)) {
    value = await ipfs.getJson(ipfsPath(tokenUri))
  } else {
    throw new Error('Unsupported ERC-1046 metadata URI scheme')
  }

  const result = metadataSchema.safeParse(value)
  if (!result.success) throw new Error(`Invalid ERC-1046 metadata: ${result.error.issues[0]?.message}`)
  return result.data
}

function reconcileText(field: 'name' | 'symbol', metadata: Erc1046Metadata, contract: TokenData) {
  const fromMetadata = metadata[field]
  const fromContract = contract[field]
  if (fromMetadata !== undefined && fromContract && fromMetadata !== fromContract) {
    throw new Error(`ERC-1046 ${field} does not match the token contract`)
  }

  const value = (fromContract || fromMetadata || '').trim()
  if (!value) throw new Error(`ERC-1046 ${field} is unavailable`)
  return value
}

export function reconcileErc1046TokenData(
  metadata: Erc1046Metadata,
  contract: TokenData
): Required<TokenData> {
  if (!contract.totalSupply) throw new Error('ERC-1046 token does not expose totalSupply')
  if (
    metadata.decimals !== undefined &&
    contract.decimals !== undefined &&
    metadata.decimals !== contract.decimals
  ) {
    throw new Error('ERC-1046 decimals do not match the token contract')
  }

  return {
    name: reconcileText('name', metadata, contract),
    symbol: reconcileText('symbol', metadata, contract),
    decimals: contract.decimals ?? metadata.decimals ?? 18,
    totalSupply: contract.totalSupply
  }
}
