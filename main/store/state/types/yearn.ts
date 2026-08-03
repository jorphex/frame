import { z } from 'zod'

import { YearnCatalogCacheSchema, YearnWorkflowsSchema } from '../../../../resources/domain/yearn'

export const YearnStateSchema = z
  .object({
    catalogCache: YearnCatalogCacheSchema.nullable(),
    workflows: YearnWorkflowsSchema
  })
  .strict()

export type YearnState = z.infer<typeof YearnStateSchema>
