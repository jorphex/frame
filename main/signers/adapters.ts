import { EventEmitter } from 'stream'
import Signer from './Signer'

export class SignerAdapter extends EventEmitter {
  adapterType: string

  constructor(type: string) {
    super()

    this.adapterType = type
  }

  open() {}
  close(): void | Promise<void> {}
  remove(signer: Signer) {}
  reload(signer: Signer) {}
}
