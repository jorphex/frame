export interface Breadcrumb {
  view: string
  data: any
}

type Step = 'confirm'

interface RequestData {
  step: Step
  accountId: string
  requestId: string
}

export interface RequestBreadcrumb extends Omit<Breadcrumb, 'view'> {
  view: 'requestView'
  data: RequestData
}

export interface WalletCallStatusViewData {
  accountId: string
  originName: string
  status: {
    version: '2.0.0'
    id: string
    chainId: string
    status: 100 | 200 | 400 | 500 | 600
    atomic: false
    receipts?: Array<{
      status: '0x0' | '0x1'
      blockNumber: string
      gasUsed: string
      transactionHash: string
    }>
  }
}

export interface WalletCallsStatusBreadcrumb extends Omit<Breadcrumb, 'view'> {
  view: 'walletCallsStatus'
  data: WalletCallStatusViewData
}
