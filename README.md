<p align="center">
  <img src="./logo.webp" alt="termDRAW logo" width="420" />
</p>

<h1 align="center">termDRAW!</h1>

<p align="center">
  A terminal drawing editor for developers who want editable diagrams, UI mocks, and text graphics without leaving the terminal.
</p>

## Packages

- `@termdraw/app` — the standalone terminal app with the `termdraw` command
- `@termdraw/opentui` — embeddable OpenTUI components and renderables
- `@termdraw/pi` — Pi package that opens termDRAW in a Pi overlay

## Install the app

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

## App usage

```bash
# save plain text directly to a file
termdraw --output diagram.txt

# export a fenced Markdown code block
termdraw --fenced > diagram.md

# show CLI help
termdraw --help
```

termDRAW! outputs terminal text, not SVG or bitmap graphics.

## Embed in an OpenTUI app

```bash
npm install @termdraw/opentui @opentui/core @opentui/react react
```

```tsx
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { TermDrawApp } from "@termdraw/opentui";

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

Also exported from `@termdraw/opentui`:

- `TermDrawApp`
- `TermDrawEditor`
- `TermDraw`
- `TermDrawAppRenderable`
- `TermDrawEditorRenderable`
- `TermDrawRenderable`
- `formatSavedOutput`
- `buildHelpText`

## Use it in Pi

```bash
pi install npm:@termdraw/pi
```

Then inside Pi:

```text
/termdraw
```

## Docs

- App package: [`packages/app`](https://github.com/benvinegar/termdraw/tree/main/packages/app)
- OpenTUI package: [`packages/opentui`](https://github.com/benvinegar/termdraw/tree/main/packages/opentui)
- Pi package: [`packages/pi`](https://github.com/benvinegar/termdraw/tree/main/packages/pi)

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
