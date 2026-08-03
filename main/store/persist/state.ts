const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const pruneTransientPersistedState = (value: unknown) => {
  if (!isRecord(value) || !isRecord(value['__'])) return value

  let changed = false
  const versions = Object.fromEntries(
    Object.entries(value['__']).map(([version, entry]) => {
      if (!isRecord(entry) || !Object.prototype.hasOwnProperty.call(entry, 'main')) {
        return [version, entry]
      }
      if (Object.keys(entry).length === 1) return [version, entry]
      changed = true
      return [version, { main: entry['main'] }]
    })
  )

  return changed ? { ...value, __: versions } : value
}
