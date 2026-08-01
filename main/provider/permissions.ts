import { z } from 'zod'

const emptyParamsSchema = z.tuple([])
const requestParamsSchema = z.tuple([
  z
    .object({
      eth_accounts: z.object({}).strict()
    })
    .strict()
])

function invalidParams(message: string) {
  return { code: -32602, message: `Invalid params: ${message}` }
}

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value ?? [])
  if (!result.success) throw invalidParams(result.error.issues[0].message)
  return result.data
}

export function parseGetPermissions(params: unknown) {
  parseSchema(emptyParamsSchema, params)
}

export function parseRequestPermissions(params: unknown) {
  parseSchema(requestParamsSchema, params)
  return 'eth_accounts' as const
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
