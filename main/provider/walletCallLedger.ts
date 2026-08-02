import store from '../store'
import { requireStoreAction } from '../store/action'
import type { WalletCallBatches } from '../store/state/types/walletCallBatch'
import { WalletCallBatchLedger } from './walletCallBatches'

export const walletCallBatchLedger = new WalletCallBatchLedger({
  load: () => store('main.walletCallBatches'),
  save: (batches: WalletCallBatches) => {
    requireStoreAction('setWalletCallBatches')(batches)
  }
})

export default walletCallBatchLedger
