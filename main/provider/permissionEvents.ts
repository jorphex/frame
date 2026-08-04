interface AccountSelection {
  getSelectedAddresses(): string[]
}

interface AccountSubscriptionProvider {
  accountsChanged(addresses: string[]): void
}

export function applyPermissionAction(
  address: string,
  action: () => void,
  accounts: AccountSelection,
  provider: AccountSubscriptionProvider
) {
  action()

  const selected = accounts.getSelectedAddresses()
  if (selected.some((candidate) => candidate.toLowerCase() === address.toLowerCase())) {
    provider.accountsChanged(selected)
  }
}
