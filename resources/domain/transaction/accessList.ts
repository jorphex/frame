const ADDRESS = /^0x[0-9a-f]{40}$/i
const STORAGE_KEY = /^0x[0-9a-f]{64}$/i
const MAX_ACCESS_LIST_ENTRIES = 256
const MAX_ACCESS_LIST_STORAGE_KEYS = 2048

export interface RpcAccessListEntry {
  address: string
  storageKeys: string[]
}

export type RpcAccessList = RpcAccessListEntry[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeAccessList(value: unknown): RpcAccessList | undefined {
  if (value === undefined) return
  if (!Array.isArray(value)) throw new Error('Transaction access list must be an array')
  if (value.length > MAX_ACCESS_LIST_ENTRIES) {
    throw new Error(`Transaction access list exceeds ${MAX_ACCESS_LIST_ENTRIES} entries`)
  }

  let totalStorageKeys = 0
  return value.map((entry, entryIndex) => {
    if (!isRecord(entry)) throw new Error(`Transaction access list entry ${entryIndex} is invalid`)

    const keys = Object.keys(entry)
    if (keys.length !== 2 || !keys.includes('address') || !keys.includes('storageKeys')) {
      throw new Error(`Transaction access list entry ${entryIndex} has invalid fields`)
    }
    if (typeof entry.address !== 'string' || !ADDRESS.test(entry.address)) {
      throw new Error(`Transaction access list entry ${entryIndex} has an invalid address`)
    }
    if (!Array.isArray(entry.storageKeys)) {
      throw new Error(`Transaction access list entry ${entryIndex} storage keys must be an array`)
    }

    totalStorageKeys += entry.storageKeys.length
    if (totalStorageKeys > MAX_ACCESS_LIST_STORAGE_KEYS) {
      throw new Error(`Transaction access list exceeds ${MAX_ACCESS_LIST_STORAGE_KEYS} storage keys`)
    }

    const storageKeys = entry.storageKeys.map((storageKey, keyIndex) => {
      if (typeof storageKey !== 'string' || !STORAGE_KEY.test(storageKey)) {
        throw new Error(`Transaction access list entry ${entryIndex} storage key ${keyIndex} is invalid`)
      }

      return storageKey.toLowerCase()
    })

    return { address: entry.address.toLowerCase(), storageKeys }
  })
}

export function summarizeAccessList(value: unknown) {
  if (!Array.isArray(value)) return

  let storageKeys = 0
  for (const entry of value) {
    if (!isRecord(entry) || !Array.isArray(entry.storageKeys)) return
    storageKeys += entry.storageKeys.length
  }

  return {
    entries: value.length,
    storageKeys
  }
}
