import sessions from '../../../../../main/dapps/server/sessions'

it('does not revoke a valid session when an unknown session is removed', () => {
  const app = 'session-test.frame.eth'
  sessions.add(app, 'first')
  sessions.add(app, 'second')

  sessions.remove(app, 'missing')

  expect(sessions.verify(app, 'first')).toBe(true)
  expect(sessions.verify(app, 'second')).toBe(true)

  sessions.remove(app, 'first')
  sessions.remove(app, 'second')
})

it('ignores removal from an unknown app', () => {
  expect(() => sessions.remove('missing.frame.eth', 'missing')).not.toThrow()
})
