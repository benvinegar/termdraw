/**
 * Rendering helpers for the termDRAW app chrome and editor surface.
 *
 * This file draws the outer frame, palette, selection overlays, cursor, and the small-screen
 * fallback message while leaving `TermDrawRenderable` to coordinate state and lifecycle.
 */
import { TextAttributes, type OptimizedBuffer } from "@opentui/core";
import type { DrawState } from "../draw-state.js";
import { padToWidth, visibleCellCount } from "../text.js";
import type { AppLayout, ColorSwatch, StyleButton, ToolButton } from "./types.js";
import {
  BOX_STYLE_OPTIONS,
  BRUSH_OPTIONS,
  COLORS,
  LINE_STYLE_OPTIONS,
  MIN_HEIGHT,
  MIN_WIDTH,
  TEXT_BORDER_OPTIONS,
  getInkColorContrast,
  getInkColorValue,
} from "./theme.js";

/** Draws a text segment and returns the next x-position in terminal-cell coordinates. */
function drawSegment(
  buffer: OptimizedBuffer,
  x: number,
  y: number,
  text: string,
  fg: (typeof COLORS)[keyof typeof COLORS],
  bg: (typeof COLORS)[keyof typeof COLORS],
  attributes = TextAttributes.NONE,
): number {
  if (text.length === 0) return x;
  buffer.drawText(text, x, y, fg, bg, attributes);
  return x + visibleCellCount(text);
}

/** Draws the small-screen fallback message when the full chrome cannot fit. */
export function drawTooSmallMessage(
  frameBuffer: OptimizedBuffer,
  width: number,
  height: number,
): void {
  const lines = [
    "Terminal too small for termDRAW!.",
    `Need at least ${MIN_WIDTH}x${MIN_HEIGHT}.`,
    "Resize and try again.",
  ];

  const startY = Math.max(0, Math.floor(height / 2) - 1);
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]!;
    const x = Math.max(0, Math.floor((width - visibleCellCount(text)) / 2));
    frameBuffer.drawText(
      text,
      x,
      startY + index,
      COLORS.warning,
      COLORS.panel,
      TextAttributes.BOLD,
    );
  }
}

/** Draws the full-chrome frame, header, divider, and footer rows. */
export function drawChrome(
  frameBuffer: OptimizedBuffer,
  width: number,
  height: number,
  state: DrawState,
  layout: AppLayout,
  footerTextOverride: string | null,
): void {
  drawHorizontalBorder(frameBuffer, width, 0, "╭", "╮");
  drawHorizontalBorder(frameBuffer, width, height - 1, "╰", "╯");

  for (let y = 1; y < height - 1; y += 1) {
    drawOuterSideBorders(frameBuffer, width, y);
  }

  for (let y = 1; y <= layout.bodyBottom; y += 1) {
    frameBuffer.setCell(layout.dividerX, y, "│", COLORS.border, COLORS.panel);
  }

  drawHeaderRow(frameBuffer, width, state, layout);
  drawHeaderDivider(frameBuffer, width, layout);
  drawFooterRow(frameBuffer, width, state.currentStatus, layout, footerTextOverride);
}

/** Draws the header row describing the active tool, style, and color. */
function drawHeaderRow(
  frameBuffer: OptimizedBuffer,
  width: number,
  state: DrawState,
  layout: AppLayout,
): void {
  const y = 1;
  const canvasHeaderWidth = Math.max(1, layout.dividerX - 1);
  const paletteWidth = Math.max(1, width - layout.dividerX - 2);

  frameBuffer.drawText(" ".repeat(canvasHeaderWidth), 1, y, COLORS.text, COLORS.panel);
  frameBuffer.drawText(" ".repeat(paletteWidth), layout.dividerX + 1, y, COLORS.text, COLORS.panel);

  let x = 1;
  x = drawSegment(frameBuffer, x, y, "termDRAW!", COLORS.accent, COLORS.panel, TextAttributes.BOLD);
  x = drawSegment(frameBuffer, x, y, "  tool:", COLORS.dim, COLORS.panel);

  const modeLabel = state.getModeLabel();
  const modeColor =
    state.currentMode === "select"
      ? COLORS.select
      : state.currentMode === "line"
        ? COLORS.accent
        : state.currentMode === "box"
          ? COLORS.warning
          : state.currentMode === "paint"
            ? COLORS.paint
            : COLORS.success;
  x = drawSegment(frameBuffer, x, y, modeLabel, modeColor, COLORS.panel, TextAttributes.BOLD);

  if (state.currentMode === "paint") {
    const brush = BRUSH_OPTIONS.find((option) => option.brush === state.currentBrush);
    x = drawSegment(frameBuffer, x, y, "  brush:", COLORS.dim, COLORS.panel);
    x = drawSegment(
      frameBuffer,
      x,
      y,
      brush ? `${brush.sample} ${brush.label}` : `"${state.currentBrush}"`,
      COLORS.paint,
      COLORS.panel,
    );
  } else if (state.currentMode === "box") {
    const boxStyle =
      BOX_STYLE_OPTIONS.find((option) => option.style === state.currentBoxStyle) ??
      BOX_STYLE_OPTIONS[0]!;
    x = drawSegment(frameBuffer, x, y, "  style:", COLORS.dim, COLORS.panel);
    x = drawSegment(
      frameBuffer,
      x,
      y,
      `${boxStyle.sample} ${boxStyle.label}`,
      COLORS.warning,
      COLORS.panel,
    );
  } else if (state.currentMode === "line") {
    const lineStyle =
      LINE_STYLE_OPTIONS.find((option) => option.style === state.currentLineStyle) ??
      LINE_STYLE_OPTIONS[0]!;
    x = drawSegment(frameBuffer, x, y, "  style:", COLORS.dim, COLORS.panel);
    x = drawSegment(
      frameBuffer,
      x,
      y,
      `${lineStyle.sample} ${lineStyle.label}`,
      COLORS.accent,
      COLORS.panel,
    );
  } else if (state.currentMode === "text") {
    const textBorder =
      TEXT_BORDER_OPTIONS.find((option) => option.style === state.currentTextBorderMode) ??
      TEXT_BORDER_OPTIONS[0]!;
    x = drawSegment(frameBuffer, x, y, "  border:", COLORS.dim, COLORS.panel);
    x = drawSegment(
      frameBuffer,
      x,
      y,
      `${textBorder.sample} ${textBorder.label}`,
      COLORS.success,
      COLORS.panel,
    );
  }

  x = drawSegment(frameBuffer, x, y, "  color:", COLORS.dim, COLORS.panel);
  drawSegment(
    frameBuffer,
    x,
    y,
    "●",
    getInkColorValue(state.currentInkColor),
    COLORS.panel,
    TextAttributes.BOLD,
  );

  const paletteTitle = padToWidth("Tools", paletteWidth);
  frameBuffer.drawText(
    paletteTitle,
    layout.dividerX + 1,
    y,
    COLORS.dim,
    COLORS.panel,
    TextAttributes.BOLD,
  );
}

