import { createEip1193Provider } from './eip1193'
import { installEip6963Provider } from './eip6963'

export function installFrameProvider(target, rawProvider) {
  const provider = createEip1193Provider(rawProvider)
  target.ethereum = provider

  const discovery = installEip6963Provider(target, provider)
  return { provider, ...discovery }
}
