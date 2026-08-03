import link from '../../../resources/link'

export const getYearnCatalog = (force = false) => link.invoke('yearn:getCatalog', { force })