/** Draws the divider row that separates the header from the main content. */
function drawHeaderDivider(frameBuffer: OptimizedBuffer, width: number, layout: AppLayout): void {
  const y = 2;
  frameBuffer.setCell(0, y, "├", COLORS.border, COLORS.panel);
  for (let x = 1; x < width - 1; x += 1) {
    frameBuffer.setCell(x, y, "─", COLORS.border, COLORS.panel);
  }
  frameBuffer.setCell(layout.dividerX, y, "┼", COLORS.border, COLORS.panel);
  frameBuffer.setCell(width - 1, y, "┤", COLORS.border, COLORS.panel);
}

/** Draws the footer row with controls help and status text. */
function drawFooterRow(
  frameBuffer: OptimizedBuffer,
  width: number,
  status: string,
  layout: AppLayout,
  footerTextOverride: string | null,
): void {
  const text =
    footerTextOverride ??
    "B Brush • A Select • U Box • P Line • T Text • Esc Deselect • Enter/Ctrl+S Save • Ctrl+Q Quit";
  const combined = `${text}  ${status}`;
  const padded = padToWidth(combined, Math.max(1, width - 2));
  frameBuffer.drawText(padded, 1, layout.footerY, COLORS.dim, COLORS.panel);
}

/** Draws the right-hand palette region including tool buttons, styles, and colors. */
export function drawToolPalette(
  frameBuffer: OptimizedBuffer,
  state: DrawState,
  layout: AppLayout,
  toolButtons: ToolButton[],
  styleButtons: StyleButton[],
  colorSwatches: ColorSwatch[],
): void {
  const paletteWidth = Math.max(1, layout.paletteWidth);
  const paletteX = layout.dividerX + 1;

  for (let y = layout.bodyTop; y <= layout.bodyBottom; y += 1) {
    frameBuffer.drawText(" ".repeat(paletteWidth), paletteX, y, COLORS.text, COLORS.panel);
  }

  for (const button of toolButtons) {
    drawToolButton(frameBuffer, state.currentMode, button);
  }

  for (const button of styleButtons) {
    drawStyleButton(frameBuffer, state, button);
  }

  drawColorPicker(frameBuffer, state.currentInkColor, colorSwatches);
}

/** Draws a single boxed tool button. */
function drawToolButton(
  frameBuffer: OptimizedBuffer,
  currentMode: DrawState["currentMode"],
  button: ToolButton,
): void {
  const isActive = currentMode === button.mode;
  const fg = isActive ? COLORS.panel : button.color;
  const bg = isActive ? button.color : COLORS.panel;
  const borderColor = isActive ? button.color : COLORS.border;

  frameBuffer.drawText(
    `┌${"─".repeat(button.width - 2)}┐`,
    button.left,
    button.top,
    borderColor,
    COLORS.panel,
    TextAttributes.BOLD,
  );

  const label = padToWidth(` ${button.icon} ${button.label} `, button.width - 2);
  frameBuffer.drawText(
    "│",
    button.left,
    button.top + 1,
    borderColor,
    COLORS.panel,
    TextAttributes.BOLD,
  );
  frameBuffer.drawText(label, button.left + 1, button.top + 1, fg, bg, TextAttributes.BOLD);
  frameBuffer.drawText(
    "│",
    button.left + button.width - 1,
    button.top + 1,
    borderColor,
    COLORS.panel,
    TextAttributes.BOLD,
  );

  frameBuffer.drawText(
    `└${"─".repeat(button.width - 2)}┘`,
    button.left,
    button.top + 2,
    borderColor,
    COLORS.panel,
    TextAttributes.BOLD,
  );
}

