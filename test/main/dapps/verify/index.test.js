import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { dappPathExists } from '../../../../main/dapps/verify'

let mockUserData

jest.mock('electron', () => ({ app: { getPath: () => mockUserData } }))

const dappId = '0xdapp'

function dappPath() {
  return path.join(mockUserData, 'DappCache', dappId)
}

beforeAll(async () => {
  mockUserData = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-dapp-path-'))
})

beforeEach(async () => {
  await fs.rm(path.join(mockUserData, 'DappCache'), { recursive: true, force: true })
})

afterAll(async () => {
  await fs.rm(mockUserData, { recursive: true, force: true })
})

test('determines that a dapp exists in the dapp cache', async () => {
  await fs.mkdir(dappPath(), { recursive: true })

  await expect(dappPathExists(dappId)).resolves.toBe(true)
})

test('determines that a dapp does not exist in the dapp cache', async () => {
  await expect(dappPathExists(dappId)).resolves.toBe(false)
})
