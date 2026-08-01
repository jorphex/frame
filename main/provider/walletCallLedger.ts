import store from '../store'
import type { WalletCallBatches } from '../store/state/types/walletCallBatch'
import { WalletCallBatchLedger } from './walletCallBatches'

export const walletCallBatchLedger = new WalletCallBatchLedger({
  load: () => store('main.walletCallBatches'),
  save: (batches: WalletCallBatches) => store.setWalletCallBatches(batches)
})

export default walletCallBatchLedger
