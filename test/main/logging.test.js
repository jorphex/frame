describe('electron-log runtime contract', () => {
  test('uses the Node logger outside the Electron main process', () => {
    const log = require('electron-log')
    const nodeLog = require('electron-log/node')

    expect(log).toBe(nodeLog)
  })

  test.each(['electron-log', 'electron-log/main'])(
    '%s exposes the logging and transport APIs Frame configures',
    (moduleName) => {
      const log = require(moduleName)

      expect(log.info).toEqual(expect.any(Function))
      expect(log.error).toEqual(expect.any(Function))
      expect(log.transports.console).toEqual(expect.any(Function))
      expect(log.transports.file).toEqual(expect.any(Function))
      expect(log.transports.file.resolvePathFn).toEqual(expect.any(Function))
    }
  )
})
