# Linux Release Qualification

This procedure is the minimum manual gate for a paired Frame desktop and Frame
Companion release candidate. It supplements automated tests; it is not a
security audit. Use disposable accounts and Sepolia only. Never paste a seed,
private key, PIN, passphrase, pairing response, full account address, or
transaction signature into a report or issue.

## Candidate Record

Record these values before testing:

| Item                                     | Result |
| ---------------------------------------- | ------ |
| Desktop version and commit               |        |
| Companion version and commit             |        |
| Companion minimum desktop commit         |        |
| AppImage SHA-256                         |        |
| deb SHA-256                              |        |
| Chrome ZIP SHA-256                       |        |
| Firefox ZIP SHA-256                      |        |
| OS, kernel, Chrome, and Firefox versions |        |

Verify both `SHA256SUMS` files from their artifact directories. Confirm the
companion compatibility JSON names the candidate desktop branch and a commit
that is an ancestor of the desktop candidate.

## Safety Setup

1. Back up the current Frame profile while Frame is closed. Keep the backup
   offline from this test and verify that it is readable before proceeding.
2. Close every Frame process. Trezor Suite is not required; close it and any
   other hardware-wallet application so only Frame owns the USB transport.
3. Use newly generated disposable software accounts and hardware-wallet test
   accounts with no valuable assets. Fund only enough Sepolia ETH for the test.
4. Do not run the AppImage and installed deb simultaneously. A second process
   invalidates single-instance, local-port, and signer results.
5. Keep the desktop and browser logs available for diagnosis, but inspect them
   for secrets before sharing any excerpt.

## Package And Profile

1. Launch the AppImage with a new mode-`0700` temporary user-data directory:

   ```bash
   profile=$(mktemp -d)
   chmod 700 "$profile"
   ./Frame-<version>.AppImage --user-data-dir="$profile"
   ```

2. Confirm startup, tray/dashboard placement, settings persistence after a
   restart, and clean shutdown. Confirm no unexpected update prompt appears.
3. Confirm launching a second candidate exits without corrupting state or
   taking over ports `1248` or `8421`.
4. With Frame closed, copy a backed-up prior-fork profile to a separate temporary
   directory and launch the AppImage against that copy. Do not unlock a valuable
   signer. Confirm accounts, account names, custom chains/RPCs, permissions,
   tokens, and settings survive migration and a second restart without changing
   again.
5. Install the deb as an upgrade over the prior fork package. Confirm package
   version, desktop launcher, startup, shutdown, and preserved state. Restore
   the backup and stop qualification if any profile field is unexpectedly lost.

Delete temporary profiles only after the result has been recorded. Profile
migration failures are release blockers even when fresh-profile tests pass.

## Browser Pairing

Use clean disposable Chrome and Firefox profiles. Extract the browser-specific
archives; never interchange them. Load Chrome with **Load unpacked** and Firefox
through `about:debugging` with **Load Temporary Add-on**.

From the companion repository, run:

```bash
npm run qualify:serve
```

Open `http://127.0.0.1:8765/` in each browser. The page is local, stores nothing,
and makes no network request of its own. It must discover an EIP-6963 provider
named Frame with RDNS `sh.frame`. `window.ethereum` may remain owned by another
installed provider; Frame must still be discoverable through EIP-6963.

For **both Chrome and Firefox**:

1. Compare the same six-digit initial pairing code in Frame and Companion, then
   approve it in Frame. A page session must not create a separate pairing prompt.
2. Reject one account connection, then approve one. Confirm only the selected
   disposable account is returned.
3. Change the selected account and Sepolia chain in Frame. Confirm the page logs
   the corresponding `accountsChanged` and `chainChanged` events once.
4. Open the page in two tabs. Submit a request in one tab and confirm the other
   tab receives neither its approval result nor its events.
5. Close/reopen the tab and restart the browser. Confirm the known companion
   reconnects without another pairing approval.
6. Revoke the browser credential in Frame and confirm requests stop. Pair again,
   then reset Companion and confirm the prior credential no longer works.
7. Confirm malformed/rejected requests leave no permanent spinner, stale Frame
   approval, or reconnect loop.

## Signer Matrix

Run each row at least once through one qualified browser. Run the private-key
row through Chrome and the seed row through Firefox so both complete browser
paths include signing. In the local qualification page, reject each signing
request once before approving it.

| Signer                                    | Add/discover and verify address | Personal message | EIP-712 v4 | Sepolia zero-value self-transfer | Reject/cancel | Lock or reconnect |
| ----------------------------------------- | ------------------------------- | ---------------- | ---------- | -------------------------------- | ------------- | ----------------- |
| Trezor Safe 7 over USB                    |                                 |                  |            |                                  |               |                   |
| Trezor Model One over USB                 |                                 |                  |            |                                  |               |                   |
| Disposable imported private key           |                                 |                  |            |                                  |               |                   |
| Disposable generated/imported seed phrase |                                 |                  |            |                                  |               |                   |

For hardware signers, record model and firmware version, compare the complete
address on-device, and compare chain, recipient, value, calldata, and fees before
approving the transaction. Safe 7 pairing-code entry must complete and reconnect
without a reload loop. For Model One, record an explicit supported or unsupported
result when the device firmware cannot display a request type; silent blind
signing is a failure.

For software signers, verify wrong-password rejection, unlock, relock, restart,
and removal using only disposable secrets. Confirm no plaintext seed, private
key, password, message, typed data, transaction payload, or pairing response is
present in production logs.

The transaction action is disabled unless Frame reports Sepolia chain
`0xaa36a7` and the disposable-account confirmation is checked. Confirm the
returned hash on a Sepolia explorer without placing the full hash in a public
qualification report.

## Pass Criteria

A candidate passes only when every required cell has an explicit result, both
browser pairing flows pass, AppImage/deb/profile checks pass, no secret appears
in logs, and every unexpected behavior has either been fixed and retested or is
documented as an intentional unsupported capability. Crashes, cross-tab data,
wrong-device displays, unexplained signer reloads, stale approvals, silent blind
signing, profile loss, or an update prompt targeting an unrelated release are
release blockers.

Report only versions, checksums, pass/fail status, sanitized error text, and
reproduction steps. Keep account addresses, transaction hashes, signatures,
device identifiers, profile contents, and all secrets private.
