import log from 'electron-log'

import store from '../store'
import { requireStoreAction } from '../store/action'
import { createYearnCatalogService } from './service'

const catalogService = createYearnCatalogService({
  readCache: () => store('main.yearn.catalogCache'),
  writeCache: (cache) => requireStoreAction('setYearnCatalogCache')(cache),
  onError: (reason) => log.warn('Could not refresh Yearn catalog', { reason })
})

export default catalogService
export * from './service'
