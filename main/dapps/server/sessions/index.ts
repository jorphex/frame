const sessions: Record<string, string[]> = {}
const timers: Record<string, NodeJS.Timeout> = {}

export default {
  add: (app: string, session: string) => {
    app = app.replaceAll('.', '-')
    const appSessions = sessions[app] || []
    appSessions.push(session)
    sessions[app] = appSessions
  },
  verify: (app: string, session: string) => {
    app = app.replaceAll('.', '-')
    clearTimeout(timers[session])
    return sessions[app]?.includes(session) || false
  },
  remove: (app: string, session: string) => {
    app = app.replaceAll('.', '-')
    const appSessions = sessions[app]
    if (!appSessions) return
    const index = appSessions.indexOf(session)
    if (index < 0) return
    appSessions.splice(index, 1)
    if (appSessions.length === 0) delete sessions[app]
  }
}
