# Migration Fixtures

These fixtures are synthetic persisted-state inputs. Never copy a real Frame
profile, signer file, account history, RPC credential, or device identifier into
this directory.

Each fixture declares its source migration version and is validated before use.
The validation rejects common plaintext/encrypted signer material, mnemonic
phrases, credential-bearing URLs, secret-shaped keys, and version mismatches. It
is a guardrail, not a substitute for reviewing fixture diffs.

When adding a migration, update or add the smallest representative fixture that
exercises it. Tests load fixtures through the application state initializer from
a temporary mode-`0600` persistence envelope, assert no schema diagnostics, and
verify that the migrated state remains stable after persistence and reload.
