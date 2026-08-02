import { z } from 'zod'
import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import type { SignerCapabilities } from '../signers/capabilities'

const emptyParamsSchema = z.tuple([])
const requiredMethodSchema = z.string().min(1).max(128)
const requestParamsSchema = z.tuple([
  z
    .object({
      eth_accounts: z
        .object({
          requiredMethods: z.array(requiredMethodSchema).max(32).optional()
        })
        .strict()
    })
    .strict()
])

const typedDataMethods = new Map<string, SignTypedDataVersion>([
  ['signTypedData', SignTypedDataVersion.V1],
  ['signTypedData_v1', SignTypedDataVersion.V1],
  ['signTypedData_v3', SignTypedDataVersion.V3],
  ['signTypedData_v4', SignTypedDataVersion.V4],
  ['eth_signTypedData', SignTypedDataVersion.V1],
  ['eth_signTypedData_v1', SignTypedDataVersion.V1],
  ['eth_signTypedData_v3', SignTypedDataVersion.V3],
  ['eth_signTypedData_v4', SignTypedDataVersion.V4]
])

function invalidParams(message: string) {
  return { code: -32602, message: `Invalid params: ${message}` }
}

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value ?? [])
  if (!result.success) throw invalidParams(result.error.issues[0]?.message || 'invalid permission request')
  return result.data
}

export function parseGetPermissions(params: unknown) {
  parseSchema(emptyParamsSchema, params)
}

export function parseRequestPermissions(params: unknown) {
  const [request] = parseSchema(requestParamsSchema, params)
  return {
    parentCapability: 'eth_accounts' as const,
    requiredMethods: [...new Set(request.eth_accounts.requiredMethods || [])]
  }
}

export function findUnsupportedRequiredMethod(methods: readonly string[], capabilities: SignerCapabilities) {
  return methods.find((method) => {
    if (method === 'personal_sign' || method === 'eth_sign') return !capabilities.personalMessage
    if (method === 'eth_sendTransaction' || method === 'wallet_sendCalls') {
      return capabilities.transactionEnvelopes.length === 0
    }

    const typedDataVersion = typedDataMethods.get(method)
    return !typedDataVersion || !capabilities.typedDataVersions.includes(typedDataVersion)
  })
}

export function grantedAccountPermission(invoker: string) {
  return {
    invoker,
    parentCapability: 'eth_accounts',
    caveats: []
  }
}

export function requestedAccountPermission(date = Date.now()) {
  return {
    parentCapability: 'eth_accounts',
    date
  }
}
