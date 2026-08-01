import log from 'electron-log'

import connection from '../chains'
import walletCallBatchLedger from './walletCallLedger'
import { pollWalletCallEvidence, WalletCallEvidenceController } from './walletCallEvidenceController'
import { createWalletCallEvidenceRPC } from './walletCallEvidenceRPC'

const evidenceRPC = createWalletCallEvidenceRPC(connection)

export const walletCallEvidenceRuntime = new WalletCallEvidenceController({
  poll: () =>
    pollWalletCallEvidence({
      ledger: walletCallBatchLedger,
      ...evidenceRPC
    }),
  reportError: (error) => log.warn('Wallet-call evidence polling error', error)
})

export default walletCallEvidenceRuntime
