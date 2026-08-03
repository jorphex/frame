import {
  assertRendererInvokeResultSchema,
  assertRendererIpcSchema,
  parseRendererIpcArgs,
  parseRendererInvokeResult
} from '../../../main/ipc/schemas'

const address = '0x0000000000000000000000000000000000000001'
const handlerId = '8073729a-5e59-53b7-9e69-5d9bcff94087'

const parse = (method: 'event' | 'invoke', channel: string, args: unknown[]) => {
  const result = parseRendererIpcArgs(method, channel, args)
  if (!result.success) throw result.error
  return result.data
}

test('requires an explicit schema for every registered channel', () => {
  expect(() => assertRendererIpcSchema('event', 'missing')).toThrow(
    'Renderer IPC channel has no event schema: missing'
  )
  expect(() => assertRendererIpcSchema('invoke', 'missing')).toThrow(
    'Renderer IPC channel has no invoke schema: missing'
  )
})

test('enforces exact event tuple arity and Ethereum values', () => {
  expect(parseRendererIpcArgs('event', 'tray:copyTxHash', [`0x${'a'.repeat(64)}`]).success).toBe(true)
  expect(parseRendererIpcArgs('event', 'tray:copyTxHash', ['0x1']).success).toBe(false)
  expect(parseRendererIpcArgs('event', 'tray:copyTxHash', [`0x${'a'.repeat(64)}`, 'extra']).success).toBe(
    false
  )
  expect(parseRendererIpcArgs('event', 'tray:renameAccount', [address, 'Account']).success).toBe(true)
  expect(parseRendererIpcArgs('event', 'tray:renameAccount', ['0x1', 'Account']).success).toBe(false)
})

test('does not coerce chain or token identifiers', () => {
  expect(parseRendererIpcArgs('invoke', 'tray:getTokenDetails', [address, 1]).success).toBe(true)
  expect(parseRendererIpcArgs('invoke', 'tray:getTokenDetails', [address, '1']).success).toBe(false)
  expect(parseRendererIpcArgs('event', 'tray:removeToken', [{ address, chainId: '1' }]).success).toBe(false)
})

test('keeps only trusted request reference fields', () => {
  expect(
    parse('event', 'tray:rejectRequest', [
      { handlerId, account: address, data: { value: 'renderer snapshot' }, locked: true }
    ])
  ).toEqual([{ handlerId }])

  expect(
    parse('event', 'tray:giveAccess', [
      { type: 'access', handlerId, origin: 'example.test', account: address, provider: true },
      true
    ])
  ).toEqual([{ type: 'access', handlerId, origin: 'example.test', account: address }, true])
})

test('allows partial navigation updates but bounds their data', () => {
  const requestCrumb = {
    view: 'requestView',
    data: { step: 'confirm', accountId: address, requestId: handlerId }
  }

  expect(parse('event', 'nav:forward', ['panel', requestCrumb])).toEqual(['panel', requestCrumb])
  expect(parse('event', 'nav:update', ['panel', { data: { step: 'viewData' } }])).toEqual([
    'panel',
    { data: { step: 'viewData' } }
  ])
  expect(parseRendererIpcArgs('event', 'nav:forward', ['panel', { data: {} }]).success).toBe(false)
  expect(
    parseRendererIpcArgs('event', 'nav:update', ['panel', { data: { value: 'x'.repeat(256 * 1024) } }])
      .success
  ).toBe(false)
})

test('dispatches only recognized store actions with validated arguments', () => {
  expect(
    parse('event', 'tray:action', ['removeNetwork', { type: 'ethereum', id: 10, name: 'ignored' }])
  ).toEqual(['removeNetwork', { type: 'ethereum', id: 10 }])
  expect(parseRendererIpcArgs('event', 'tray:action', ['unknownAction']).success).toBe(false)
  expect(parseRendererIpcArgs('event', 'tray:action', ['setColorway', 'purple']).success).toBe(false)
})

test('validates complete add-chain invokes and strips their request reference', () => {
  const chain = {
    type: 'ethereum',
    id: 10,
    name: 'Optimism',
    explorer: 'https://optimistic.etherscan.io',
    symbol: 'ETH',
    isTestnet: false,
    primaryColor: 'accent2',
    icon: '',
    nativeCurrencyIcon: '',
    nativeCurrencyName: 'Ether',
    primaryRpc: 'https://mainnet.optimism.io',
    secondaryRpc: '',
    nativeCurrencyDecimals: 18
  }

  expect(parse('invoke', 'tray:addChain', [chain, { handlerId, account: address, ignored: true }])).toEqual([
    chain,
    { handlerId, account: address }
  ])
  expect(parseRendererIpcArgs('invoke', 'tray:addChain', [{ ...chain, id: '10' }]).success).toBe(false)
  expect(parseRendererIpcArgs('invoke', 'tray:addChain', [{ ...chain, unexpected: true }]).success).toBe(
    false
  )
})

test('validates exact invoke result shapes', () => {
  expect(parseRendererInvokeResult('tray:addChain', { success: true }).success).toBe(true)
  expect(
    parseRendererInvokeResult('tray:addChain', { success: false, error: 'Could not add chain' }).success
  ).toBe(true)
  expect(parseRendererInvokeResult('tray:addChain', { success: true, error: 'ignored' }).success).toBe(false)

  expect(
    parseRendererInvokeResult('tray:getTokenDetails', {
      decimals: 18,
      name: 'Token',
      symbol: 'TKN',
      totalSupply: '1000000'
    }).success
  ).toBe(true)
  expect(parseRendererInvokeResult('tray:getTokenDetails', {}).success).toBe(true)
  expect(parseRendererInvokeResult('tray:getTokenDetails', { totalSupply: '-1' }).success).toBe(false)
  expect(() => parseRendererInvokeResult('missing', {})).toThrow(
    'Renderer IPC channel has no invoke result schema: missing'
  )
  expect(() => assertRendererInvokeResultSchema('missing')).toThrow(
    'Renderer IPC channel has no invoke result schema: missing'
  )
})

test('reduces explorer snapshots to the selected chain identity', () => {
  expect(
    parse('event', 'tray:openExplorer', [
      { id: 1, type: 'ethereum', name: 'Mainnet', connection: { primary: {} } },
      null,
      address
    ])
  ).toEqual([{ id: 1, type: 'ethereum' }, null, address])
})

test('rejects unsafe and oversized nested navigation collections', () => {
  const unsafe = JSON.parse('{"constructor":{"polluted":true}}')
  expect(parseRendererIpcArgs('event', 'nav:update', ['panel', { data: unsafe }]).success).toBe(false)
  expect(
    parseRendererIpcArgs('event', 'nav:update', ['panel', { data: { values: Array(1025).fill(1) } }]).success
  ).toBe(false)
})
