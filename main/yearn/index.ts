import log from 'electron-log'

import accounts from '../accounts'
import chains from '../chains'
import store from '../store'
import { requireStoreAction } from '../store/action'
import { createYearnPositionsService } from './positions'
import { createYearnCatalogService } from './service'

const catalogService = createYearnCatalogService({
  readCache: () => store('main.yearn.catalogCache'),
  writeCache: (cache) => requireStoreAction('setYearnCatalogCache')(cache),
  onError: (reason) => log.warn('Could not refresh Yearn catalog', { reason })
})

let rpcId = 0
const readContract = (chainId: number, address: string, data: string) =>
  new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Account lookup timed out')), 12_000)
    try {
      chains.send(
        {
          id: ++rpcId,
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: address, data }, 'latest']
        },
        (response: { error?: { message?: string }; result?: unknown }) => {
          clearTimeout(timer)
          if (response.error) return reject(new Error(response.error.message || 'RPC lookup failed'))
          if (typeof response.result !== 'string') return reject(new Error('RPC lookup returned no value'))
          resolve(response.result)
        },
        { type: 'ethereum', id: chainId }
      )
    } catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  })

const getPositions = createYearnPositionsService({
  getCatalog: () => catalogService.getCatalog(),
  getCurrentAccount: () => accounts.current() || null,
  getNetworkStatus: (chainId) => {
    const network = store('main.networks.ethereum', chainId)
    if (!network) return null
    return {
      on: network.on === true,
      connected:
        network.connection?.primary?.connected === true || network.connection?.secondary?.connected === true
    }
  },
  readContract
})

export default { ...catalogService, getPositions }
export * from './positions'
export * from './service'
