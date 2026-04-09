# tui-draw

An OpenTUI + Bun + TypeScript clone of Ben Vinegar's Pi `/draw` extension.

It opens a full-screen ASCII drawing canvas with mouse support, three modes, undo/redo, and markdown-friendly export.

## Features

- `line` mode for straight-line drawing
- `box` mode with auto-connected box drawing glyphs
- `text` mode for typing directly onto the canvas
- mouse drag to draw
- right-drag to erase lines and boxes
- undo / redo / clear
- save to stdout or a file

## Requirements

- [Bun](https://bun.sh)
- a terminal with mouse support

## Install

```bash
bun install
```

## Run

```bash
bun run index.ts
```

Or with scripts:

```bash
bun run start
```

## Controls

- `Ctrl+T` or `Tab`: cycle `box` / `line` / `text`
- `Ctrl+Z` / `Ctrl+Y`: undo / redo
- `Ctrl+X`: clear
- `[` / `]`: cycle brush in line mode
- `Arrow keys`: move cursor
- `Space`: stamp brush in line mode
- `Backspace` / `Delete`: erase current cell
- `Enter` or `Ctrl+S`: save
- `Esc` or `Ctrl+C`: cancel
- mouse left-drag: draw
- mouse right-drag: erase in line/box mode
- mouse right-click: erase in text mode
- mouse wheel: cycle brush in line mode

## Output

Plain text to stdout:

```bash
bun run index.ts > drawing.txt
```

Markdown fenced block:

```bash
bun run index.ts -- --fenced > drawing.md
```

Write directly to a file:

```bash
bun run index.ts -- --output diagram.txt
```

## Development

```bash
bun test
bun run typecheck
```
