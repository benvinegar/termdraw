# @termdraw/app

`@termdraw/app` is the standalone termDRAW terminal app for developers who want editable diagrams, UI mocks, and text graphics without leaving the terminal.

## What it does

- Draw boxes, lines, paint strokes, and text as retained objects.
- Select, move, resize, and recolor objects after you draw them.
- Group related content inside boxes while everything stays aligned to terminal cells.
- Export plain text or fenced Markdown for docs, tickets, and prompts.

## Install

Requirements:

- [Bun](https://bun.sh) 1.3+
- A terminal with mouse support

```bash
npm install --global @termdraw/app
```

## Quick start

```bash
termdraw
```

Draw something, then press `Enter` or `Ctrl+S` to write the result to stdout.

## Usage

```bash
# save plain text directly to a file
termdraw --output diagram.txt

# export a fenced Markdown code block
termdraw --fenced > diagram.md

# render a JSONC diagram document without opening the editor
termdraw compile diagram.jsonc

# show CLI help
termdraw --help
```

termDRAW! outputs terminal text, not SVG or bitmap graphics.

## Compile diagrams from JSONC

`termdraw compile` renders a compact diagram document through the same retained drawing model used by the interactive editor. It accepts a file path, `-`, or stdin.

```jsonc
{
  "version": 1,
  "size": [24, 5],
  "objects": [
    { "type": "box", "rect": [0, 0, 8, 2], "style": "light", "text": "CLI" },
    { "type": "line", "from": [9, 1], "to": [14, 1], "style": "light", "marker": ">" },
    { "type": "text", "at": [16, 1], "text": "text" },
  ],
}
```

```text
┌───────┐
│ CLI   │─────> text
└───────┘
```

## OpenTUI package

If you want the embeddable OpenTUI components instead of the packaged app:

```bash
npm install @termdraw/opentui @opentui/core @opentui/react react
```

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
