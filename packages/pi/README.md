# @termdraw/pi

`@termdraw/pi` embeds termDRAW inside Pi using `opentui-island` so you can open the editor as a full-screen Pi overlay and insert drawings back into the current editor.

## Install

```bash
pi install npm:@termdraw/pi
```

For a project-local install:

```bash
pi install -l npm:@termdraw/pi
```

## Usage

Inside Pi:

```text
/termdraw
```

Use `Enter` or `Ctrl+S` to insert the drawing into Pi. In Select mode, press `C`, `X`, or `V` to copy, cut, or paste selected objects; `Ctrl+Shift+C/X/V` are aliases when the terminal forwards them. Use `Ctrl+C` or `Ctrl+Q` to close without inserting.

## Local development

From this repo:

```bash
bun install
pi install ./packages/pi
```

Or run the extension directly for a one-off test:

```bash
pi -e ./packages/pi/extensions/index.ts
```

## Smoke test

There is a tmux-based end-to-end smoke test that verifies:

- Pi starts with the extension loaded
- `/termdraw` opens the embedded overlay
- saving returns the drawing back into the Pi editor

Run it from the repo root:

```bash
bun run smoke:pi
```

Requirements:

- `pi` installed and on `PATH`
- `tmux` installed

Set `PI_TERMDRAW_SMOKE_KEEP_SESSION=1` if you want the tmux session left alive for debugging on exit.

## Notes

- Requires Bun 1.3+ on the machine running Pi.
- The embedded island currently loads from source (`islands/termdraw.island.tsx`) via Bun.
- For local development, `opentui-island@0.4.x` is used for save/cancel result bridging.
- `opentui-island` may still require `--legacy-peer-deps` in some npm setups depending on the Pi version in use.
- This package targets the terminal Pi experience first. GUI support will depend on Pi's extension UI surface.

## License

MIT. See [LICENSE](LICENSE).
