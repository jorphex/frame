const MAX_ACCOUNT_CODE_BYTES = 128 * 1024
const DATA = /^0x(?:[0-9a-fA-F]{2})*$/
const EIP_7702_DELEGATION = /^0xef0100([0-9a-f]{40})$/i

export type ParsedAccountCode =
  | Readonly<{ status: 'no-code' }>
  | Readonly<{ status: 'delegated'; delegate: string }>
  | Readonly<{ status: 'contract' }>

export function parseDelegationIndicator(value: unknown) {
  if (typeof value !== 'string') return

  const match = EIP_7702_DELEGATION.exec(value)
  return match?.[1] ? `0x${match[1].toLowerCase()}` : undefined
}

export function parseAccountCode(value: unknown): ParsedAccountCode | undefined {
  if (typeof value !== 'string' || value.length > MAX_ACCOUNT_CODE_BYTES * 2 + 2 || !DATA.test(value)) {
    return
  }
  if (value === '0x') return Object.freeze({ status: 'no-code' })

  const delegate = parseDelegationIndicator(value)
  return delegate ? Object.freeze({ status: 'delegated', delegate }) : Object.freeze({ status: 'contract' })
}
