import link from '../../../resources/link'

const mutationResult = (result) => {
  if (!result || typeof result.success !== 'boolean') throw new Error('Contacts response was unavailable')
  if (!result.success && !result.canceled) throw new Error(result.error || 'Contact operation failed')
  return result
}

export const saveAddressBookEntry = async (request) =>
  mutationResult(await link.invoke('addressBook:save', request))
export const removeAddressBookEntry = async (address) =>
  mutationResult(await link.invoke('addressBook:remove', address))
export const importAddressBook = async () => mutationResult(await link.invoke('addressBook:import'))
export const exportAddressBook = async () => mutationResult(await link.invoke('addressBook:export'))
