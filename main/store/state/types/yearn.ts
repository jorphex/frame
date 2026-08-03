import { z } from 'zod'

import { YearnCatalogCacheSchema } from '../../../../resources/domain/yearn'

export const YearnStateSchema = z
  .object({
    catalogCache: YearnCatalogCacheSchema.nullable()
  })
  .strict()

export type YearnState = z.infer<typeof YearnStateSchema>
