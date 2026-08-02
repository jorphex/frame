import { EventEmitter } from 'stream'
import EthereumProvider from 'ethereum-provider'
import log from 'electron-log'

import proxyConnection from '../provider/proxy'
import createEns from './ens'
import createIpfs from './ipfs'
import { resolveManifest } from './manifest'

const mainnetProvider = new EthereumProvider(proxyConnection)
mainnetProvider.setChain(1)

const isMainnetConnected = (chains: RPC.GetEthereumChains.Chain[]) =>
  !!chains.find((chain) => chain.chainId === 1)?.connected

export default function (provider = mainnetProvider) {
  let ready = false
  const events = new EventEmitter()
  const ipfs = createIpfs()
  const ens = createEns(provider)

  const readyHandler = (chains: RPC.GetEthereumChains.Chain[]) => {
    if (!isMainnetConnected(chains)) return

    provider.off('chainsChanged', readyHandler)
    ready = true
    events.emit('ready')
  }

  const checkReady = async () => {
    try {
      const activeChains = await provider.request<RPC.GetEthereumChains.Chain[]>({
        method: 'wallet_getEthereumChains'
      })
      readyHandler(activeChains)
    } catch (error) {
      log.warn('Could not determine decentralized content readiness', error)
    }
  }

  provider.on('chainsChanged', readyHandler)
  provider.once('connect', checkReady)
  if (provider.connected) void checkReady()

  return {
    once: events.once.bind(events),
    ready: () => ready,
    ipfs,
    ens,
    resolve: async (ensName: string) => {
      const record = await ens.resolve(ensName)
      const ethAddress = record.addresses.eth
      const address = ethAddress && (await ens.verifyAddress(ensName, ethAddress)) ? ethAddress : ''
      const manifestPath = record.text['manifest']
      const manifest = manifestPath ? await resolveManifest(ipfs, manifestPath) : {}

      return { name: ensName, address, record, manifest }
    }
  }
}
