type HexAmount = string

type InventoryAsset = {
  name: string
  tokenId?: string
  [field: string]: unknown
}

type InventoryCollection = {
  meta: unknown
  items: Record<string, InventoryAsset>
}

type Inventory = Record<string, InventoryCollection>

interface ViewMetadata {
  id: string
  ready: boolean
  dappId: string
  ens: string
  url: string
}

interface Frame {
  id: string
  currentView: string
  views: Record<string, ViewMetadata>
  fullscreen?: boolean
  maximized?: boolean
}

type SignerType = 'ring' | 'seed' | 'trezor' | 'ledger' | 'lattice'
type AccountSignerType = SignerType | 'address'
type AccountStatus = 'ok'

interface Signer {
  id: string
  name: string
  model: string
  type: SignerType
  addresses: Address[]
  status: string
  createdAt: number
}

interface Account {
  id: string
  name: string
  lastSignerType: AccountSignerType
  active: boolean
  address: Address
  status: AccountStatus
  signer: string
  requests: Record<string, unknown>
  ensName: string
  created: string
  balances: {
    lastUpdated?: number
  }
}
