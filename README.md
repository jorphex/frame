## This fork adds Trezor Safe 7 support to Frame. Use at your own risk.

<h2 align="center">
  <br>
  <img src="/asset/png/FrameLogo512.png?raw=true" alt="Frame" width="150" />
  <br>
  <br>
  F R A M E
  <br>
  <br>
</h2>
<h3 align="center">System-wide Web3 for macOS, Windows and Linux :tada:</h3>
<br>
<h5 align="center">
  <a href="#features">Features</a> ⁃
  <a href="#installation">Installation</a> ⁃
  <a href="#usage">Usage</a> ⁃
  <a href="#security-and-support">Security</a> ⁃
  <a href="#related">Related</a>
</h5>
<br>

<img src="/asset/png/FrameExample0-6-3.png?raw=true" />

Frame is a web3 platform that creates a secure system-wide interface to your chains and accounts. Now any browser, command-line, or native application has the ability to access web3.

### Features

- **First-class Hardware Signer Support**
  - Use your GridPlus, Ledger and Trezor accounts with any dapp!
- **Extensive Software Signer Support**
  - Use a mnemonic phrase, keystore.json or standalone private keys to create and backup accounts!
- **Permissions**
  - You'll always have full control of which dapps have permission to access Frame and can monitor with full transparency what requests are being made to the network.
- **Omnichain Routing**
  - With Frame's Omnichain routing dapps can seamlessly use multiple chains at the same time, enabling truly multichain experiences.
- **Transaction Decoding**
  - By utilizing verified contract ABIs, transaction calldata can be decoded into concise and informative summaries, allowing you to sign transactions with confidence.
- **Set your own connections to Ethereum and IPFS**
  - Never be locked into using a centralized gateway
- **Menu Bar Support**
  - Frame stays out of the way and sits quietly in your menu bar until needed
- **Cross Platform**
  - MacOS, Windows and Linux!

### Talks

- [Frame at Aracon](https://www.youtube.com/watch?v=wlZWLiy2GD0)

### Installation

#### Downloads

- [Fork Releases](https://github.com/jorphex/frame/releases)

#### Arch Linux

If you use an arch-based distro, you can use an AUR Helper like [yay](https://github.com/Jguer/yay) to install Frame by running `yay -S frame-eth` or for the development version: `yay -S frame-eth-dev`.

#### Run Source

**On Ubuntu:** Run `sudo apt-get install build-essential libudev-dev`.

```bash
# Clone
› git clone https://github.com/jorphex/frame
› cd frame

# Use the pinned Node version
› nvm install
› nvm use

# Use the pinned npm resolver
› npm install --global npm@11.12.0

# Install
› npm run setup

# Run
› npm run prod
```

#### IPFS Connection

Frame reads decentralized dapp and token content through a Kubo RPC endpoint.
Set `FRAME_IPFS_API_URL` to use your own endpoint (for example,
`http://127.0.0.1:5001`) and set `NEBULA_AUTH_TOKEN` when it requires HTTP Basic
authentication. The existing hosted endpoint remains the default.

Archived dapp downloads are limited to 256 MiB before extraction and are only
activated after their complete UnixFS directory CID matches the ENS manifest.

Kubo RPC is an administrative interface. Keep a local endpoint bound to
localhost or place a remote endpoint behind TLS, authentication, and a restricted
proxy; do not expose it directly to the public internet. See the [Kubo RPC
security guidance](https://docs.ipfs.tech/reference/kubo/rpc/).

#### Build

```bash
› npm run bundle # Create bundle
› npm run build # Build Frame for current platform
```

### Usage

#### Connect to Frame natively

Frame exposes system-wide JSON-RPC endpoints `ws://127.0.0.1:1248` and `http://127.0.0.1:1248` that you can connect to from any app. We recommend using [eth-provider](https://github.com/floating/eth-provider) to create a connection `const provider = ethProvider('frame')` as `eth-provider` will handle any connection edge cases across browsers and environments

### Frame's injected provider

Frame also has a browser extension for injecting a Frame-connected [EIP-1193](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md) provider into web apps as `window.ethereum`. This can be used to inject a connection when an app does not provide the option to connect to Frame natively.

### Security and Support

This community fork has not received an independent security audit. Before using
it, review the [security policy](SECURITY.md), [current threat
model](THREAT_MODEL.md), and [signer/platform support
matrix](HARDWARE_SUPPORT.md). The implemented standards and local provider
surface are documented in [supported EIPs](SUPPORTED_EIPS.md) and [RPC
compatibility](RPC_COMPATIBILITY.md). Maintainers should follow the documented
[release procedure](RELEASE.md).

### Related

- [Frame Chat](https://discord.gg/UH7NGqY) - Feel free to drop in and ask questions!
- [Frame Browser Extension](https://github.com/frame-labs/frame-extension) - Use Frame with any web dapp
- [eth-provider](https://github.com/floating/eth-provider) - A universal Ethereum provider
- [Restore](https://github.com/floating/restore) - A predictable and observable state container for React apps

<h2>
  <h5 align="center">
    <br>
    <a href="https://frame.sh">Website</a> ⁃
    <a href="https://medium.com/@framehq">Blog</a> ⁃
    <a href="https://twitter.com/0xFrame">Twitter</a> ⁃
    <a href="https://discord.gg/UH7NGqY">Chat</a>
  </h5>
</h2>
