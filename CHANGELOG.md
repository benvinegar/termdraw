# Changelog

All notable user-visible changes to this project are documented in this file.

## [Unreleased]

### Added

### Changed

### Fixed

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
