import EventEmitter from 'events'
import { createEip1193Provider, ProviderRpcError } from '../../../resources/provider/eip1193'

class RawProvider extends EventEmitter {
  constructor() {
    super()
    this.accounts = []
    this.chainId = '0x1'
    this.status = 'connected'
    this.connected = true
    this.request = jest.fn().mockResolvedValue('result')
    this.send = jest.fn()
    this.sendAsync = jest.fn()
    this.subscribe = jest.fn()
    this.unsubscribe = jest.fn()
    this.setChain = jest.fn()
    this.close = jest.fn()
  }

  isConnected() {
    return this.connected
  }
}

const setup = () => {
  const raw = new RawProvider()
  return { raw, provider: createEip1193Provider(raw) }
}

it('preserves lazy subscription event attachment', () => {
  const { raw, provider } = setup()

  expect(raw.listenerCount('chainChanged')).toBe(0)
  expect(raw.listenerCount('accountsChanged')).toBe(0)

  provider.on('chainChanged', () => {})
  provider.on('chainChanged', () => {})
  provider.on('accountsChanged', () => {})

  expect(raw.listenerCount('chainChanged')).toBe(1)
  expect(raw.listenerCount('accountsChanged')).toBe(1)
})

it.each([null, [], {}, { method: '' }, { method: 1 }, { method: 'test', params: null }])(
  'rejects malformed request arguments %# with ProviderRpcError',
  async (request) => {
    const { raw, provider } = setup()

    await expect(provider.request(request)).rejects.toMatchObject({
      name: 'ProviderRpcError',
      code: -32602,
      message: expect.any(String)
    })
    expect(raw.request).not.toHaveBeenCalled()
  }
)

it('resolves valid requests and removes their pending entries', async () => {
  const { raw, provider } = setup()
  raw.request.mockResolvedValueOnce({ ok: true })

  await expect(provider.request({ method: 'test_method', params: { value: 1 } })).resolves.toEqual({
    ok: true
  })

  expect(raw.request).toHaveBeenCalledWith({ method: 'test_method', params: { value: 1 } })
  expect(provider.pending.size).toBe(0)
})

it.each(['eth_accounts', 'eth_requestAccounts'])(
  'synchronizes and emits a detached account change from %s results',
  async (method) => {
    const { raw, provider } = setup()
    const accountsChanged = jest.fn()
    provider.on('accountsChanged', accountsChanged)
    const accounts = ['0x1111111111111111111111111111111111111111']
    raw.request.mockResolvedValueOnce(accounts).mockResolvedValueOnce([...accounts])

    await expect(provider.request({ method })).resolves.toBe(accounts)
    await expect(provider.request({ method })).resolves.toEqual(accounts)

    expect(accountsChanged).toHaveBeenCalledTimes(1)
    expect(accountsChanged).toHaveBeenCalledWith(accounts)
    expect(accountsChanged.mock.calls[0][0]).not.toBe(accounts)
    expect(provider.accounts).toEqual(accounts)
    expect(provider.accounts).not.toBe(accounts)
    expect(provider.selectedAddress).toBe(accounts[0])
    expect(provider.coinbase).toBe(accounts[0])
  }
)

it.each(['eth_accounts', 'eth_requestAccounts'])(
  'rejects malformed %s results without publishing account state',
  async (method) => {
    const { raw, provider } = setup()
    const accountsChanged = jest.fn()
    provider.on('accountsChanged', accountsChanged)
    raw.request.mockResolvedValueOnce(['not-an-address'])

    await expect(provider.request({ method })).rejects.toMatchObject({
      name: 'ProviderRpcError',
      code: -32603,
      message: 'Provider returned an invalid account list'
    })

    expect(accountsChanged).not.toHaveBeenCalled()
    expect(provider.accounts).toEqual([])
    expect(provider.selectedAddress).toBeUndefined()
    expect(provider.coinbase).toBeUndefined()
  }
)

it('normalizes RPC and non-error rejections', async () => {
  const { raw, provider } = setup()
  raw.request.mockRejectedValueOnce({ code: 4001, message: 'User rejected', data: { reason: 'declined' } })

  const rpcError = await provider.request({ method: 'first' }).catch((error) => error)
  expect(rpcError).toBeInstanceOf(Error)
  expect(rpcError).toMatchObject({ code: 4001, message: 'User rejected', data: { reason: 'declined' } })

  raw.request.mockRejectedValueOnce('failed')
  const internalError = await provider.request({ method: 'second' }).catch((error) => error)
  expect(internalError).toBeInstanceOf(ProviderRpcError)
  expect(internalError).toMatchObject({ code: -32603, message: 'Internal error' })
})

it('rejects all pending requests once and emits a close-code disconnect error', async () => {
  const { raw, provider } = setup()
  const unresolved = new Promise(() => {})
  raw.request.mockReturnValue(unresolved)
  const first = provider.request({ method: 'first' }).catch((error) => error)
  const second = provider.request({ method: 'second' }).catch((error) => error)
  const disconnect = jest.fn()
  provider.on('disconnect', disconnect)

  await Promise.resolve()
  raw.emit('disconnect')
  raw.emit('disconnect')

  await expect(first).resolves.toMatchObject({ code: 4900 })
  await expect(second).resolves.toMatchObject({ code: 4900 })
  expect(provider.pending.size).toBe(0)
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(disconnect.mock.calls[0][0]).toBeInstanceOf(Error)
  expect(disconnect.mock.calls[0][0]).toMatchObject({ code: 1013 })
  await expect(provider.request({ method: 'after_disconnect' })).rejects.toMatchObject({ code: 4900 })
})

