import path from 'node:path'
import { isPathInsideRoot } from '../../../main/security/fileAccess'

const root = path.resolve('/opt/Frame/resources/app.asar')

it('accepts only descendants of the packaged application root', () => {
  expect(isPathInsideRoot(root, path.join(root, 'bundle', 'tray.html'))).toBe(true)
  expect(isPathInsideRoot(root, path.join(root, 'compiled', 'main', 'index.js'))).toBe(true)
})

it('rejects the root, traversal, and sibling prefix paths', () => {
  expect(isPathInsideRoot(root, root)).toBe(false)
  expect(isPathInsideRoot(root, path.join(root, '..', 'app.asar.unpacked', 'secret'))).toBe(false)
  expect(isPathInsideRoot(root, `${root}.unpacked/secret`)).toBe(false)
  expect(isPathInsideRoot(root, path.join(root, '..', 'outside'))).toBe(false)
})
