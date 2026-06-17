/* global module */

const TrezorConnect = {
  init: jest.fn(async () => undefined),
  dispose: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  removeAllListeners: jest.fn(),
  uiResponse: jest.fn(),
  getFeatures: jest.fn(),
  getAccountInfo: jest.fn(),
  getPublicKey: jest.fn(),
  ethereumGetAddress: jest.fn(),
  ethereumSignMessage: jest.fn(),
  ethereumSignTypedData: jest.fn(),
  ethereumSignTransaction: jest.fn()
}

module.exports = {
  __esModule: true,
  default: TrezorConnect,
  DEVICE_EVENT: 'DEVICE_EVENT',
  UI_EVENT: 'UI_EVENT',
  DEVICE: {
    CHANGED: 'device-changed',
    CONNECT_UNACQUIRED: 'device-connect_unacquired',
    CONNECT: 'device-connect',
    DISCONNECT: 'device-disconnect'
  },
  UI: {
    REQUEST_PIN: 'ui-request_pin',
    REQUEST_PASSPHRASE: 'ui-request_passphrase',
    REQUEST_THP_PAIRING: 'ui-request_thp_pairing',
    RECEIVE_PIN: 'ui-receive_pin',
    RECEIVE_PASSPHRASE: 'ui-receive_passphrase',
    RECEIVE_THP_PAIRING_TAG: 'ui-receive_thp_pairing_tag'
  }
}