it('does not dispatch a request after a same-turn disconnect', async () => {
  const { raw, provider } = setup()
  const request = provider.request({ method: 'not_dispatched' })

  raw.emit('disconnect')

  await expect(request).rejects.toMatchObject({ code: 4900 })
  await Promise.resolve()
  expect(raw.request).not.toHaveBeenCalled()
})

it('accepts new requests after a valid reconnect without reviving settled work', async () => {
  const { raw, provider } = setup()
  raw.request.mockReturnValueOnce(new Promise(() => {}))
  const abandoned = provider.request({ method: 'abandoned' }).catch((error) => error)
  await Promise.resolve()
  raw.emit('disconnect')
  await expect(abandoned).resolves.toMatchObject({ code: 4900 })

  raw.request.mockResolvedValueOnce('fresh')
  raw.emit('connect', { chainId: '0x1' })

  await expect(provider.request({ method: 'fresh' })).resolves.toBe('fresh')
})

it('forwards canonical events and keeps compatibility account state synchronized', () => {
  const { raw, provider } = setup()
  const connect = jest.fn()
  const chainChanged = jest.fn()
  const accountsChanged = jest.fn()
  const message = jest.fn()
  provider.on('connect', connect)
  provider.on('chainChanged', chainChanged)
  provider.on('accountsChanged', accountsChanged)
  provider.on('message', message)
  const accounts = ['0x1111111111111111111111111111111111111111']
  const notification = { type: 'eth_subscription', data: { subscription: '0x1', result: {} } }

  raw.emit('connect', { chainId: '0x1' })
  raw.emit('chainChanged', '0xA')
  raw.emit('accountsChanged', accounts)
  raw.emit('message', notification)

  expect(connect).toHaveBeenCalledWith({ chainId: '0x1' })
  expect(chainChanged).toHaveBeenCalledWith('0xa')
  expect(provider.chainId).toBe('0xa')
  expect(accountsChanged).toHaveBeenCalledWith(accounts)
  expect(provider.accounts).toEqual(accounts)
  expect(provider.selectedAddress).toBe(accounts[0])
  expect(provider.coinbase).toBe(accounts[0])
  expect(message).toHaveBeenCalledWith(notification)
})

it('emits canonical events only for actual state transitions', () => {
  const { raw, provider } = setup()
  const connect = jest.fn()
  const chainChanged = jest.fn()
  const accountsChanged = jest.fn()
  provider.on('connect', connect)
  provider.on('chainChanged', (chainId) => chainChanged(chainId, provider.chainId))
  provider.on('accountsChanged', accountsChanged)
  const firstAccounts = ['0x1111111111111111111111111111111111111111']
  const nextAccounts = ['0x2222222222222222222222222222222222222222']

  raw.emit('connect', { chainId: '0x1' })
  raw.emit('connect', { chainId: '0x1' })
  raw.emit('chainChanged', '0x01')
  raw.emit('chainChanged', '0xA')
  raw.emit('chainChanged', '0xa')
  raw.emit('accountsChanged', firstAccounts)
  raw.emit('accountsChanged', [...firstAccounts])
  raw.emit('accountsChanged', nextAccounts)

  expect(connect).toHaveBeenCalledTimes(1)
  expect(connect).toHaveBeenCalledWith({ chainId: '0x1' })
  expect(chainChanged).toHaveBeenCalledTimes(1)
  expect(chainChanged).toHaveBeenCalledWith('0xa', '0xa')
  expect(accountsChanged).toHaveBeenCalledTimes(2)
  expect(accountsChanged).toHaveBeenNthCalledWith(1, firstAccounts)
  expect(accountsChanged).toHaveBeenNthCalledWith(2, nextAccounts)
})

it('updates compatibility state before account listeners run and ignores malformed events', () => {
  const { raw, provider } = setup()
  const observed = []
  provider.on('accountsChanged', (accounts) => {
    observed.push({
      accounts,
      providerAccounts: [...provider.accounts],
      selectedAddress: provider.selectedAddress,
      coinbase: provider.coinbase
    })
  })
  provider.on('chainChanged', (chainId) => observed.push({ chainId }))
  const accounts = ['0x3333333333333333333333333333333333333333']

  raw.emit('accountsChanged', null)
  raw.emit('accountsChanged', ['not-an-address'])
  raw.emit('chainChanged', '1')
  raw.emit('accountsChanged', accounts)

  expect(observed).toEqual([
    {
      accounts,
      providerAccounts: accounts,
      selectedAddress: accounts[0],
      coinbase: accounts[0]
    }
  ])
})

it('delegates legacy methods without changing their call shapes', () => {
  const { raw, provider } = setup()
  const callback = jest.fn()

  provider.send('eth_chainId', callback)
  provider.sendAsync({ method: 'eth_chainId' }, callback)
  provider.subscribe('eth_subscribe', 'newHeads')
  provider.unsubscribe('eth_unsubscribe', '0x1')
  provider.setChain('0xa')
  provider.close()

  expect(raw.send).toHaveBeenCalledWith('eth_chainId', callback)
  expect(raw.sendAsync).toHaveBeenCalledWith({ method: 'eth_chainId' }, callback)
  expect(raw.subscribe).toHaveBeenCalledWith('eth_subscribe', 'newHeads')
  expect(raw.unsubscribe).toHaveBeenCalledWith('eth_unsubscribe', '0x1')
  expect(raw.setChain).toHaveBeenCalledWith('0xa')
  expect(raw.close).toHaveBeenCalledTimes(1)
})
