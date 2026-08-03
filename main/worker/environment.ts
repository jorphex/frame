export function nodeWorkerEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...overrides,
    ELECTRON_RUN_AS_NODE: '1'
  }
}
