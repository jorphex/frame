import nock from 'nock'

import {
  parseAddChainRequest,
  parseChainId,
  parseChainRequestId,
  verifyRpcChainId
} from '../../../main/provider/chainRequests'

jest.setTimeout(2000)

const validRequest = {
  chainId: '0x89',
  chainName: 'Polygon',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: ['https://polygon.example/rpc'],
  blockExplorerUrls: ['https://explorer.example'],
  iconUrls: ['https://assets.example/polygon.svg']
}

beforeAll(() => {
  jest.useRealTimers()
  nock.disableNetConnect()
})

afterEach(() => {
  nock.cleanAll()
})

afterAll(() => {
  nock.enableNetConnect()
})

describe('chain request parsing', () => {
  it('parses canonical chain IDs within Frame safe storage range', () => {
    expect(parseChainId('0x1')).toBe(1)
    expect(parseChainId('0xAA')).toBe(170)
    expect(parseChainId(`0x${Number.MAX_SAFE_INTEGER.toString(16)}`)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each(['1', '0', '0x0', '0x01', '0X1', '0x1junk', '-0x1', '0x'])('rejects invalid chain ID %s', (id) => {
    expect(() => parseChainId(id)).toThrow()
  })

  it('rejects chain IDs that Frame cannot store safely', () => {
    expect(() => parseChainId('0x20000000000000')).toThrow(/safely supported/)
  })

  it('requires exactly one chain parameter object', () => {
    expect(parseChainRequestId([{ chainId: '0x1' }])).toBe(1)
    expect(() => parseChainRequestId([])).toThrow()
    expect(() => parseChainRequestId([{ chainId: '0x1' }, {}])).toThrow()
    expect(() => parseChainRequestId('0x1')).toThrow()
  })

  it('normalizes complete EIP-3085 metadata', () => {
    expect(parseAddChainRequest([validRequest])).toEqual({
      id: 137,
      name: 'Polygon',
      symbol: 'POL',
      nativeCurrencyName: 'POL',
      nativeCurrencyDecimals: 18,
      rpcUrls: ['https://polygon.example/rpc'],
      blockExplorerUrls: ['https://explorer.example'],
      iconUrls: ['https://assets.example/polygon.svg']
    })
  })

  it.each([
    [{ ...validRequest, rpcUrls: [] }],
    [{ ...validRequest, rpcUrls: ['http://polygon.example'] }],
    [{ ...validRequest, rpcUrls: ['file:///tmp/rpc'] }],
    [{ ...validRequest, rpcUrls: ['https://user:secret@polygon.example'] }],
    [{ ...validRequest, nativeCurrency: { name: 'POL', symbol: 'POL', decimals: -1 } }],
    [{ ...validRequest, blockExplorerUrls: ['not a URL'] }]
  ])('rejects unsafe or incomplete add-chain metadata', (params) => {
    expect(() => parseAddChainRequest(params)).toThrow()
  })
})

describe('RPC chain identity verification', () => {
  const rpcRequest = { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }

  it('accepts the first endpoint that reports the requested chain', async () => {
    nock('https://wrong.example').post('/', rpcRequest).reply(200, { jsonrpc: '2.0', id: 1, result: '0x1' })
    nock('https://right.example').post('/', rpcRequest).reply(200, { jsonrpc: '2.0', id: 1, result: '0x89' })

    await expect(verifyRpcChainId(['https://wrong.example', 'https://right.example'], 137)).resolves.toBe(
      'https://right.example'
    )
  })

  it('rejects when an endpoint reports a different chain', async () => {
    nock('https://wrong.example').post('/', rpcRequest).reply(200, { jsonrpc: '2.0', id: 1, result: '0x1' })

    await expect(verifyRpcChainId(['https://wrong.example'], 137)).rejects.toThrow(/different chain ID/)
  })

  it('rejects unavailable and malformed endpoints', async () => {
    nock('https://broken.example').post('/', rpcRequest).reply(200, { jsonrpc: '2.0', id: 1, result: '137' })

    await expect(verifyRpcChainId(['https://broken.example'], 137)).rejects.toThrow(/Could not verify/)
  })

  it('does not follow RPC redirects', async () => {
    nock('https://redirect.example').post('/', rpcRequest).reply(302, undefined, {
      location: 'http://127.0.0.1:8545'
    })

    await expect(verifyRpcChainId(['https://redirect.example'], 137)).rejects.toThrow(/Could not verify/)
  })

  it('rejects endpoints that are not HTTPS before making a request', async () => {
    await expect(verifyRpcChainId(['http://localhost:8545'], 1)).rejects.toMatchObject({ code: -32602 })
  })
})
