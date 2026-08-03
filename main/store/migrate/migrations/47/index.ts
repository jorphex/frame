import { z } from 'zod'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        networks: z.object({ ethereum: z.record(z.string(), z.unknown()) }).passthrough(),
        networksMeta: z.object({ ethereum: z.record(z.string(), z.unknown()) }).passthrough()
      })
      .passthrough()
  })
  .passthrough()

const katanaNetwork = {
  id: 747474,
  type: 'ethereum',
  layer: 'rollup',
  isTestnet: false,
  name: 'Katana',
  explorer: 'https://katanascan.com',
  gas: {
    price: {
      selected: 'standard',
      levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
    }
  },
  connection: {
    primary: {
      on: true,
      current: 'custom',
      status: 'loading',
      connected: false,
      type: '',
      network: '',
      custom: 'https://rpc.katana.network/'
    },
    secondary: {
      on: false,
      current: 'custom',
      status: 'loading',
      connected: false,
      type: '',
      network: '',
      custom: ''
    }
  },
  on: false
}

const katanaMetadata = {
  blockHeight: 0,
  gas: {
    fees: {},
    price: {
      selected: 'standard',
      levels: { slow: '', standard: '', fast: '', asap: '', custom: '' }
    }
  },
  nativeCurrency: {
    symbol: 'ETH',
    usd: { price: 0, change24hr: 0 },
    icon: '',
    name: 'Ether',
    decimals: 18
  },
  icon: '',
  primaryColor: 'accent3'
}

const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial

  const networks = { ...parsed.data.main.networks.ethereum }
  const networksMeta = { ...parsed.data.main.networksMeta.ethereum }
  if (!networks['747474']) networks['747474'] = katanaNetwork
  if (!networksMeta['747474']) networksMeta['747474'] = katanaMetadata

  return {
    ...parsed.data,
    main: {
      ...parsed.data.main,
      networks: { ...parsed.data.main.networks, ethereum: networks },
      networksMeta: { ...parsed.data.main.networksMeta, ethereum: networksMeta },
      yearn: parsed.data.main['yearn'] || { catalogCache: null }
    }
  }
}

export default { version: 47, migrate }