/** Draws a single contextual style row beneath the active tool. */
function drawStyleButton(
  frameBuffer: OptimizedBuffer,
  state: DrawState,
  button: StyleButton,
): void {
  const isActive =
    state.currentMode === "box"
      ? state.currentBoxStyle === button.style
      : state.currentMode === "line"
        ? state.currentLineStyle === button.style
        : state.currentMode === "text"
          ? state.currentTextBorderMode === button.style
          : state.currentBrush === button.style;
  const fg = isActive ? COLORS.panel : COLORS.text;
  const bg = isActive ? COLORS.warning : COLORS.panel;
  const text = padToWidth(`${button.sample} ${button.label}`, button.width);
  frameBuffer.drawText(
    text,
    button.left,
    button.top,
    fg,
    bg,
    isActive ? TextAttributes.BOLD : TextAttributes.NONE,
  );
}

/** Draws the full set of ink-color swatches. */
function drawColorPicker(
  frameBuffer: OptimizedBuffer,
  currentInkColor: DrawState["currentInkColor"],
  colorSwatches: ColorSwatch[],
): void {
  for (const swatch of colorSwatches) {
    drawColorSwatch(frameBuffer, currentInkColor, swatch);
  }
}

/** Draws a single ink-color swatch. */
function drawColorSwatch(
  frameBuffer: OptimizedBuffer,
  currentInkColor: DrawState["currentInkColor"],
  swatch: ColorSwatch,
): void {
  const isActive = currentInkColor === swatch.color;
  const bg = getInkColorValue(swatch.color);
  const fg = getInkColorContrast(swatch.color);
  const text = isActive ? " • " : "   ";
  frameBuffer.drawText(
    text,
    swatch.left,
    swatch.top,
    fg,
    bg,
    isActive ? TextAttributes.BOLD : TextAttributes.NONE,
  );
}

/** Draws the retained canvas contents plus selection, marquee, preview, and cursor overlays. */
export function drawCanvas(frameBuffer: OptimizedBuffer, state: DrawState): void {
  const preview = state.getActivePreviewCharacters();
  const marqueeChars = state.getSelectionMarqueeCharacters();
  const selectedCells = state.getSelectedCellKeys();
  const handleChars = state.getSelectionHandleCharacters();

  for (let y = 0; y < state.height; y += 1) {
    const rowY = state.canvasTopRow + y;

    for (let x = 0; x < state.width; x += 1) {
      const key = `${x},${y}`;
      const handleChar = handleChars.get(key);
      const marqueeChar = marqueeChars.get(key);
      const previewChar = preview.get(key);
      const cell = handleChar ?? marqueeChar ?? previewChar ?? state.getCompositeCell(x, y);
      const cellColor = state.getCompositeColor(x, y);
      const isCursor = x === state.currentCursorX && y === state.currentCursorY;
      const isSelected = selectedCells.has(key);
      const isHandle = handleChar !== undefined;
      const isMarquee = marqueeChar !== undefined;
      const fg = isCursor
        ? COLORS.cursorFg
        : isHandle
          ? COLORS.handleFg
          : isMarquee
            ? COLORS.select
            : isSelected
              ? COLORS.selectionFg
              : previewChar
                ? getInkColorValue(state.currentInkColor)
                : cellColor
                  ? getInkColorValue(cellColor)
                  : COLORS.text;
      const bg = isCursor
        ? COLORS.cursorBg
        : isHandle
          ? COLORS.handleBg
          : isSelected
            ? COLORS.selectionBg
            : COLORS.panel;
      const attributes =
        isCursor || isSelected || isHandle || isMarquee ? TextAttributes.BOLD : TextAttributes.NONE;
      frameBuffer.setCell(x + state.canvasLeftCol, rowY, cell, fg, bg, attributes);
    }
  }
}

/** Draws the outer vertical borders for a single frame row. */
function drawOuterSideBorders(frameBuffer: OptimizedBuffer, width: number, y: number): void {
  frameBuffer.setCell(0, y, "│", COLORS.border, COLORS.panel);
  frameBuffer.setCell(width - 1, y, "│", COLORS.border, COLORS.panel);
}

/** Draws a horizontal border row with the given corner glyphs. */
function drawHorizontalBorder(
  frameBuffer: OptimizedBuffer,
  width: number,
  y: number,
  left: string,
  right: string,
): void {
  frameBuffer.setCell(0, y, left, COLORS.border, COLORS.panel);
  for (let x = 1; x < width - 1; x += 1) {
    frameBuffer.setCell(x, y, "─", COLORS.border, COLORS.panel);
  }
  frameBuffer.setCell(width - 1, y, right, COLORS.border, COLORS.panel);
}
