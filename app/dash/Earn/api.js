import link from '../../../resources/link'

export const getYearnCatalog = async (force = false) => {
  const result = await link.invoke('yearn:getCatalog', { force })
  if (
    !result ||
    !Array.isArray(result.vaults) ||
    !['fresh', 'stale', 'unavailable'].includes(result.status)
  ) {
    throw new Error('Yearn catalog response was unavailable')
  }
  return result
}

export const getYearnPositions = async () => {
  const result = await link.invoke('yearn:getPositions')
  if (!result || !Array.isArray(result.chains)) throw new Error('Yearn positions response was unavailable')
  return result
}
