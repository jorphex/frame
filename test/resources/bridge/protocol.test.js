import {
  BRIDGE_SOURCE,
  LINK_SOURCE,
  MAX_MESSAGE_LENGTH,
  decodeBridgeMessage,
  encodeBridgeMessage,
  getRendererTargetOrigin,
  isTrustedBridgeEvent
} from '../../../resources/bridge/protocol'

const id = '74b6f0b5-0396-4d91-b505-0fb66f00786a'
const encode = (message) => encodeBridgeMessage(message)

describe('renderer bridge protocol', () => {
  test('accepts bounded requests for registered IPC channels and main RPC methods', () => {
    expect(
      decodeBridgeMessage(encode({ source: LINK_SOURCE, method: 'event', args: ['tray:ready'] }), LINK_SOURCE)
    ).toEqual({ source: LINK_SOURCE, method: 'event', args: ['tray:ready'] })

    expect(
      decodeBridgeMessage(
        encode({ source: LINK_SOURCE, method: 'invoke', id, args: ['tray:addChain', { chainId: '0x1' }] }),
        LINK_SOURCE
      )
    ).toEqual({ source: LINK_SOURCE, method: 'invoke', id, args: ['tray:addChain', { chainId: '0x1' }] })

    expect(
      decodeBridgeMessage(encode({ source: LINK_SOURCE, method: 'rpc', id, args: ['getState'] }), LINK_SOURCE)
    ).toEqual({ source: LINK_SOURCE, method: 'rpc', id, args: ['getState'] })
  })

  test('accepts bridge replies and only known renderer event channels', () => {
    expect(
      decodeBridgeMessage(
        encode({ source: BRIDGE_SOURCE, method: 'rpc', id, args: [null, 'ok'] }),
        BRIDGE_SOURCE
      )
    ).toEqual({ source: BRIDGE_SOURCE, method: 'rpc', id, args: [null, 'ok'] })

    expect(
      decodeBridgeMessage(
        encode({ source: BRIDGE_SOURCE, method: 'invoke', id, args: { success: true } }),
        BRIDGE_SOURCE
      )
    ).toEqual({ source: BRIDGE_SOURCE, method: 'invoke', id, args: { success: true } })

    expect(
      decodeBridgeMessage(
        encode({ source: BRIDGE_SOURCE, method: 'event', channel: 'action', args: ['stateSync'] }),
        BRIDGE_SOURCE
      )
    ).toEqual({ source: BRIDGE_SOURCE, method: 'event', channel: 'action', args: ['stateSync'] })

    expect(
      decodeBridgeMessage(
        encode({ source: BRIDGE_SOURCE, method: 'event', channel: 'unknown', args: [] }),
        BRIDGE_SOURCE
      )
    ).toBeNull()
  })

  test.each([undefined, null, {}, '', '{', JSON.stringify(null), 'x'.repeat(MAX_MESSAGE_LENGTH + 1)])(
    'rejects malformed or oversized serialized input %#',
    (value) => {
      expect(decodeBridgeMessage(value, LINK_SOURCE)).toBeNull()
    }
  )

  test('rejects forged endpoints, unknown methods, extra fields, invalid ids, and excessive arguments', () => {
    const messages = [
      { source: BRIDGE_SOURCE, method: 'rpc', id, args: ['getState'] },
      { source: LINK_SOURCE, method: 'unknown', id, args: ['getState'] },
      { source: LINK_SOURCE, method: 'rpc', id, args: ['getState'], extra: true },
      { source: LINK_SOURCE, method: 'rpc', id: 'not-a-uuid', args: ['getState'] },
      { source: LINK_SOURCE, method: 'rpc', id, args: new Array(65).fill(null) }
    ]

    messages.forEach((message) => expect(decodeBridgeMessage(encode(message), LINK_SOURCE)).toBeNull())
  })

  test('rejects unregistered one-way and invoke channels', () => {
    expect(
      decodeBridgeMessage(
        encode({ source: LINK_SOURCE, method: 'event', args: ['shell:execute'] }),
        LINK_SOURCE
      )
    ).toBeNull()
    expect(
      decodeBridgeMessage(
        encode({ source: LINK_SOURCE, method: 'invoke', id, args: ['shell:execute'] }),
        LINK_SOURCE
      )
    ).toBeNull()
  })

  test('requires the current window and an allowed origin', () => {
    const currentWindow = {}
    const origins = ['file://', 'http://localhost:1234']

    expect(isTrustedBridgeEvent({ source: currentWindow, origin: 'file://' }, currentWindow, origins)).toBe(
      true
    )
    expect(isTrustedBridgeEvent({ source: {}, origin: 'file://' }, currentWindow, origins)).toBe(false)
    expect(
      isTrustedBridgeEvent({ source: currentWindow, origin: 'https://example.com' }, currentWindow, origins)
    ).toBe(false)
  })

  test('uses exact web origins and a wildcard only for the packaged file origin', () => {
    expect(getRendererTargetOrigin({ protocol: 'http:', origin: 'http://localhost:1234' })).toBe(
      'http://localhost:1234'
    )
    expect(getRendererTargetOrigin({ protocol: 'file:', origin: 'null' })).toBe('*')
  })
})
