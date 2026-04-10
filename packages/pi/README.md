# pi-termdraw

`pi-termdraw` embeds [termDRAW!](https://github.com/benvinegar/termdraw) inside Pi using [`opentui-island`](https://github.com/benvinegar/opentui-island).

In this repo, it currently points at the sibling `packages/tui` `@benvinegar/termdraw` package via a file dependency so the prototype uses the current working tree version of termDRAW.

## Current status

This package is an **early embedding prototype**.

What works today:

- opens termDRAW in a full-screen Pi overlay
- keyboard and mouse input are forwarded into the Bun/OpenTUI surface
- save/export now comes back into the Pi editor via the `opentui-island` result bridge
- termDRAW runs inside terminal Pi without moving the main Pi process off Node

What is still intentionally not solved yet:

- `pi-gui` support if the client is running through Pi RPC-only extension UI
- richer host/island commands beyond the save/cancel bridge

Use `Enter` or `Ctrl+S` to insert the drawing into Pi. Use `Ctrl+Q` to close without inserting.

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

## Smoke test

There is a tmux-based end-to-end smoke test that verifies:

- Pi starts with the extension loaded
- `/termdraw` opens the embedded overlay
- text can be entered into the island
- saving returns the drawing back into the Pi editor

Run it from the repo root:

```bash
bun run smoke:pi
```

Requirements:

- `pi` installed and on `PATH`
- `tmux` installed

Set `PI_TERMDRAW_SMOKE_KEEP_SESSION=1` if you want the tmux session left alive for debugging on exit.

## Usage

Inside Pi:

```text
/termdraw
```

## Notes

- Requires Bun 1.3+ on the machine running Pi.
- The embedded island currently loads from source (`islands/termdraw.island.tsx`) via Bun.
- For local development, `opentui-island@0.3.0` is used for save/cancel result bridging. Its optional `@mariozechner/pi-tui` peer range is still older than current Pi packages, so `npm` users may still need `--legacy-peer-deps` in some setups.
- Before publishing `pi-termdraw`, switch the local `file:../tui` dependency back to a real semver release of `@benvinegar/termdraw`.
- This package targets the terminal Pi experience first. GUI support will depend on Pi's extension UI surface.
