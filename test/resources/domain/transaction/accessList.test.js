import { normalizeAccessList, summarizeAccessList } from '../../../../resources/domain/transaction/accessList'

const address = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const storageKey = `0x${'BB'.repeat(32)}`

it('normalizes an ordered access list without deduplicating entries or keys', () => {
  const value = [
    { address, storageKeys: [storageKey, storageKey] },
    { address, storageKeys: [] }
  ]

  expect(normalizeAccessList(value)).toEqual([
    { address: address.toLowerCase(), storageKeys: [storageKey.toLowerCase(), storageKey.toLowerCase()] },
    { address: address.toLowerCase(), storageKeys: [] }
  ])
  expect(summarizeAccessList(value)).toEqual({ entries: 2, storageKeys: 2 })
  expect(normalizeAccessList([])).toEqual([])
  expect(normalizeAccessList(undefined)).toBeUndefined()
})

it.each([
  ['non-array list', {}],
  ['non-object entry', ['invalid']],
  ['missing fields', [{ address }]],
  ['extra fields', [{ address, storageKeys: [], extra: true }]],
  ['short address', [{ address: '0x1234', storageKeys: [] }]],
  ['non-array storage keys', [{ address, storageKeys: storageKey }]],
  ['short storage key', [{ address, storageKeys: ['0x1234'] }]],
  ['non-string storage key', [{ address, storageKeys: [1] }]]
])('rejects a %s', (_label, value) => {
  expect(() => normalizeAccessList(value)).toThrow(/transaction access list/i)
})

it('bounds access-list entries and total storage keys', () => {
  const entry = { address, storageKeys: [] }
  const tooManyKeys = Array.from({ length: 2049 }, () => storageKey)

  expect(() => normalizeAccessList(Array.from({ length: 257 }, () => entry))).toThrow(/256 entries/)
  expect(() => normalizeAccessList([{ address, storageKeys: tooManyKeys }])).toThrow(/2048 storage keys/)
})

it('does not summarize malformed untrusted input', () => {
  expect(summarizeAccessList([{ address }])).toBeUndefined()
  expect(summarizeAccessList('invalid')).toBeUndefined()
})
