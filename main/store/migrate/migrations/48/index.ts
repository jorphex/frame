import { z } from 'zod'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        yearn: z.object({ catalogCache: z.unknown().nullable() }).passthrough()
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
      yearn: { ...parsed.data.main.yearn, workflows: parsed.data.main.yearn['workflows'] || {} }
    }
  }
}

export default { version: 48, migrate }
