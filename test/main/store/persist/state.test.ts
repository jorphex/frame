import { pruneTransientPersistedState } from '../../../../main/store/persist/state'

test('removes ignored transient snapshots while retaining versioned wallet state', () => {
  const main = { accounts: {}, extensionCredentials: {} }
  const persisted = {
    unrelated: { retained: true },
    __: {
      44: { main: { accounts: { legacy: true } } },
      45: {
        main,
        tray: { open: true },
        view: { notify: 'extensionConnect', notifyData: { pairingCode: 'not-retained' } },
        windows: { tray: { showing: true } }
      },
      malformed: { view: { retained: 'without a main payload' } }
    }
  }

  expect(pruneTransientPersistedState(persisted)).toEqual({
    unrelated: persisted.unrelated,
    __: {
      44: persisted.__[44],
      45: { main },
      malformed: persisted.__.malformed
    }
  })
})

test('does not rewrite state without transient version siblings', () => {
  const persisted = { __: { 45: { main: { accounts: {} } } } }
  expect(pruneTransientPersistedState(persisted)).toBe(persisted)
})
