interface AccountSelection {
  getSelectedAddresses(): string[]
}

interface AccountSubscriptionProvider {
  accountsChanged(addresses: string[], originIds?: readonly string[]): void
}

export function applyPermissionAction(
  address: string,
  action: () => void,
  accounts: AccountSelection,
  provider: AccountSubscriptionProvider,
  affectedOriginIds?: readonly string[]
) {
  action()

  const selected = accounts.getSelectedAddresses()
  if (selected.some((candidate) => candidate.toLowerCase() === address.toLowerCase())) {
    provider.accountsChanged(selected, affectedOriginIds)
  }
}
