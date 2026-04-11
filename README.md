# termDRAW!

termDRAW! is a terminal drawing editor for developers who want editable diagrams, UI mocks, and text graphics without leaving the terminal.

## What it does

- Draw boxes, lines, paint strokes, and text as retained objects.
- Select, move, resize, and recolor objects after you draw them.
- Group related content inside boxes while everything stays aligned to terminal cells.
- Export plain text or fenced Markdown for READMEs, docs, tickets, and prompts.
- Embed the editor in OpenTUI apps with React components.

## Install

Requirements:

- [Bun](https://bun.sh) 1.3+
- A terminal with mouse support

```bash
npm install --global @benvinegar/termdraw
```

## Quick start

```bash
termdraw
```

Draw something, then press `Enter` or `Ctrl+S` to write the result to stdout.

## Usage

termDRAW! behaves more like a small vector-style editor than a paint program. Lines, boxes, paint strokes, and text are retained objects, so you can keep rearranging the diagram after you draw it. Boxes can also act as frames for fully contained children.

Everything still snaps to terminal cells. termDRAW! outputs terminal art, not SVG or bitmap graphics.

Controls are shown in the app footer and tool palette. Tool hotkeys follow common graphics-editor muscle memory: `B` Brush, `A` Select, `U` Box, `P` Line, `T` Text. The Line tool supports Smooth, Single, and Double line stencils.

## Output examples

```bash
# save plain text directly to a file
termdraw --output diagram.txt

# export a fenced Markdown code block
termdraw --fenced > diagram.md

# show CLI help
termdraw --help
```

## Embed in an OpenTUI app

Install the package and peer dependencies:

```bash
npm install @benvinegar/termdraw @opentui/core @opentui/react react
```

```tsx
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { TermDrawApp } from "@benvinegar/termdraw";

const renderer = await createCliRenderer({
  useMouse: true,
  enableMouseMovement: true,
  autoFocus: true,
  screenMode: "alternate-screen",
});

createRoot(renderer).render(
  <TermDrawApp
    width="100%"
    height="100%"
    autoFocus
    onSave={(art) => {
      console.log(art);
    }}
    onCancel={() => {
      renderer.destroy();
    }}
  />,
);
```

Also exported:

- `TermDrawApp` — full app chrome with header, palette, footer, and splash
- `TermDrawEditor` — bare editor surface without surrounding chrome
- `TermDraw` — alias for `TermDrawApp`

## Docs

- CLI reference: run `termdraw --help`
- React exports: [`packages/tui/src/index.ts`](https://github.com/benvinegar/termdraw/blob/main/packages/tui/src/index.ts)
- Pi embedding example: [`packages/pi`](https://github.com/benvinegar/termdraw/tree/main/packages/pi)

## Contributing

Contributions are welcome.

Before opening a PR:

- keep the change focused
- run `bun run check`
- add or update tests when editor behavior changes
- open an issue first for larger UX or API changes

## Security

Please report security issues privately through GitHub Security Advisories:

- <https://github.com/benvinegar/termdraw/security/advisories/new>

## License

MIT. See [LICENSE](LICENSE).
