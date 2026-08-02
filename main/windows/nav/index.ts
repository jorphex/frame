// Manage navigation states for each window

import { requireStoreAction } from '../../store/action'
import { onRenderer } from '../../ipc/renderer'
import type { Breadcrumb } from './breadcrumb'

const nav = {
  forward: (windowId: string, crumb: Breadcrumb) => {
    // Adds new crumb to nav array
    requireStoreAction('navForward')(windowId, crumb)
  },
  back: (windowId: string, steps = 1) => {
    // Removes last crumb from nav array
    requireStoreAction('navBack')(windowId, steps)
  },
  update: (windowId: string, crumb: Breadcrumb, navigate = true) => {
    // Updated last crumb in nav array with new data
    // Replaces last crumb when navigate is false
    // Adds new crumb to nav array when navigate is true
    requireStoreAction('navUpdate')(windowId, crumb, navigate)
  }
}

onRenderer('nav:forward', (e, windowId: string, crumb: Breadcrumb) => {
  nav.forward(windowId, crumb)
})

onRenderer('nav:back', (e, windowId: string, steps = 1) => {
  nav.back(windowId, steps)
})

onRenderer('nav:update', (e, windowId: string, crumb: Breadcrumb, navigate: boolean) => {
  nav.update(windowId, crumb, navigate)
})

export default nav
