import Restore from 'react-restore'

const flush = () => jest.runAllTimers()

it('reads and immutably updates normalized nested paths', () => {
  const untouched = { value: 'same' }
  const store = Restore.create(
    { nested: { items: [{ value: 1 }, { value: 2 }] }, untouched },
    {
      setValue: (update, value) => update('nested', 'items[1]', 'value', () => value),
      replaceRoot: (update, value) => update(() => value)
    }
  )

  expect(store('nested.items[1]').value).toBe(2)
  expect(store('nested', 'items', 0, 'value')).toBe(1)
  expect(Object.isFrozen(store())).toBe(true)
  expect(Object.isFrozen(store('nested.items'))).toBe(true)

  const originalNested = store('nested')
  expect(store.setValue(3)).toBe(store)
  expect(store('nested.items[1].value')).toBe(3)
  expect(store('nested')).not.toBe(originalNested)
  expect(store('untouched')).toBe(untouched)
  expect(() => {
    store('nested').items = []
  }).toThrow()

  store.replaceRoot({ replacement: true })
  expect(store()).toEqual({ replacement: true })
})

it('supports nested actions and records one watcher batch', () => {
  const batches = []
  const store = Restore.create(
    { count: 0, label: '' },
    {
      counter: {
        update: (update, amount, label) => {
          update('count', (count) => count + amount)
          update('label', () => label)
        }
      }
    }
  )
  store.api.feed((state, actions, pending) => batches.push({ state, actions, pending }))

  expect(store.counter.update(2, 'updated')).toBe(store)
  expect(store('count')).toBe(2)
  expect(batches).toHaveLength(0)
  flush()

  expect(batches).toHaveLength(1)
  expect(batches[0].state).toEqual({ count: 2, label: 'updated' })
  expect(batches[0].actions).toMatchObject([
    {
      name: 'counter.update',
      count: 1,
      updates: [
        { path: 'count', value: 2 },
        { path: 'label', value: 'updated' }
      ]
    }
  ])
  expect(batches[0].pending).toBe(0)
})

it('tracks changing observer dependencies and supports removal', () => {
  const store = Restore.create(
    { side: 'left', left: 0, right: 0 },
    {
      setSide: (update, side) => update('side', () => side),
      increment: (update, side) => update(side, (value) => value + 1)
    }
  )
  const values = []
  const observer = store.observer(() => {
    const side = store('side')
    values.push(store(side))
  })

  store.increment('right')
  flush()
  expect(values).toEqual([0])

  store.increment('left')
  flush()
  expect(values).toEqual([0, 1])

  store.setSide('right')
  flush()
  expect(values).toEqual([0, 1, 1])

  store.increment('left')
  flush()
  expect(values).toEqual([0, 1, 1])

  store.increment('right')
  flush()
  expect(values).toEqual([0, 1, 1, 2])

  observer.remove()
  store.increment('right')
  flush()
  expect(values).toEqual([0, 1, 1, 2])
})

it('replaces state synchronously and allows watcher removal', () => {
  const store = Restore.create({ value: 1 })
  const feeds = []
  const feed = store.api.feed((state, actions) => feeds.push({ state, actions }))
  const observed = []
  store.observer(() => observed.push(store('value')))

  store.api.replaceState({ value: 2 })

  expect(store('value')).toBe(2)
  expect(observed).toEqual([1, 2])
  expect(feeds).toHaveLength(1)
  expect(feeds[0].actions).toMatchObject([
    { name: 'api.replaceState', internal: true, updates: [{ path: '*', value: { value: 2 } }] }
  ])

  feed.remove()
  store.api.replaceState({ value: 3 })
  expect(feeds).toHaveLength(1)
})

it('rejects reserved actions, invalid action trees, and non-object navigation', () => {
  expect(() => Restore.create({}, { replaceState: () => {} })).toThrow('reserved')
  expect(() => Restore.create({}, { invalid: 1 })).toThrow("'invalid' is a number")

  const store = Restore.create({ value: 1 })
  expect(() => store('value.deeper')).toThrow("cannot navigate past key 'value'")
})
