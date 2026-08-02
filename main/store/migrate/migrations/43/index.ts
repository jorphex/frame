import { z } from 'zod'

import { WalletCallBatchSchema } from '../../../state/types/walletCallBatch'

const INTERNAL_KEY = /^0x[0-9a-f]{64}$/

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        walletCallBatches: z.unknown().optional()
      })
      .passthrough()
  })
  .passthrough()

function migrateBatch(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return
  const transactions = (candidate as { transactions?: unknown }).transactions
  if (!Array.isArray(transactions)) return

  const migrated = {
    ...candidate,
    transactions: transactions.map((transaction) => {
      if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) return transaction
      return 'state' in transaction ? transaction : { ...transaction, state: 'submitted' }
    })
  }
  const parsed = WalletCallBatchSchema.safeParse(migrated)
  return parsed.success ? parsed.data : undefined
}

const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial

  const source = parsed.data.main.walletCallBatches
  const entries = source && typeof source === 'object' && !Array.isArray(source) ? Object.entries(source) : []
  const walletCallBatches = entries.reduce(
    (batches, [key, candidate]) => {
      const batch = INTERNAL_KEY.test(key) ? migrateBatch(candidate) : undefined
      if (batch) batches[key] = batch
      return batches
    },
    {} as Record<string, z.infer<typeof WalletCallBatchSchema>>
  )

  return {
    ...parsed.data,
    main: {
      ...parsed.data.main,
      walletCallBatches
    }
  }
}

export default {
  version: 43,
  migrate
}
