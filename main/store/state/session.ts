import { v5 as uuidv5 } from 'uuid'

import type { Main } from './types/main'

const legacyUnknownOriginId = uuidv5('Unknown', uuidv5.DNS)
const isSessionOnlyPermission = (origin: string) => origin === 'Unknown' || origin.startsWith('Unknown/')

export function clearSessionOnlyOrigins(main: Pick<Main, 'origins' | 'permissions'>) {
  const sessionOnlyOriginIds = new Set(
    Object.entries(main.origins)
      .filter(([id, origin]) => id === legacyUnknownOriginId || origin.sessionOnly)
      .map(([id]) => id)
  )

  Object.values(main.permissions).forEach((permissions) => {
    Object.entries(permissions).forEach(([originId, permission]) => {
      if (sessionOnlyOriginIds.has(originId) || isSessionOnlyPermission(permission.origin)) {
        delete permissions[originId]
      }
    })
  })

  main.origins = Object.fromEntries(
    Object.entries(main.origins).filter(([id]) => !sessionOnlyOriginIds.has(id))
  )
}
