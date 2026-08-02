import { readFile } from 'node:fs/promises'

const forbidden = {
  'main/accounts/index.ts': ['JSON.stringify(req)'],
  'main/provider/index.ts': [
    "'approveRequest', txToLog",
    "'Successfully populated transaction', checkedTransaction",
    'JSON.stringify(tx)',
    "'provider subscribe', { payload }",
    'JSON.stringify(payload)'
  ],
  'main/signers/ledger/Ledger/index.ts': [
    "'successfully signed message on Ledger: ', message",
    "'successfully signed typed data on Ledger: ', typedMessage.data",
    "'successfully signed transaction on Ledger: ', ledgerTx"
  ],
  'main/signers/trezor/bridge.ts': ["'pairing response entered for device', { deviceId, payload }"]
}

for (const [file, patterns] of Object.entries(forbidden)) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  for (const pattern of patterns) {
    if (source.includes(pattern)) throw new Error(`${file} logs sensitive wallet payloads`)
  }
}

console.log('Verified signing, transaction, and pairing payload log hygiene')
