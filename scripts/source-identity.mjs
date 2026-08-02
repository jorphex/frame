import { execFileSync } from 'node:child_process'

export function readWorkingSourceIdentity() {
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    encoding: 'utf8'
  })

  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    timestamp: execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      encoding: 'utf8'
    }).trim(),
    dirty: status.length > 0,
    changes: status ? status.trim().split('\n').slice(0, 32) : []
  }
}

export function readSourceIdentity() {
  const { dirty, changes, ...identity } = readWorkingSourceIdentity()
  if (dirty) {
    throw new Error(`Release artifacts require a clean source worktree: ${JSON.stringify(changes)}`)
  }

  return identity
}
