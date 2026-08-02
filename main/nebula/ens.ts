import { BrowserProvider } from 'ethers'

import type { Eip1193Provider } from 'ethers'

type EthereumProvider = {
  connected?: boolean
  request: (payload: { method: string }) => Promise<string>
  once: (event: string, handler: () => void) => void
}

type Resolver = {
  getAddress: (coinType?: number) => Promise<string | null>
  getContentHash: () => Promise<string | null>
  getText: (key: string) => Promise<string | null>
}

type Web3Provider = {
  getResolver: (name: string) => Promise<Resolver | null>
  lookupAddress: (address: string) => Promise<string | null>
}

const textFields = ['manifest', 'avatar', 'com.twitter', 'com.github'] as const

function normalizeContentPath(content: string | null) {
  if (!content) return ''
  if (content.startsWith('ipfs://')) return `/ipfs/${content.slice('ipfs://'.length)}`
  if (content.startsWith('ipns://')) return `/ipns/${content.slice('ipns://'.length)}`
  return content
}

function waitForProvider(provider: EthereumProvider, timeout = 10_000) {
  if (provider.connected) {
    return provider.request({ method: 'eth_chainId' })
  }

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Ethereum provider is not connected')), timeout)

    provider.once('connect', () => {
      clearTimeout(timer)
      provider.request({ method: 'eth_chainId' }).then(resolve, reject)
    })
  })
}

async function withTimeout<T>(operation: Promise<T>, milliseconds: number) {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ENS resolve timed out')), milliseconds)
  })

  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export default function createEns(
  provider: EthereumProvider,
  web3Provider: Web3Provider = new BrowserProvider(provider as Eip1193Provider, 'any')
) {
  const resolve = async (name: string, options: { timeout?: number } = {}) => {
    const operation = async () => {
      const chain = await waitForProvider(provider)
      const resolver = await web3Provider.getResolver(name)
      if (!resolver) throw new Error(`No ENS resolver configured for ${name}`)

      const [content, ethAddress, btcAddress, ...textValues] = await Promise.all([
        resolver.getContentHash(),
        resolver.getAddress(),
        resolver.getAddress(0).catch(() => null),
        ...textFields.map((field) => resolver.getText(field))
      ])

      return {
        name,
        chain,
        content: normalizeContentPath(content),
        addresses: { eth: ethAddress?.toLowerCase() || '', btc: btcAddress || '' },
        text: Object.fromEntries(textFields.map((field, index) => [field, textValues[index] || '']))
      }
    }

    return withTimeout(operation(), options.timeout || 60_000)
  }

  const reverseLookup = async (addresses: string | string[]) => {
    await waitForProvider(provider)
    const values = typeof addresses === 'string' ? [addresses] : addresses

    return Promise.all(
      values.map((address) =>
        web3Provider.lookupAddress(address).then(
          (name) => name || '',
          () => ''
        )
      )
    )
  }

  const verifyAddress = async (name: string, address: string) => {
    const [registeredName] = await reverseLookup(address)
    return typeof registeredName === 'string' && registeredName.toLowerCase() === name.toLowerCase()
  }

  return { resolve, reverseLookup, verifyAddress }
}
