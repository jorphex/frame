import createIpfs, { getKuboOptions } from '../../../main/nebula/ipfs'

const mockParseCid = jest.fn()

jest.mock('../../../main/nebula/modules', () => ({
  loadCidModule: jest.fn(async () => ({ CID: { parse: mockParseCid } })),
  loadKuboModule: jest.fn()
}))

async function* chunks(...values) {
  for (const value of values) yield Buffer.from(value)
}

test('streams archived content from one lazily created Kubo client', async () => {
  const get = jest.fn(() => chunks('first', 'second'))
  const factory = jest.fn(async () => ({ get, cat: jest.fn() }))
  const ipfs = createIpfs(factory)

  const received = []
  for await (const chunk of ipfs.get('bafy-content', { archive: true })) received.push(chunk.toString())

  expect(received).toEqual(['first', 'second'])
  expect(get).toHaveBeenCalledWith('bafy-content', { archive: true })
  expect(factory).toHaveBeenCalledTimes(1)
})

test('parses bounded JSON assembled from streamed chunks', async () => {
  const client = { get: jest.fn(), cat: jest.fn(() => chunks('{"tokens":', '[1,2]}')) }
  const ipfs = createIpfs(async () => client, 32)

  await expect(ipfs.getJson('bafy-manifest')).resolves.toEqual({ tokens: [1, 2] })
  expect(client.cat).toHaveBeenCalledWith('bafy-manifest')
})

test('canonicalizes legacy CIDv0 paths before requesting content', async () => {
  const legacyCid = 'QmeAp9nr7rTEjExtAJJhWmCSxYQncwX1DQ2s6paJa8dBzT'
  const canonicalCid = 'bafybeihlgxobvnlhgthbxoxbzxlymwsrf7h2oeoj7bd6be6wnxpbodhy3q'
  mockParseCid.mockReturnValueOnce({ toV1: () => ({ toString: () => canonicalCid }) })
  mockParseCid.mockReturnValueOnce({ toV1: () => ({ toString: () => canonicalCid }) })
  const client = {
    get: jest.fn(() => chunks('archive')),
    cat: jest.fn(() => chunks('{}'))
  }
  const ipfs = createIpfs(async () => client)

  await ipfs.getJson(`/ipfs/${legacyCid}/metadata.json`)
  const archive = ipfs.get(legacyCid, { archive: true })
  await archive.next()

  expect(mockParseCid).toHaveBeenNthCalledWith(1, legacyCid)
  expect(mockParseCid).toHaveBeenNthCalledWith(2, legacyCid)
  expect(client.cat).toHaveBeenCalledWith(`/ipfs/${canonicalCid}/metadata.json`)
  expect(client.get).toHaveBeenCalledWith(canonicalCid, { archive: true })
})

test('preserves the empty JSON response fallback', async () => {
  const client = { get: jest.fn(), cat: jest.fn(() => chunks()) }
  const ipfs = createIpfs(async () => client)

  await expect(ipfs.getJson('bafy-empty')).resolves.toEqual({})
})

test('rejects an oversized JSON response before parsing it', async () => {
  const client = { get: jest.fn(), cat: jest.fn(() => chunks('12345', '67890')) }
  const ipfs = createIpfs(async () => client, 8)

  await expect(ipfs.getJson('bafy-large')).rejects.toThrow('exceeds 8 bytes')
})

test('rejects an oversized archive while streaming it', async () => {
  const client = { get: jest.fn(() => chunks('12345', '67890')), cat: jest.fn() }
  const ipfs = createIpfs(async () => client, 32, 8)

  const consume = async () => {
    const archive = ipfs.get('bafy-large', { archive: true })
    await archive.next()
    await archive.next()
  }

  await expect(consume()).rejects.toThrow('archive exceeds 8 bytes')
})

test('builds an authenticated, configurable Kubo endpoint without URL credentials', () => {
  expect(
    getKuboOptions({
      FRAME_IPFS_API_URL: 'http://127.0.0.1:5001',
      NEBULA_AUTH_TOKEN: 'test-token'
    })
  ).toEqual({
    url: 'http://127.0.0.1:5001/',
    headers: { authorization: `Basic ${Buffer.from('test-token:').toString('base64')}` }
  })

  expect(() => getKuboOptions({ FRAME_IPFS_API_URL: 'https://user:pass@example.test' })).toThrow(
    'credentials must be provided through NEBULA_AUTH_TOKEN'
  )
  expect(() => getKuboOptions({ FRAME_IPFS_API_URL: 'file:///tmp/ipfs' })).toThrow(
    'Unsupported IPFS API protocol'
  )
})
