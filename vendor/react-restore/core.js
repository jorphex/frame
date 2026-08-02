/* global module, setTimeout */

// Store semantics derived from react-restore 0.6.2; see LICENSE.

const freeze = (value) => {
  if (typeof value === 'object' && value !== null) {
    Object.keys(value).forEach((key) => freeze(value[key]))
  }
  return Object.freeze(value)
}

const normalizePath = (path) => path.replace(/\]\[|\]|\[/g, '.').replace(/["']|^\.+|\.+$/g, '')

const pathway = (path) => {
  if (!path) return ''
  if (path.constructor === Array) return normalizePath(path.join('.'))
  if (path.constructor === String) return normalizePath(path)
  throw new Error('[Restore] Pathway Error')
}

const splitPath = (path) => {
  if (!path || path === '*') return []
  if (path.constructor === Array) return path
  return path.split('.')
}

const get = (value, path) => {
  const parts = splitPath(path)
  parts.some((key, index) => {
    if (typeof value !== 'object') {
      const parent = parts[index - 1]
      throw new Error(
        `Get path '${parts.join('.')}' cannot navigate past key '${parent}', '${parent}' is non-object value '${value}'.`
      )
    }
    value = value[key]
    return value === undefined
  })
  return value
}

const thaw = (value) => {
  if (typeof value !== 'object' || value === null) return value
  if (value.constructor === Array) {
    const next = []
    for (let index = 0; index < value.length; index++) next[index] = thaw(value[index])
    return next
  }
  const next = {}
  for (const key in value) next[key] = thaw(value[key])
  return next
}

const thawShallow = (value) => {
  if (!value) return {}
  if (Object.prototype.toString.call(value) === '[object Object]') return { ...value }
  if (Object.prototype.toString.call(value) === '[object Array]') return value.slice()
}

const patch = (value, path, replacement) => {
  if (path === '*') return freeze(replacement)
  const parts = splitPath(path)
  const next = thawShallow(value)
  const key = parts.shift()
  next[key] = parts.length > 0 ? patch(next[key], parts, replacement) : freeze(replacement)
  return Object.freeze(next)
}

const expandTargets = (internal) => {
  const links = Object.keys(internal.links)
  let paths = internal.queue.paths
  if (paths.includes('*')) return links

  paths.push('*')
  paths = [...new Set(paths)]
  const targets = []
  const includeParents = (path) => {
    if (!path) return
    if (internal.links[path] && !targets.includes(path)) targets.push(path)
    includeParents(path.substring(0, path.lastIndexOf('.')))
  }

  paths.forEach((path) => {
    links.forEach((link) => {
      if (link.startsWith(path) && !targets.includes(link)) targets.push(link)
    })
    includeParents(path)
  })
  return targets
}

const observe = (internal, id, run) => {
  const previousLinks = internal.observers[id].links.slice()
  internal.observers[id].links = []
  const observer = run || internal.observers[id].run
  internal.track = id
  const context = { store: internal.store, remove: () => internal.store.api.remove(id) }
  const returned = observer.call(context, context.store, context.remove)
  internal.track = null

  if (internal.observers[id]) {
    previousLinks
      .filter((link) => !internal.observers[id].links.includes(link))
      .forEach((link) => {
        const index = internal.links[link].indexOf(id)
        if (index !== -1) internal.links[link].splice(index, 1)
      })
  }
  return returned
}

const processPending = (internal) => {
  if (internal.pending.length === 0) return
  observe(internal, internal.pending.shift())
  processPending(internal)
}

const notify = (internal) => {
  expandTargets(internal).forEach((target) => {
    internal.pending = internal.pending.concat(internal.links[target])
  })
  internal.pending = [...new Set(internal.pending)]
  internal.pending.sort((left, right) => internal.order.indexOf(left) - internal.order.indexOf(right))
  Object.values(internal.watchers).forEach((watcher) =>
    watcher(internal.state, internal.queue.actions, internal.pending.length)
  )
  processPending(internal)
  internal.queue = { paths: [], actions: [] }
}

const resolveActions = (internal, action, tree = {}, name) => {
  if (typeof action === 'function') {
    return (...args) => {
      let deferred = false
      const count = (internal.count[name] = ++internal.count[name] || 1)
      internal.queue.actions.push({ name, count, deferred, updates: [] })
      if (internal.queue.actions.length === 1) setTimeout(() => notify(internal), 0)

      const update = (...updateArgs) => {
        const updater = updateArgs.pop()
        const path = pathway(updateArgs) || '*'
        const current = path === '*' ? internal.state : get(internal.state, path)
        const value = updater(thaw(current), internal.state)
        internal.state = patch(internal.state, path, value)
        internal.queue.paths.push(path)

        const last = internal.queue.actions[internal.queue.actions.length - 1]
        const recordedUpdate = { path, value }
        if (last && last.name === name && last.count === count) {
          last.updates.push(recordedUpdate)
        } else {
          internal.queue.actions.push({ name, count, deferred, updates: [recordedUpdate] })
          if (internal.queue.actions.length === 1) setTimeout(() => notify(internal), 0)
        }
      }

      if (internal.track) setTimeout(() => action(update, ...args), 0)
      else action(update, ...args)
      setTimeout(() => {
        deferred = true
      }, 0)
      return internal.store
    }
  }

  if (typeof action === 'object') {
    Object.keys(action).forEach((key) => {
      tree[key] = resolveActions(internal, action[key], tree[key], name ? `${name}.${key}` : key)
    })
    return tree
  }

  throw new Error(`[Restore] Invalid entry in action tree: '${name}' is a ${typeof action}.`)
}

const uuid = () => {
  let time = Date.now()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = ((time + Math.random() * 16) % 16) | 0
    time = Math.floor(time / 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

const create = (state = {}, actions = {}) => {
  const internal = {
    state: freeze(state),
    queue: { paths: [], actions: [] },
    watchers: {},
    track: '',
    order: [],
    links: {},
    observers: {},
    pending: [],
    count: {}
  }

  const store = (...args) => {
    const path = pathway(args) || '*'
    if (internal.track) {
      const id = internal.track
      internal.observers[id].links ||= []
      internal.links[path] ||= []
      if (!internal.observers[id].links.includes(path)) internal.observers[id].links.push(path)
      if (!internal.links[path].includes(id)) internal.links[path].push(id)
    }
    return get(internal.state, path)
  }

  store.observer = (run, id, alternateRun) => {
    id ||= uuid()
    if (!internal.order.includes(id)) internal.order.push(id)
    internal.observers[id] = {
      links: internal.observers[id]?.links || [],
      run: alternateRun || run
    }
    return { returned: observe(internal, id, run), remove: () => store.api.remove(id) }
  }

  store.api = {
    replaceState: (replacement) => {
      const state = freeze(replacement)
      internal.queue.paths.push('*')
      internal.queue.actions.push({
        name: 'api.replaceState',
        count: 0,
        internal: true,
        updates: [{ path: '*', value: state }]
      })
      internal.state = state
      notify(internal)
    },
    feed: (watcher) => {
      const id = uuid()
      internal.watchers[id] = watcher
      return { remove: () => delete internal.watchers[id] }
    },
    remove: (id) => {
      if (internal.track === id) internal.track = null
      const pendingIndex = internal.pending.indexOf(id)
      if (pendingIndex > -1) internal.pending.splice(pendingIndex, 1)
      const orderIndex = internal.order.indexOf(id)
      if (orderIndex > -1) internal.order.splice(orderIndex, 1)
      Object.values(internal.links).forEach((links) => {
        const index = links.indexOf(id)
        if (index > -1) links.splice(index, 1)
      })
      delete internal.observers[id]
    },
    report: (id) => {
      const index = internal.pending.indexOf(id)
      if (index > -1) internal.pending.splice(index, 1)
    }
  }

  Object.keys(store.api).forEach((method) => {
    if (actions[method]) throw new Error(`[Restore] API method name ${method} is reserved.`)
  })
  Object.assign(store, resolveActions(internal, actions))
  internal.store = store
  return store
}

module.exports = { create }
