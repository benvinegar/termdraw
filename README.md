# termDRAW!

termDRAW! is an object-based terminal illustrator for diagrams, UI mocks, and terminal-native graphics.

## Why termDRAW!

- Make terminal-native diagrams without leaving your terminal.
- Keep editing as you think: drawn elements stay selectable, movable, and resizable.
- Group related content inside boxes so diagrams stay organized while you iterate.
- Export plain text or fenced Markdown for READMEs, docs, tickets, and agent prompts.

## Install

Requirements:

- [Bun](https://bun.sh)
- A terminal with mouse support

```bash
git clone https://github.com/benvinegar/termdraw.git
cd termdraw
bun install
```

## Quick start

Start the app:

```bash
bun run start
```

Draw something, then press `Enter` or `Ctrl+S` to save. By default, termDRAW! writes the result to stdout after the app exits.

Write directly to a file:

```bash
bun run start -- --output diagram.txt
```

Export as a fenced Markdown code block:

```bash
bun run start -- --fenced > diagram.md
```

Show CLI help:

```bash
bun run start -- --help
```

## Usage

termDRAW! behaves more like a small vector-style editor than a paint program. Lines, boxes, and text are retained objects, so you can keep rearranging the diagram after you draw it. Boxes can also act as frames for fully contained children.

Everything still snaps to terminal cells. termDRAW! outputs terminal art, not SVG or bitmap graphics.

Controls are shown in the app footer and tool palette.

## Output examples

Plain text to stdout:

```bash
bun run start > drawing.txt
```

Plain text to a file:

```bash
bun run start -- --output drawing.txt
```

Markdown fenced output:

```bash
bun run start -- --fenced > drawing.md
```

## Embedding

termDRAW! can also be mounted as an OpenTUI React component inside another terminal app.

```tsx
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { TermDraw } from "termdraw";

const renderer = await createCliRenderer({
  useMouse: true,
  enableMouseMovement: true,
  autoFocus: true,
  screenMode: "alternate-screen",
});

createRoot(renderer).render(
  <TermDraw
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

## Development

If you want to hack on termDRAW! locally:

```bash
bun run format
bun run lint
bun test
bun run typecheck
```

## Contributing

Contributions are welcome.

Before opening a PR:

- keep the change focused
- run `bun run format`, `bun run lint`, `bun test`, and `bun run typecheck`
- add or update tests when you change editor behavior
- open an issue first for larger UX or architecture changes

## License

MIT. See [LICENSE](LICENSE).

## Support

- Bugs and feature requests: [GitHub issues](https://github.com/benvinegar/termdraw/issues)
- Source: [github.com/benvinegar/termdraw](https://github.com/benvinegar/termdraw)
