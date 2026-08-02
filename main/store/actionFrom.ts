export function requireStoreActionFrom(source: Store, name: string) {
  const action = source[name]
  if (typeof action !== 'function') throw new Error(`Store action ${name} is unavailable`)
  return action.bind(source)
}
