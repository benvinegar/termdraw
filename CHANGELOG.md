# Changelog

All notable user-visible changes to this project are documented in this file.

## [Unreleased]

### Added

### Changed

### Fixed

## [0.4.1]

### Fixed

- Replaced deprecated `@mariozechner/*` Pi peer and dev dependencies with `@earendil-works/*` package names in `@termdraw/pi`.

## [0.4.0]

### Added

- Added native `.td.json` diagram documents that can be opened with `termdraw --load <file>` or `termdraw --load -`.
- Added a dashed box style for the Box tool.
- Added an elbow connector tool for right-angle connector lines.

### Changed

- Split rendered-art export from native diagram saving in the app: Enter/Ctrl+S still exports art, while Ctrl+D saves the editable diagram and prompts for a path when needed.

### Fixed

## [0.3.5]

### Added

- Added `--version` and `-v` to the standalone `termdraw` CLI.
- Added a tuistory-backed `packages/app` integration test suite and wired it into CI.

### Changed

- Trimmed `termdraw --help` so it shows CLI-relevant options instead of in-app control help.
- Expanded workspace test coverage and made the root `test` script run all package test suites.

### Fixed

- Improved Pi smoke readiness by waiting on more stable mounted editor signals and reacting to an explicit island ready event.

## [0.3.4]

### Added

### Changed

### Fixed

- Pinned OpenTUI runtime dependencies to exact versions so packaged and globally installed `termdraw` builds keep the bundled CLI and native runtime aligned.

## [0.3.3]

### Added

### Changed

- Renamed the Paint tool to Brush in the UI, added single-key tool hotkeys (`B` Brush, `A` Select, `U` Box, `P` Line, `T` Text), and made the Line tool render clean line glyphs automatically, including sub-cell Braille for shallow or steep angles.
- Split the published surface into dedicated `@termdraw/app`, `@termdraw/opentui`, and `@termdraw/pi` packages.
- Refreshed the README to better surface npm CLI usage, Pi usage, and package layout.

### Fixed

- Improved Pi embedding and save flow stability, including smoke coverage and relaxed host peer requirements.
- Improved line drawing behavior with shift-constrained lines, selectable stencils, and better angle matching.
- Added text border modes, explicit text entry activation, and curated brush presets.

## [0.3.0]

Splits the published surface into dedicated app, OpenTUI, and Pi packages.

### Highlights

- publishes the standalone terminal app as `@termdraw/app`
- publishes the embeddable OpenTUI package as `@termdraw/opentui`
- publishes the Pi integration as `@termdraw/pi`
- keeps the `termdraw` executable as the main app entrypoint

## [0.2.0]

### Added

- Added a dedicated Select tool in the right-side palette.
- Added click-drag marquee selection for multiple objects.

### Changed

- Moving, deleting, and recoloring now work across multi-selection.
- Selected groups move together while keeping single-object resize and endpoint handles.
- Updated the full-app layout sizing and test coverage for the new selection flow.

## [0.1.0]

### Added

- Added object-based terminal drawing with retained boxes, lines, paint strokes, and text.
- Added direct click-to-select, move, resize, and edit interactions without a separate select mode.
- Added frame-style boxes with parenting, child movement, and resize-aware transforms.
- Added a right-side tool palette with box styles and a color picker.
- Added a startup splash, footer help, undo/redo, and export to plain text or fenced Markdown.
- Added embeddable OpenTUI React components:
  - `TermDrawApp` for the full chrome
  - `TermDrawEditor` for the bare editor surface
