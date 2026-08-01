import EventEmitter from 'events'

const REQUEST_ERROR = -32602
const INTERNAL_ERROR = -32603
const DISCONNECTED = 4900
const DISCONNECT_CLOSE_CODE = 1013
const CHAIN_ID = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/

export class ProviderRpcError extends Error {
  constructor(code, message, data) {
    super(message)
    this.name = 'ProviderRpcError'
    this.code = code
    if (data !== undefined) this.data = data
  }
}

const providerError = (error, fallbackCode = INTERNAL_ERROR, fallbackMessage = 'Internal error') => {
  const code = Number.isInteger(error?.code) ? error.code : fallbackCode
  const message = typeof error?.message === 'string' && error.message ? error.message : fallbackMessage
  return new ProviderRpcError(code, message, error?.data)
}

const validateRequest = (request) => {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new ProviderRpcError(REQUEST_ERROR, 'Invalid request arguments')
  }
  if (typeof request.method !== 'string' || !request.method.length) {
    throw new ProviderRpcError(REQUEST_ERROR, 'Request method must be a non-empty string')
  }
  if (
    request.params !== undefined &&
    (!request.params || (typeof request.params !== 'object' && !Array.isArray(request.params)))
  ) {
    throw new ProviderRpcError(REQUEST_ERROR, 'Request params must be an array or object')
  }
  return request
}

const canonicalChainId = (chainId) => {
  if (typeof chainId !== 'string' || !CHAIN_ID.test(chainId)) return
  return `0x${BigInt(chainId).toString(16)}`
}

const validAccounts = (accounts) =>
  Array.isArray(accounts) && accounts.every((account) => typeof account === 'string')

export class Eip1193Provider extends EventEmitter {
  constructor(provider) {
    super()
    this.provider = provider
    this.pending = new Set()
    this.disconnected = false
    this.accounts = validAccounts(provider.accounts) ? [...provider.accounts] : []
    this.selectedAddress = this.accounts[0]
    this.coinbase = this.accounts[0]
    this.forwardedEvents = new Set()
    this.eventForwarders = {
      chainChanged: (value) => {
        const chainId = canonicalChainId(value)
        if (chainId) this.emit('chainChanged', chainId)
      },
      accountsChanged: (accounts) => {
        if (!validAccounts(accounts)) return
        this.syncAccounts(accounts)
        this.emit('accountsChanged', [...accounts])
      },
      message: (message) => this.emit('message', message),
      networkChanged: (...args) => this.emit('networkChanged', ...args),
      chainsChanged: (...args) => this.emit('chainsChanged', ...args),
      assetsChanged: (...args) => this.emit('assetsChanged', ...args),
      data: (...args) => this.emit('data', ...args),
      status: (...args) => this.emit('status', ...args),
      close: (...args) => this.emit('close', ...args),
      enable: (...args) => this.emit('enable', ...args)
    }

    provider.on('connect', (info) => {
      const chainId = canonicalChainId(info?.chainId ?? provider.chainId)
      if (!chainId) return
      this.disconnected = false
      this.emit('connect', { chainId })
    })
    provider.on('disconnect', () => this.handleDisconnect())
    this.on('newListener', (event) => {
      const forward = this.eventForwarders[event]
      if (!forward || this.forwardedEvents.has(event)) return
      this.forwardedEvents.add(event)
      provider.on(event, forward)
    })
  }

  get chainId() {
    return canonicalChainId(this.provider.chainId)
  }

  get networkVersion() {
    return this.provider.networkVersion
  }

  get status() {
    return this.provider.status
  }

  syncAccounts(accounts) {
    this.accounts = [...accounts]
    this.selectedAddress = accounts[0]
    this.coinbase = accounts[0]
  }

  handleDisconnect() {
    if (this.disconnected) return
    this.disconnected = true
    const requestError = new ProviderRpcError(DISCONNECTED, 'Provider is disconnected from all chains')
    this.pending.forEach((pending) => pending.reject(requestError))
    this.pending.clear()
    this.emit(
      'disconnect',
      new ProviderRpcError(DISCONNECT_CLOSE_CODE, 'Provider transport disconnected; retry later')
    )
  }

  request(request) {
    try {
      validateRequest(request)
    } catch (error) {
      return Promise.reject(error)
    }

    if (this.disconnected) {
      return Promise.reject(new ProviderRpcError(DISCONNECTED, 'Provider is disconnected from all chains'))
    }

    return new Promise((resolve, reject) => {
      let active = true
      const settle = (callback, value) => {
        if (!active) return
        active = false
        this.pending.delete(pending)
        callback(value)
      }
      const pending = {
        reject: (error) => settle(reject, error)
      }
      this.pending.add(pending)

      Promise.resolve()
        .then(() => (active ? this.provider.request(request) : undefined))
        .then((result) => {
          if (!active) return
          if (['eth_accounts', 'eth_requestAccounts'].includes(request.method) && validAccounts(result)) {
            this.syncAccounts(result)
          }
          settle(resolve, result)
        })
        .catch((error) => {
          const fallbackCode = error?.message === 'Not connected' ? DISCONNECTED : INTERNAL_ERROR
          settle(reject, providerError(error, fallbackCode))
        })
    })
  }

  isConnected() {
    return !this.disconnected && Boolean(this.provider.isConnected?.())
  }

  enable() {
    return this.request({ method: 'eth_requestAccounts' })
  }

  send(methodOrPayload, callbackOrArgs) {
    if (methodOrPayload && typeof methodOrPayload === 'object' && typeof callbackOrArgs !== 'function') {
      return this.request(methodOrPayload)
    }
    return this.provider.send(methodOrPayload, callbackOrArgs)
  }

  sendAsync(...args) {
    return this.provider.sendAsync(...args)
  }

  subscribe(...args) {
    return this.provider.subscribe(...args)
  }

  unsubscribe(...args) {
    return this.provider.unsubscribe(...args)
  }

  setChain(...args) {
    return this.provider.setChain(...args)
  }

  close() {
    return this.provider.close()
  }
}

export const createEip1193Provider = (provider) => new Eip1193Provider(provider)
