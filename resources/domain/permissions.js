import { matchFilter } from '../utils'

export const getPermissionIds = (permissions, filter = '') =>
  Object.keys(permissions)
    .filter((id) => matchFilter(filter, [permissions[id].origin]))
    .sort((left, right) => permissions[left].origin.localeCompare(permissions[right].origin))
