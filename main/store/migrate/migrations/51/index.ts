import { z } from 'zod'

import { sanitizeAddressBook } from '../../../../../resources/domain/addressBook'

const StateSchema = z
  .object({
    main: z
      .object({
        _version: z.number(),
        addressBook: z.unknown().optional()
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
      addressBook: sanitizeAddressBook(parsed.data.main.addressBook).addressBook
    }
  }
}

export default { version: 51, migrate }
