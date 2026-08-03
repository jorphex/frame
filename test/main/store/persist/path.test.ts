import { isPersistedStatePath } from '../../../../main/store/persist/path'

test('persists only wallet state paths', () => {
  expect(isPersistedStatePath('main')).toBe(true)
  expect(isPersistedStatePath('main.colorway')).toBe(true)
  expect(isPersistedStatePath('view.notify')).toBe(false)
  expect(isPersistedStatePath('view.notifyData')).toBe(false)
  expect(isPersistedStatePath('mainland')).toBe(false)
})
