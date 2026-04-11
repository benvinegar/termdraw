# Changelog

All notable user-visible changes to this project are documented in this file.

## [Unreleased]

### Added

### Changed

### Fixed

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
- Added publish-ready npm package configuration and the `termdraw` CLI entrypoint.
- Added the scoped npm package surface as `@benvinegar/termdraw`.
