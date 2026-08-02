import { z } from 'zod'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        knownExtensions: z.unknown().optional(),
        extensionCredentials: z.unknown().optional()
      })
      .passthrough()
  })
  .passthrough()

const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial

  const { knownExtensions: _legacyTrust, ...main } = parsed.data.main
  return {
    ...parsed.data,
    main: {
      ...main,
      extensionCredentials: {}
    }
  }
}

export default {
  version: 44,
  migrate
}
