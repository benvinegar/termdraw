# @termdraw/app

`@termdraw/app` is the standalone termDRAW terminal app for developers who want editable diagrams, UI mocks, and text graphics without leaving the terminal.

## What it does

- Draw boxes, lines, paint strokes, and text as retained objects.
- Marquee-select, move, copy, cut, paste, resize, and recolor objects after you draw them.
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

Draw something, then press `Enter` or `Ctrl+S` to write the result to stdout. In Select mode, drag a marquee around objects and press `C`, `X`, or `V` to copy, cut, or paste them. `Ctrl+Shift+C/X/V` are optional aliases when forwarded by the terminal, while plain `Ctrl+C` remains the terminal cancel shortcut.

## Usage

```bash
# load an editable native document from a file
termdraw --load architecture.td.json

# load from stdin, then continue interactively on the controlling terminal
cat architecture.td.json | termdraw --load -

# save plain text directly to a file
termdraw --output diagram.txt

# export a fenced Markdown code block
termdraw --fenced > diagram.md

# show CLI help
termdraw --help
```

termDRAW! outputs terminal text, not SVG or bitmap graphics.

Use native `.td.json` documents when you want load/save round-tripping for the editable object model. If you load from stdin, termDRAW still needs a controlling terminal for the interactive session; use `--load <file>` when no TTY is available.

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
