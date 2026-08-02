import store from '.'

export function requireStoreAction(name: string) {
  const action = store[name]
  if (typeof action !== 'function') throw new Error(`Store action ${name} is unavailable`)
  return action.bind(store)
}
