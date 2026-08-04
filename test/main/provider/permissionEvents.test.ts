import { applyPermissionAction } from '../../../main/provider/permissionEvents'

const selected = '0x1111111111111111111111111111111111111111'

it('refreshes account subscriptions after changing the selected account permission', () => {
  let applied = false
  const accounts = {
    getSelectedAddresses: jest.fn(() => {
      expect(applied).toBe(true)
      return [selected]
    })
  }
  const provider = { accountsChanged: jest.fn() }

  applyPermissionAction(
    selected.toUpperCase(),
    () => {
      applied = true
    },
    accounts,
    provider
  )

  expect(provider.accountsChanged).toHaveBeenCalledWith([selected])
})

it('does not emit account events for a different account permission', () => {
  const accounts = { getSelectedAddresses: jest.fn(() => [selected]) }
  const provider = { accountsChanged: jest.fn() }

  applyPermissionAction('0x2222222222222222222222222222222222222222', jest.fn(), accounts, provider)

  expect(provider.accountsChanged).not.toHaveBeenCalled()
})
