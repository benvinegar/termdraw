/**
 * Shared internal types for the termDRAW renderable UI.
 *
 * This file defines layout records and palette hit-target shapes that are shared across the
 * app layout, rendering, and input helpers.
 */
import type { RGBA } from "@opentui/core";
import type { BoxStyle, DrawMode, InkColor, LineStyle, TextBorderMode } from "../draw-state.js";

/** Describes whether the renderable should show the full chrome or just the editor surface. */
export type ChromeMode = "full" | "editor";

/** Captures the computed layout regions for a full-chrome termDRAW frame. */
export type AppLayout = {
  dividerX: number;
  paletteLeft: number;
  paletteWidth: number;
  bodyTop: number;
  bodyBottom: number;
  footerY: number;
  canvasViewWidth: number;
};

/** Describes a clickable tool button in the right-hand palette. */
export type ToolButton = {
  mode: DrawMode;
  left: number;
  top: number;
  width: number;
  height: number;
  icon: string;
  label: string;
  color: RGBA;
};

/** Describes a contextual style row shown beneath the active tool. */
export type StyleButton = {
  style: BoxStyle | LineStyle | TextBorderMode | string;
  left: number;
  top: number;
  width: number;
  sample: string;
  label: string;
};

/** Describes a clickable ink-color swatch in the palette header. */
export type ColorSwatch = {
  color: InkColor;
  left: number;
  top: number;
  width: number;
};
