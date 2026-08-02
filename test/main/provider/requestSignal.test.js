import {
  bindRequestSignal,
  getRequestSignal,
  inheritRequestSignal
} from '../../../main/provider/requestSignal'

it('binds a request signal to the exact callback', () => {
  const controller = new AbortController()
  const callback = jest.fn()
  const other = jest.fn()

  expect(bindRequestSignal(callback, controller.signal)).toBe(callback)
  expect(getRequestSignal(callback)).toBe(controller.signal)
  expect(getRequestSignal(other)).toBeUndefined()
})

it('inherits a signal without sharing it with unrelated callbacks', () => {
  const controller = new AbortController()
  const source = bindRequestSignal(jest.fn(), controller.signal)
  const target = jest.fn()

  expect(inheritRequestSignal(source, target)).toBe(target)
  expect(getRequestSignal(target)).toBe(controller.signal)
})

it('leaves callbacks unbound when no transport signal exists', () => {
  const source = jest.fn()
  const target = jest.fn()

  inheritRequestSignal(source, target)

  expect(getRequestSignal(target)).toBeUndefined()
})
