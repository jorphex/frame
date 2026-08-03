import type { YearnChainId } from '../../resources/domain/yearn'

export type YearnProductKind = 'direct' | 'yvUSD' | 'yBOLD'

export interface YearnCatalogDefinition {
  id: string
  chainId: YearnChainId
  chainName: 'Ethereum' | 'Base' | 'Katana'
  address: Address
  kind: YearnProductKind
  name: string
  description: string
  companions?: ReadonlyArray<{
    id: 'locked' | 'staked'
    address: Address
  }>
  periphery?: ReadonlyArray<Address>
}

export const YEARN_YVUSD_LOCKED_ADDRESS = '0xAaaFEa48472f77563961Cdb53291DEDfB46F9040'
export const YEARN_YVUSD_ZAP_ADDRESS = '0x7ba61c8e19414dcB8fe769a7Be63B508C8062bbA'
export const YEARN_YBOLD_STAKED_ADDRESS = '0x23346B04a7f55b8760E5860AA5A77383D63491cD'
export const YEARN_YBOLD_ZAP_ADDRESS = '0xe7099092533a3fb693bb123cd96b8e53b4d83c58'

export const YEARN_CATALOG_VERSION = 1

export const YEARN_CATALOG: readonly YearnCatalogDefinition[] = [
  {
    id: 'ethereum-yvusd',
    chainId: 1,
    chainName: 'Ethereum',
    address: '0x696d02Db93291651ED510704c9b286841d506987',
    kind: 'yvUSD',
    name: 'yvUSD',
    description: 'A USDC-denominated Yearn vault with liquid and higher-yield locked variants.',
    companions: [{ id: 'locked', address: YEARN_YVUSD_LOCKED_ADDRESS }],
    periphery: [YEARN_YVUSD_ZAP_ADDRESS]
  },
  {
    id: 'ethereum-yvusds-1',
    chainId: 1,
    chainName: 'Ethereum',
    address: '0x182863131F9a4630fF9E27830d945B1413e347E8',
    kind: 'direct',
    name: 'USDS-1 yVault',
    description: 'A multi-strategy Yearn vault for USDS.'
  },
  {
    id: 'ethereum-yvweth-1',
    chainId: 1,
    chainName: 'Ethereum',
    address: '0xc56413869c6CDf96496f2b1eF801fEDBdFA7dDB0',
    kind: 'direct',
    name: 'WETH-1 yVault',
    description: 'A multi-strategy Yearn vault for wrapped Ether.'
  },
  {
    id: 'ethereum-ybold',
    chainId: 1,
    chainName: 'Ethereum',
    address: '0x9F4330700a36B29952869fac9b33f45EEdd8A3d8',
    kind: 'yBOLD',
    name: 'Staked yBOLD',
    description: 'A Yearn BOLD position deposited into yBOLD and staked as ysyBOLD.',
    companions: [{ id: 'staked', address: YEARN_YBOLD_STAKED_ADDRESS }],
    periphery: [YEARN_YBOLD_ZAP_ADDRESS]
  },
  {
    id: 'base-yvusdc-h',
    chainId: 8453,
    chainName: 'Base',
    address: '0xc3BD0A2193c8F027B82ddE3611D18589ef3f62a9',
    kind: 'direct',
    name: 'USDC Horizon yVault',
    description:
      'A higher-risk Horizon multi-strategy vault for native Base USDC using less-proven yield venues.'
  },
  {
    id: 'katana-yvvbusdc',
    chainId: 747474,
    chainName: 'Katana',
    address: '0x80c34BD3A3569E126e7055831036aa7b212cB159',
    kind: 'direct',
    name: 'vbUSDC yVault',
    description: 'A direct multi-strategy Yearn vault for Katana Vault Bridge USDC.'
  },
  {
    id: 'katana-yvvbeth',
    chainId: 747474,
    chainName: 'Katana',
    address: '0xE007CA01894c863d7898045ed5A3B4Abf0b18f37',
    kind: 'direct',
    name: 'vbETH yVault',
    description: 'A direct multi-strategy Yearn vault for Katana Vault Bridge ETH.'
  },
  {
    id: 'katana-yvvbusdt',
    chainId: 747474,
    chainName: 'Katana',
    address: '0x9A6bd7B6Fd5C4F87eb66356441502fc7dCdd185B',
    kind: 'direct',
    name: 'vbUSDT yVault',
    description: 'A direct multi-strategy Yearn vault for Katana Vault Bridge USDT.'
  }
]

export const yearnVaultKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`

export const YEARN_ALLOWED_TARGETS = new Set(
  YEARN_CATALOG.flatMap((vault) => [
    yearnVaultKey(vault.chainId, vault.address),
    ...(vault.companions || []).map((entry) => yearnVaultKey(vault.chainId, entry.address)),
    ...(vault.periphery || []).map((address) => yearnVaultKey(vault.chainId, address))
  ])
)
