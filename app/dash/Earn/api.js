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

export const getYearnWorkflows = async () => {
  const result = await link.invoke('yearn:getWorkflows')
  if (!result || !Array.isArray(result.workflows)) throw new Error('Yearn workflows were unavailable')
  return result
}

const mutateWorkflow = async (method, request) => {
  const result = await link.invoke(method, request)
  if (!result || typeof result.success !== 'boolean')
    throw new Error('Yearn workflow response was unavailable')
  if (!result.success) throw new Error(result.error)
  return result.workflow
}

export const startYearnWorkflow = (request) => mutateWorkflow('yearn:startWorkflow', request)
export const resumeYearnWorkflow = (id) => mutateWorkflow('yearn:resumeWorkflow', { id })
export const cancelYearnWorkflow = (id) => mutateWorkflow('yearn:cancelWorkflow', { id })
export const revokeYearnWorkflow = (id) => mutateWorkflow('yearn:revokeWorkflow', { id })
