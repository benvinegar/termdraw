# tui-draw

An OpenTUI + Bun + TypeScript clone of Ben Vinegar's Pi `/draw` extension.

It opens a full-screen ASCII drawing canvas with mouse support, object-based drawing, undo/redo, and markdown-friendly export.

## Features

- `select` mode for selecting and editing existing objects
- `line` mode for straight-line drawing
- `box` mode with auto-connected box drawing glyphs
- `text` mode for typing directly onto the canvas
- drawn lines, boxes, and text persist as movable objects
- selected boxes show resize handles on their corners
- selected lines show draggable endpoint handles
- drag existing objects in any mode to move them without switching tools
- right-drag to delete objects under the pointer
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

- `Ctrl+T` or `Tab`: cycle `select` / `box` / `line` / `text`
- `Ctrl+Z` / `Ctrl+Y`: undo / redo
- `Ctrl+X`: clear
- `[` / `]`: cycle brush in line mode
- `Arrow keys`: move cursor, or nudge the selected object in `select` mode
- `Space`: stamp brush in line mode
- `Delete`: remove the selected object
- `Enter` or `Ctrl+S`: save
- `Esc` or `Ctrl+C`: cancel
- mouse left-drag in `select` mode: move the selected object
- mouse left-drag on a selected box corner in `select` mode: resize the box
- mouse left-drag on a selected line endpoint in `select` mode: adjust that endpoint
- mouse left-drag on an existing object in draw modes: move it without leaving the current tool
- mouse left-drag on empty space in draw modes: create a new object
- mouse right-drag: delete objects under the pointer
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
