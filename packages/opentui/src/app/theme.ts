/**
 * Theme constants and option tables for the termDRAW app renderable.
 *
 * This file centralizes palette sizing, colors, tool hotkeys, canvas insets, and the option
 * lists used to render the chrome and interpret palette interactions.
 */
import { RGBA } from "@opentui/core";
import type {
  BoxStyle,
  CanvasInsets,
  DrawMode,
  InkColor,
  LineStyle,
  TextBorderMode,
} from "../draw-state.js";
import type { ChromeMode } from "./types.js";

/** Minimum width required to render the full-chrome UI. */
export const MIN_WIDTH = 45;

/** Minimum height required to render the full-chrome UI. */
export const MIN_HEIGHT = 27;

/** Width reserved for the right-hand tool palette. */
export const TOOL_PALETTE_WIDTH = 20;

/** Width of each tool button in the palette. */
export const TOOL_BUTTON_WIDTH = 13;

/** Width of each contextual style row. */
export const STYLE_BUTTON_WIDTH = 16;

/** Height of each boxed tool button. */
export const TOOL_BUTTON_HEIGHT = 3;

/** Width of each ink-color swatch. */
export const COLOR_SWATCH_WIDTH = 3;

/** Number of color columns shown in the palette header. */
export const COLOR_SWATCH_COLUMNS = 4;

/** Shared UI colors for chrome, selection overlays, and cursor rendering. */
export const COLORS = {
  background: RGBA.fromHex("#0f172a"),
  panel: RGBA.fromHex("#0f172a"),
  border: RGBA.fromHex("#475569"),
  text: RGBA.fromHex("#e2e8f0"),
  dim: RGBA.fromHex("#94a3b8"),
  select: RGBA.fromHex("#38bdf8"),
  accent: RGBA.fromHex("#22d3ee"),
  warning: RGBA.fromHex("#f59e0b"),
  success: RGBA.fromHex("#22c55e"),
  paint: RGBA.fromHex("#a855f7"),
  preview: RGBA.fromHex("#64748b"),
  selectionFg: RGBA.fromHex("#f8fafc"),
  selectionBg: RGBA.fromHex("#0ea5e9"),
  handleFg: RGBA.fromHex("#f59e0b"),
  handleBg: RGBA.fromHex("#0f172a"),
  cursorFg: RGBA.fromHex("#0f172a"),
  cursorBg: RGBA.fromHex("#f8fafc"),
};

/** Available box-style rows for the palette. */
export const BOX_STYLE_OPTIONS: { style: BoxStyle; sample: string; label: string }[] = [
  { style: "auto", sample: "▣", label: "Auto" },
  { style: "light", sample: "┌─┐", label: "Single" },
  { style: "heavy", sample: "┏━┓", label: "Heavy" },
  { style: "double", sample: "╔═╗", label: "Double" },
];

/** Available line-style rows for the palette. */
export const LINE_STYLE_OPTIONS: { style: LineStyle; sample: string; label: string }[] = [
  { style: "smooth", sample: "⠉⠒", label: "Smooth" },
  { style: "light", sample: "─│", label: "Single" },
  { style: "double", sample: "═║", label: "Double" },
];

/** Available brush presets for paint mode. */
export const BRUSH_OPTIONS = [
  { brush: "#", sample: "###", label: "Hash" },
  { brush: "*", sample: "***", label: "Star" },
  { brush: "+", sample: "+++", label: "Plus" },
  { brush: "x", sample: "xxx", label: "Cross" },
  { brush: "o", sample: "ooo", label: "Circle" },
  { brush: ".", sample: "...", label: "Dot" },
  { brush: "•", sample: "•••", label: "Bullet" },
  { brush: "░", sample: "░░░", label: "Light" },
  { brush: "▒", sample: "▒▒▒", label: "Medium" },
  { brush: "▓", sample: "▓▓▓", label: "Heavy" },
] as const;

/** Available text-border rows for text mode. */
export const TEXT_BORDER_OPTIONS: { style: TextBorderMode; sample: string; label: string }[] = [
  { style: "none", sample: "abc", label: "No border" },
  { style: "single", sample: "┌─┐", label: "Single" },
  { style: "double", sample: "╔═╗", label: "Double" },
  { style: "underline", sample: "___", label: "Underline" },
];

const INK_COLOR_VALUES: Record<InkColor, RGBA> = {
  white: RGBA.fromHex("#e2e8f0"),
  red: RGBA.fromHex("#ef4444"),
  orange: RGBA.fromHex("#f97316"),
  yellow: RGBA.fromHex("#eab308"),
  green: RGBA.fromHex("#22c55e"),
  cyan: RGBA.fromHex("#06b6d4"),
  blue: RGBA.fromHex("#3b82f6"),
  magenta: RGBA.fromHex("#d946ef"),
};

/** Keyboard shortcuts that switch tools outside text entry. */
export const TOOL_HOTKEYS: Partial<Record<string, DrawMode>> = {
  a: "select",
  b: "paint",
  p: "line",
  t: "text",
  u: "box",
};

/** Insets used when rendering the full app chrome around the canvas. */
export const FULL_CHROME_CANVAS_INSETS: CanvasInsets = {
  left: 1,
  top: 3,
  right: 1,
  bottom: 2,
};

/** Insets used when rendering the bare editor surface without chrome. */
export const EDITOR_CANVAS_INSETS: CanvasInsets = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
};

/** Returns the canvas insets for the current chrome mode. */
export function getCanvasInsets(chromeMode: ChromeMode): CanvasInsets {
  return chromeMode === "full" ? FULL_CHROME_CANVAS_INSETS : EDITOR_CANVAS_INSETS;
}

/** Returns the display color associated with the given ink name. */
export function getInkColorValue(color: InkColor): RGBA {
  return INK_COLOR_VALUES[color];
}

/** Returns a readable foreground color for text drawn on top of an ink swatch. */
export function getInkColorContrast(color: InkColor): RGBA {
  return color === "white" || color === "yellow" ? COLORS.panel : COLORS.text;
}
