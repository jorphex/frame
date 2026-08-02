import { Common } from '@ethereumjs/common'
import { TransactionFactory } from '@ethereumjs/tx'

import { normalizeTrezorTransaction } from '../../../../main/signers/trezor/transaction'

const address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const storageKey = `0x${'bb'.repeat(32)}`

function transaction(type, overrides = {}) {
  const common = new Common({ chain: 'mainnet', hardfork: type === '0x2' ? 'london' : 'berlin' })
  return TransactionFactory.fromTxData(
    {
      type,
      chainId: '0x1',
      nonce: '0x1',
      gasLimit: '0x5208',
      to: '0x1111111111111111111111111111111111111111',
      value: '0x0',
      data: '0x',
      ...(type === '0x2' ? { maxPriorityFeePerGas: '0x1', maxFeePerGas: '0x10' } : { gasPrice: '0x10' }),
      ...overrides
    },
    { common }
  )
}

it('preserves the canonical access list in a Trezor type-2 signing request', () => {
  const normalized = normalizeTrezorTransaction(
    '0x1',
    transaction('0x2', { accessList: [{ address, storageKeys: [storageKey] }] })
  )

  expect(normalized).toEqual({
    nonce: '01',
    gasLimit: '5208',
    to: '1111111111111111111111111111111111111111',
    value: '00',
    data: '',
    chainId: 1,
    maxFeePerGas: '10',
    maxPriorityFeePerGas: '01',
    accessList: [{ address, storageKeys: [storageKey] }]
  })
})

it('rejects Trezor type-1 signing instead of signing different legacy bytes', () => {
  expect(() => normalizeTrezorTransaction('0x1', transaction('0x1', { accessList: [] }))).toThrow(
    /does not support EIP-2930 type-1 transaction signing/
  )
})
