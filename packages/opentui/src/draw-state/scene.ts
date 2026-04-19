/**
 * Scene-buffer helpers for draw-state rendering.
 *
 * This file builds and updates the intermediate canvas, color, and connection grids used to
 * compose box borders and other rendered output into final terminal cells.
 */
import type {
  CanvasGrid,
  CellConnections,
  ColorGrid,
  ConnectionGrid,
  ConnectionStyle,
  Direction,
  InkColor,
  Rect,
} from "./types.js";

const DIRECTIONS: Direction[] = ["n", "e", "s", "w"];
const DIRECTION_BITS: Record<Direction, number> = {
  n: 1,
  e: 2,
  s: 4,
  w: 8,
};
const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  n: "s",
  e: "w",
  s: "n",
  w: "e",
};
const DIRECTION_DELTAS: Record<Direction, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};

const LIGHT_GLYPHS: Record<number, string> = {
  0: " ",
  1: "│",
  2: "─",
  3: "└",
  4: "│",
  5: "│",
  6: "┌",
  7: "├",
  8: "─",
  9: "┘",
  10: "─",
  11: "┴",
  12: "┐",
  13: "┤",
  14: "┬",
  15: "┼",
};

const HEAVY_GLYPHS: Record<number, string> = {
  0: " ",
  1: "┃",
  2: "━",
  3: "┗",
  4: "┃",
  5: "┃",
  6: "┏",
  7: "┣",
  8: "━",
  9: "┛",
  10: "━",
  11: "┻",
  12: "┓",
  13: "┫",
  14: "┳",
  15: "╋",
};

const DOUBLE_GLYPHS: Record<number, string> = {
  0: " ",
  1: "║",
  2: "═",
  3: "╚",
  4: "║",
  5: "║",
  6: "╔",
  7: "╠",
  8: "═",
  9: "╝",
  10: "═",
  11: "╩",
  12: "╗",
  13: "╣",
  14: "╦",
  15: "╬",
};

/** Creates an empty character canvas initialized with spaces. */
export function createCanvas(width: number, height: number): CanvasGrid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
}

/** Creates an empty color grid initialized with `null`. */
export function createColorGrid(width: number, height: number): ColorGrid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
}

/** Creates an empty directional-connection record for a single cell. */
function createCellConnections(): CellConnections {
  return {
    n: { light: 0, heavy: 0, double: 0 },
    e: { light: 0, heavy: 0, double: 0 },
    s: { light: 0, heavy: 0, double: 0 },
    w: { light: 0, heavy: 0, double: 0 },
  };
}

/** Creates a grid for storing box-edge connectivity between neighboring cells. */
export function createConnectionGrid(width: number, height: number): ConnectionGrid {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => createCellConnections()),
  );
}

/**
 * Adjusts a connection count for a cell edge and its neighboring reciprocal edge.
 *
 * Updating both sides keeps box composition symmetric so later glyph lookup can infer corners,
 * tees, and crosses from simple directional presence.
 */
export function adjustConnection(
  grid: ConnectionGrid,
  width: number,
  height: number,
  x: number,
  y: number,
  direction: Direction,
  style: ConnectionStyle,
  delta: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = DIRECTION_DELTAS[direction];
  const nx = x + offset.dx;
  const ny = y + offset.dy;
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;

  const source = grid[y]![x]![direction];
  source[style] = Math.max(0, source[style] + delta);

  const opposite = OPPOSITE_DIRECTION[direction];
  const target = grid[ny]![nx]![opposite];
  target[style] = Math.max(0, target[style] + delta);
}

/** Paints the color for both cells touched by a directional connection segment. */
export function paintConnectionColor(
  grid: ColorGrid,
  width: number,
  height: number,
  x: number,
  y: number,
  direction: Direction,
  color: InkColor,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = DIRECTION_DELTAS[direction];
  const nx = x + offset.dx;
  const ny = y + offset.dy;
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;

  grid[y]![x] = color;
  grid[ny]![nx] = color;
}

/** Iterates over each edge segment that forms a rectangle perimeter. */
export function applyBoxPerimeter(
  rect: Rect,
  applySegment: (x: number, y: number, direction: Direction) => void,
): void {
  if (rect.left === rect.right && rect.top === rect.bottom) return;

  for (let x = rect.left; x < rect.right; x += 1) {
    applySegment(x, rect.top, "e");
  }
  if (rect.bottom !== rect.top) {
    for (let x = rect.left; x < rect.right; x += 1) {
      applySegment(x, rect.bottom, "e");
    }
  }

  for (let y = rect.top; y < rect.bottom; y += 1) {
    applySegment(rect.left, y, "s");
  }
  if (rect.right !== rect.left) {
    for (let y = rect.top; y < rect.bottom; y += 1) {
      applySegment(rect.right, y, "s");
    }
  }
}

/** Returns the canonical border glyph set for a box connection style. */
export function getBoxBorderGlyphs(style: ConnectionStyle) {
  switch (style) {
    case "heavy":
      return {
        horizontal: "━",
        vertical: "┃",
        topLeft: "┏",
        topRight: "┓",
        bottomLeft: "┗",
        bottomRight: "┛",
      };
    case "double":
      return {
        horizontal: "═",
        vertical: "║",
        topLeft: "╔",
        topRight: "╗",
        bottomLeft: "╚",
        bottomRight: "╝",
      };
    case "light":
      return {
        horizontal: "─",
        vertical: "│",
        topLeft: "┌",
        topRight: "┐",
        bottomLeft: "└",
        bottomRight: "┘",
      };
  }
}

/**
 * Resolves the final box-drawing glyph for a cell based on its directional connection counts.
 *
 * Heavy and double segments win over light ones so mixed overlaps stay visually consistent.
 */
export function getConnectionGlyph(
  grid: ConnectionGrid,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  if (x < 0 || y < 0 || x >= width || y >= height) return " ";

  let mask = 0;
  let hasHeavy = false;
  let hasDouble = false;

  for (const direction of DIRECTIONS) {
    const counts = grid[y]![x]![direction];
    if (counts.light > 0 || counts.heavy > 0 || counts.double > 0) {
      mask |= DIRECTION_BITS[direction];
    }
    if (counts.heavy > 0) {
      hasHeavy = true;
    }
    if (counts.double > 0) {
      hasDouble = true;
    }
  }

  if (mask === 0) return " ";
  const table = hasDouble ? DOUBLE_GLYPHS : hasHeavy ? HEAVY_GLYPHS : LIGHT_GLYPHS;
  return table[mask] ?? (hasDouble ? "╬" : hasHeavy ? "╋" : "┼");
}
