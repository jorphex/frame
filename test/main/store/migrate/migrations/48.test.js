import migration from '../../../../../main/store/migrate/migrations/48'
import { createState } from '../setup'

it('adds persisted Yearn workflows without replacing the catalog cache', () => {
  const state = createState(47)
  state.main.yearn = { catalogCache: { existing: true } }

  const migrated = migration.migrate(state)

  expect(migration.version).toBe(48)
  expect(migrated.main.yearn).toEqual({ catalogCache: { existing: true }, workflows: {} })
})

it('preserves existing workflows and malformed input', () => {
  const state = createState(47)
  state.main.yearn = { catalogCache: null, workflows: { existing: true } }
  expect(migration.migrate(state).main.yearn.workflows).toEqual({ existing: true })
  expect(migration.migrate(null)).toBeNull()
})
