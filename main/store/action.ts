import store from '.'
import { requireStoreActionFrom } from './actionFrom'

export function requireStoreAction(name: string) {
  return requireStoreActionFrom(store, name)
}
