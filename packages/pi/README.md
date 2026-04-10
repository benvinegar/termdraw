# pi-termdraw

`pi-termdraw` embeds [termDRAW!](https://github.com/benvinegar/termdraw) inside Pi using [`opentui-island`](https://github.com/benvinegar/opentui-island).

In this repo, it currently points at the sibling `packages/tui` `@benvinegar/termdraw` package via a file dependency so the prototype uses the current working tree version of termDRAW.

## Current status

This package is an **early embedding prototype**.

What works today:

- opens termDRAW in a full-screen Pi overlay
- keyboard and mouse input are forwarded into the Bun/OpenTUI surface
- termDRAW runs inside terminal Pi without moving the main Pi process off Node

What is intentionally not wired yet:

- save/export back into Pi's editor
- structured save/cancel result passing from the Bun sidecar back to the Node host
- `pi-gui` support if the client is running through Pi RPC-only extension UI

For now, use `Ctrl+Q` to close the overlay. `Enter` and `Ctrl+S` are intercepted and show a placeholder status because the result bridge is still pending.

## Install locally

From this repo:

```bash
bun install
```

Then install into Pi from the package path:

```bash
pi install ./packages/pi
```

Or run directly for a one-off test:

```bash
pi -e ./packages/pi/extensions/index.ts
```

## Usage

Inside Pi:

```text
/termdraw
```

## Notes

- Requires Bun 1.3+ on the machine running Pi.
- The embedded island currently loads from source (`islands/termdraw.island.tsx`) via Bun.
- For local development, `--legacy-peer-deps` is currently needed because published `opentui-island@0.2.0` still declares an older optional `@mariozechner/pi-tui` peer range than current Pi packages.
- Before publishing `pi-termdraw`, switch the local `file:../tui` dependency back to a real semver release of `@benvinegar/termdraw`.
- This package targets the terminal Pi experience first. GUI support will depend on Pi's extension UI surface.
