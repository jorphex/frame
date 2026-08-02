import assert from 'node:assert/strict'

export const buildIdentitySchemaVersion = 1

export function createBuildIdentity(source, packageVersion) {
  return {
    schemaVersion: buildIdentitySchemaVersion,
    packageVersion,
    sourceCommit: source.commit,
    sourceTimestamp: source.timestamp,
    sourceDirty: source.dirty
  }
}

export function assertReleaseBuildIdentity(actual, source, packageVersion) {
  assert.deepEqual(
    actual,
    createBuildIdentity({ ...source, dirty: false }, packageVersion),
    'Compiled application identity does not match the clean release source; compile again'
  )
}
