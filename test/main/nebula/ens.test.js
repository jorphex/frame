import createEns from '../../../main/nebula/ens'

function createProvider() {
  return {
    connected: true,
    request: jest.fn().mockResolvedValue('0x1'),
    once: jest.fn()
  }
}

test('resolves the ENS fields used by Frame and normalizes IPFS content', async () => {
  const resolver = {
    getContentHash: jest.fn().mockResolvedValue('ipfs://bafy-content'),
    getAddress: jest.fn((coinType) => Promise.resolve(coinType === 0 ? 'bc1-frame' : '0xABCDEF')),
    getText: jest.fn((key) => Promise.resolve(key === 'manifest' ? 'bafy-manifest' : null))
  }
  const web3 = { getResolver: jest.fn().mockResolvedValue(resolver), lookupAddress: jest.fn() }
  const ens = createEns(createProvider(), web3)

  await expect(ens.resolve('frame.eth')).resolves.toEqual({
    name: 'frame.eth',
    chain: '0x1',
    content: '/ipfs/bafy-content',
    addresses: { eth: '0xabcdef', btc: 'bc1-frame' },
    text: {
      manifest: 'bafy-manifest',
      avatar: '',
      'com.twitter': '',
      'com.github': ''
    }
  })
  expect(resolver.getAddress).toHaveBeenCalledWith(0)
  expect(jest.getTimerCount()).toBe(0)
})

test('does not fail ENS resolution when the optional BTC record is unsupported', async () => {
  const resolver = {
    getContentHash: jest.fn().mockResolvedValue(null),
    getAddress: jest.fn((coinType) =>
      coinType === 0 ? Promise.reject(new Error('unsupported coin type')) : Promise.resolve('0xABCDEF')
    ),
    getText: jest.fn().mockResolvedValue(null)
  }
  const web3 = { getResolver: jest.fn().mockResolvedValue(resolver), lookupAddress: jest.fn() }
  const ens = createEns(createProvider(), web3)

  await expect(ens.resolve('frame.eth')).resolves.toMatchObject({
    addresses: { eth: '0xabcdef', btc: '' }
  })
})

test('performs resilient single and batch reverse lookups', async () => {
  const web3 = {
    getResolver: jest.fn(),
    lookupAddress: jest.fn((address) =>
      address === '0x1' ? Promise.resolve('frame.eth') : Promise.reject(new Error('not configured'))
    )
  }
  const ens = createEns(createProvider(), web3)

  await expect(ens.reverseLookup(['0x1', '0x2'])).resolves.toEqual(['frame.eth', ''])
  await expect(ens.verifyAddress('FRAME.ETH', '0x1')).resolves.toBe(true)
  await expect(ens.verifyAddress('missing.eth', '0x2')).resolves.toBe(false)
})

test('rejects names without a configured resolver', async () => {
  const web3 = { getResolver: jest.fn().mockResolvedValue(null), lookupAddress: jest.fn() }
  const ens = createEns(createProvider(), web3)

  await expect(ens.resolve('missing.eth')).rejects.toThrow('No ENS resolver configured')
})
