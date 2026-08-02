import { z } from 'zod'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        extensionCredentials: z.unknown().optional()
      })
      .passthrough()
  })
  .passthrough()

const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial

  return {
    ...parsed.data,
    main: {
      ...parsed.data.main,
      extensionCredentials: {}
    }
  }
}

export default {
  version: 45,
  migrate
}
