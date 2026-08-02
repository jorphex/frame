import React from 'react'
import Restore from 'react-restore'

import { act, render, screen } from '../../../componentSetup'

const createStore = () =>
  Restore.create(
    { value: 'initial' },
    {
      setValue: (update, value) => update('value', () => value)
    }
  )

it('provides the explicit root store to class constructors and nested components', () => {
  const store = createStore()

  class Child extends React.Component {
    constructor(props, context) {
      super(props, context)
      this.initialValue = context.store('value')
    }

    render() {
      return <div>{`${this.initialValue}:${this.store('value')}`}</div>
    }
  }

  const ConnectedChild = Restore.connect(Child)
  const Root = Restore.connect(() => <ConnectedChild />, store)
  render(<Root />)

  expect(screen.getByText('initial:initial')).toBeTruthy()

  act(() => {
    store.setValue('updated')
    jest.runAllTimers()
  })

  expect(screen.getByText('initial:updated')).toBeTruthy()
})

it('provides the store to connected function components', () => {
  const store = createStore()
  const Child = (props, context) => <div>{context.store('value')}</div>
  const ConnectedChild = Restore.connect(Child)
  const Root = Restore.connect(() => <ConnectedChild />, store)

  render(<Root />)

  expect(screen.getByText('initial')).toBeTruthy()
})

it('removes component observers on unmount', () => {
  const store = createStore()
  const remove = jest.spyOn(store.api, 'remove')
  const Child = Restore.connect(() => <div>{'child'}</div>)
  const Root = Restore.connect(() => <Child />, store)

  const { unmount } = render(<Root />)
  unmount()

  expect(remove).toHaveBeenCalledTimes(2)
})
