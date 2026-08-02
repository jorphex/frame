import { requireStoreActionFrom } from '../../../main/store/actionFrom'

it('preserves the store receiver when invoking an action', () => {
  const store = jest.fn()
  store.update = jest.fn(function () {
    return this
  })

  expect(requireStoreActionFrom(store, 'update')()).toBe(store)
  expect(store.update).toHaveBeenCalledTimes(1)
})

it('rejects an unavailable store action', () => {
  expect(() => requireStoreActionFrom(jest.fn(), 'missing')).toThrow(/missing is unavailable/)
})
