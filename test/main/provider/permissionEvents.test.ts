import { applyPermissionAction } from '../../../main/provider/permissionEvents'

const selected = '0x1111111111111111111111111111111111111111'

it('refreshes only affected origin subscriptions after changing the selected account permission', () => {
  let applied = false
  const accounts = {
    getSelectedAddresses: jest.fn(() => {
      expect(applied).toBe(true)
      return [selected]
    })
  }
  const provider = { accountsChanged: jest.fn() }

  const affectedOrigins = ['origin-id']
  applyPermissionAction(
    selected.toUpperCase(),
    () => {
      applied = true
    },
    accounts,
    provider,
    affectedOrigins
  )

  expect(provider.accountsChanged).toHaveBeenCalledWith([selected], affectedOrigins)
})

it('refreshes every origin after an account-wide permission action', () => {
  const accounts = { getSelectedAddresses: jest.fn(() => [selected]) }
  const provider = { accountsChanged: jest.fn() }

  applyPermissionAction(selected, jest.fn(), accounts, provider)

  expect(provider.accountsChanged).toHaveBeenCalledWith([selected], undefined)
})

it('does not emit account events for a different account permission', () => {
  const accounts = { getSelectedAddresses: jest.fn(() => [selected]) }
  const provider = { accountsChanged: jest.fn() }

  applyPermissionAction('0x2222222222222222222222222222222222222222', jest.fn(), accounts, provider)

  expect(provider.accountsChanged).not.toHaveBeenCalled()
})
