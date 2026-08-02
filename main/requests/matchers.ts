import { z, ZodError, ZodObject } from 'zod'

export function createRequestMatcher<T extends ZodObject>(method: string, params: T) {
  return z.object({
    id: z.number(),
    jsonrpc: z.literal('2.0'),
    params
  })
}

function valueAtPath(input: unknown, path: PropertyKey[]) {
  return path.reduce<unknown>((value, key) => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined
    return Reflect.get(value, key)
  }, input)
}

export function generateError(err: ZodError, input: unknown) {
  const issue = err.issues[0]
  const { message: errorMessage = '' } = issue || {}

  if (issue?.code === 'invalid_type' && valueAtPath(input, issue.path) === undefined) {
    const field = issue.path[issue.path.length - 1]
    return new Error(`${String(field)} parameter is required`)
  }

  return new Error(errorMessage)
}
