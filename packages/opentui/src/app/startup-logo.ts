/**
 * Startup-logo rendering helpers for the termDRAW app renderable.
 *
 * This file contains the splash art and the gradient logic that overlays it on the canvas
 * until the user begins interacting with the editor.
 */
import { RGBA, TextAttributes, type OptimizedBuffer } from "@opentui/core";
import type { DrawState } from "../draw-state.js";
import { visibleCellCount } from "../text.js";
import type { AppLayout, ChromeMode } from "./types.js";
import { COLORS } from "./theme.js";

const STARTUP_LOGO_LINES = [
  "  `::                              :::::::-.  :::::::..    :::.  .::    .   .:::.:",
  "   ;;                               ;;,   `';,;;;;``;;;;   ;;`;; ';;,  ;;  ;;;';;;",
  "=[[[[[[.,cc[[[cc.=,,[[==[ccc, ,cccc,`[[     [[ [[[,/[[['  ,[[ '[[,'[[, [[, [[' '[[",
  '   $$   $$$___--\'`$$$"``$$$$$$$$"$$$ $$,    $$ $$$$$$c   c$$$cc$$$c Y$c$$$c$P   $$',
  '   88,  88b    ,o,888   888 Y88" 888o888_,o8P\' 888b "88bo,888   888  "88"888    ""',
  '   MMM   "YUMMMMP""MM,  MMM  M\'  "MMMMMMP"`   MMMM   "W" YMM   ""` "M "M"    MM',
] as const;
const STARTUP_LOGO_CAPTION = "(c) 2026 Ben Vinegar  ·  Licensed under MIT";

/** Linearly blends two RGBA colors. */
function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  const [ar, ag, ab, aa] = a.toInts();
  const [br, bg, bb, ba] = b.toInts();
  const mix = (left: number, right: number) => Math.round(left + (right - left) * t);
  return RGBA.fromInts(mix(ar, br), mix(ag, bg), mix(ab, bb), mix(aa, ba));
}

/** Returns the gradient color for a startup-logo character. */
function getStartupLogoColor(rowIndex: number, colIndex: number, lineWidth: number): RGBA {
  const verticalT = STARTUP_LOGO_LINES.length <= 1 ? 0 : rowIndex / (STARTUP_LOGO_LINES.length - 1);
  const verticalColor =
    verticalT <= 0.55
      ? mixColor(COLORS.dim, COLORS.accent, verticalT / 0.55)
      : mixColor(COLORS.accent, COLORS.warning, (verticalT - 0.55) / 0.45);
  const horizontalT = lineWidth <= 1 ? 0 : colIndex / (lineWidth - 1);
  const highlightStrength = 0.1 + 0.16 * Math.sin(horizontalT * Math.PI);
  return mixColor(verticalColor, COLORS.text, highlightStrength);
}

/** Returns the muted caption color drawn beneath the startup logo. */
function getStartupLogoCaptionColor(): RGBA {
  return mixColor(COLORS.border, COLORS.text, 0.3);
}

/** Draws the startup logo overlay when it is enabled and still visible. */
export function renderStartupLogo(
  frameBuffer: OptimizedBuffer,
  state: DrawState,
  chromeMode: ChromeMode,
  layout: AppLayout | null,
  startupLogoEnabled: boolean,
  startupLogoDismissed: boolean,
): void {
  if (!startupLogoEnabled || startupLogoDismissed) return;

  const logoWidth = Math.max(...STARTUP_LOGO_LINES.map((line) => visibleCellCount(line)));
  const logoHeight = STARTUP_LOGO_LINES.length;
  const captionWidth = visibleCellCount(STARTUP_LOGO_CAPTION);
  const availableWidth =
    chromeMode === "full" && layout ? layout.dividerX - state.canvasLeftCol : state.width;
  const availableHeight =
    chromeMode === "full" && layout ? layout.bodyBottom - state.canvasTopRow + 1 : state.height;
  const showCaption = availableWidth >= captionWidth && availableHeight >= logoHeight + 2;
  const overlayHeight = showCaption ? logoHeight + 2 : logoHeight;

  if (availableWidth < logoWidth || availableHeight < overlayHeight) {
    return;
  }

  const startY = state.canvasTopRow + Math.floor((availableHeight - overlayHeight) / 2);

  for (const [rowIndex, line] of STARTUP_LOGO_LINES.entries()) {
    const y = startY + rowIndex;
    const lineWidth = visibleCellCount(line);
    const startX = state.canvasLeftCol + Math.floor((availableWidth - lineWidth) / 2);
    for (const [colIndex, char] of Array.from(line).entries()) {
      if (char === " ") continue;
      const x = startX + colIndex;
      const fg = getStartupLogoColor(rowIndex, colIndex, line.length);
      const attributes = rowIndex >= 2 ? TextAttributes.BOLD : TextAttributes.NONE;
      frameBuffer.setCell(x, y, char, fg, COLORS.panel, attributes);
    }
  }

  if (showCaption) {
    const captionY = startY + logoHeight + 1;
    const captionX = state.canvasLeftCol + Math.floor((availableWidth - captionWidth) / 2);
    frameBuffer.drawText(
      STARTUP_LOGO_CAPTION,
      captionX,
      captionY,
      getStartupLogoCaptionColor(),
      COLORS.panel,
      TextAttributes.DIM,
    );
  }
}
