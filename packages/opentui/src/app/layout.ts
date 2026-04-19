/**
 * Layout and hit-target helpers for the termDRAW app renderable.
 *
 * This file computes full-chrome layout regions and the palette button geometry shared by
 * rendering and mouse-input handling.
 */
import type { DrawMode, InkColor } from "../draw-state.js";
import type { AppLayout, ColorSwatch, StyleButton, ToolButton } from "./types.js";
import {
  BOX_STYLE_OPTIONS,
  BRUSH_OPTIONS,
  COLOR_SWATCH_COLUMNS,
  COLOR_SWATCH_WIDTH,
  COLORS,
  LINE_STYLE_OPTIONS,
  STYLE_BUTTON_WIDTH,
  TEXT_BORDER_OPTIONS,
  TOOL_BUTTON_HEIGHT,
  TOOL_BUTTON_WIDTH,
  TOOL_PALETTE_WIDTH,
} from "./theme.js";

/** Returns the frame layout used by the full-chrome app view. */
export function getLayout(width: number, height: number): AppLayout {
  const footerY = height - 2;
  const bodyTop = 3;
  const bodyBottom = height - 3;
  const dividerX = width - TOOL_PALETTE_WIDTH - 2;

  return {
    dividerX,
    paletteLeft: dividerX + 1,
    paletteWidth: width - dividerX - 2,
    bodyTop,
    bodyBottom,
    footerY,
    canvasViewWidth: width - TOOL_PALETTE_WIDTH - 1,
  };
}

/** Returns whether a point lies inside the given inclusive-exclusive rectangle. */
export function isInsideRect(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  return x >= left && x < left + width && y >= top && y < top + height;
}

/** Returns the number of style rows rendered beneath the active tool. */
export function getContextualStyleRowCount(currentMode: DrawMode): number {
  if (currentMode === "box") return BOX_STYLE_OPTIONS.length;
  if (currentMode === "line") return LINE_STYLE_OPTIONS.length;
  if (currentMode === "paint") return BRUSH_OPTIONS.length;
  if (currentMode === "text") return TEXT_BORDER_OPTIONS.length;
  return 0;
}

/** Returns the palette x-position used by tool buttons and swatches. */
function getPaletteButtonLeft(layout: AppLayout): number {
  return layout.paletteLeft + 1;
}

/** Returns the clickable tool buttons for the current palette layout. */
export function getToolButtons(layout: AppLayout, currentMode: DrawMode): ToolButton[] {
  const buttonLeft = getPaletteButtonLeft(layout);
  const definitions: Omit<ToolButton, "left" | "top" | "width" | "height">[] = [
    { mode: "select", icon: "◎", label: "Select", color: COLORS.select },
    { mode: "box", icon: "▣", label: "Box", color: COLORS.warning },
    { mode: "line", icon: "╱", label: "Line", color: COLORS.accent },
    { mode: "paint", icon: "▒", label: "Brush", color: COLORS.paint },
    { mode: "text", icon: "T", label: "Text", color: COLORS.success },
  ];

  const buttons: ToolButton[] = [];
  let top = layout.bodyTop + 3;

  for (const definition of definitions) {
    buttons.push({
      ...definition,
      left: buttonLeft,
      top,
      width: TOOL_BUTTON_WIDTH,
      height: TOOL_BUTTON_HEIGHT,
    });
    top += TOOL_BUTTON_HEIGHT;

    if (definition.mode === currentMode) {
      top += getContextualStyleRowCount(currentMode);
    }
  }

  return buttons;
}

/** Returns the contextual style rows shown beneath the active tool. */
export function getContextualStyleButtons(layout: AppLayout, currentMode: DrawMode): StyleButton[] {
  if (
    currentMode !== "box" &&
    currentMode !== "line" &&
    currentMode !== "paint" &&
    currentMode !== "text"
  ) {
    return [];
  }

  const buttonLeft = getPaletteButtonLeft(layout);
  const activeButton = getToolButtons(layout, currentMode).find(
    (button) => button.mode === currentMode,
  );
  if (!activeButton) return [];

  const options =
    currentMode === "box"
      ? BOX_STYLE_OPTIONS
      : currentMode === "line"
        ? LINE_STYLE_OPTIONS
        : currentMode === "text"
          ? TEXT_BORDER_OPTIONS
          : BRUSH_OPTIONS.map((option) => ({
              style: option.brush,
              sample: option.sample,
              label: option.label,
            }));

  return options.map((option, index) => ({
    style: option.style,
    left: buttonLeft,
    top: activeButton.top + TOOL_BUTTON_HEIGHT + index,
    width: STYLE_BUTTON_WIDTH,
    sample: option.sample,
    label: option.label,
  }));
}

/** Returns the palette color swatches for the current layout. */
export function getColorSwatches(layout: AppLayout, colors: readonly InkColor[]): ColorSwatch[] {
  const buttonLeft = getPaletteButtonLeft(layout);
  const colorTop = layout.bodyTop;

  return colors.map((color, index) => ({
    color,
    left: buttonLeft + (index % COLOR_SWATCH_COLUMNS) * COLOR_SWATCH_WIDTH,
    top: colorTop + Math.floor(index / COLOR_SWATCH_COLUMNS),
    width: COLOR_SWATCH_WIDTH,
  }));
}

/** Returns whether the pointer event lands inside the drawable canvas region. */
export function isCanvasChromeEvent(
  canvasLeftCol: number,
  canvasTopRow: number,
  layout: AppLayout,
  x: number,
  y: number,
): boolean {
  return (
    x >= canvasLeftCol && x <= layout.dividerX - 1 && y >= canvasTopRow && y <= layout.bodyBottom
  );
}
