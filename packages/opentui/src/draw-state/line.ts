/**
 * Line rendering and stroke-path helpers for draw-state.
 *
 * This file handles line glyph choice, Bresenham point generation, axis-constrained endpoints,
 * and paint-stroke point accumulation.
 */
import type { ElbowOrientation, LineStyle, Point } from "./types.js";

function getOrthogonalLineGlyphs(style: LineStyle): {
  horizontal: string;
  vertical: string;
  cornerNE: string;
  cornerNW: string;
  cornerSE: string;
  cornerSW: string;
} {
  if (style === "double") {
    return {
      horizontal: "═",
      vertical: "║",
      cornerNE: "╚",
      cornerNW: "╝",
      cornerSE: "╔",
      cornerSW: "╗",
    };
  }

  if (style === "dashed") {
    return {
      horizontal: "┄",
      vertical: "┆",
      cornerNE: "└",
      cornerNW: "┘",
      cornerSE: "┌",
      cornerSW: "┐",
    };
  }

  return {
    horizontal: "─",
    vertical: "│",
    cornerNE: "└",
    cornerNW: "┘",
    cornerSE: "┌",
    cornerSW: "┐",
  };
}

/** Chooses the best single-cell glyph for a line segment. */
function getLineCharacter(start: Point, end: Point, style: LineStyle = "light"): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const { horizontal, vertical } = getOrthogonalLineGlyphs(style);

  if (dx === 0 && dy === 0) return "•";
  if (dx === 0) return vertical;
  if (dy === 0) return horizontal;
  if (absDx >= absDy * 2) return horizontal;
  if (absDy >= absDx * 2) return vertical;
  return Math.sign(dx) === Math.sign(dy) ? "╲" : "╱";
}

/** Constrains a free line endpoint to the dominant horizontal or vertical axis. */
export function constrainLinePoint(anchor: Point, point: Point): Point {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: point.x, y: anchor.y };
  }

  return { x: anchor.x, y: point.y };
}

/** Returns the rendered character map for a line. */
export function getLineRenderCharacters(
  start: Point,
  end: Point,
  style: LineStyle = "light",
): Map<string, string> {
  const rendered = new Map<string, string>();
  const char = getLineCharacter(start, end, style);
  for (const point of getLinePoints(start.x, start.y, end.x, end.y)) {
    rendered.set(`${point.x},${point.y}`, char);
  }
  return rendered;
}

export function getElbowRenderCharacters(
  start: Point,
  end: Point,
  style: LineStyle = "light",
  orientation: ElbowOrientation = "horizontal-first",
): Map<string, string> {
  const rendered = new Map<string, string>();
  const { horizontal, vertical, cornerNE, cornerNW, cornerSE, cornerSW } =
    getOrthogonalLineGlyphs(style);

  const corner =
    orientation === "vertical-first" ? { x: start.x, y: end.y } : { x: end.x, y: start.y };
  const firstSegmentChar = orientation === "vertical-first" ? vertical : horizontal;
  const secondSegmentChar = orientation === "vertical-first" ? horizontal : vertical;

  for (const point of getLinePoints(start.x, start.y, corner.x, corner.y)) {
    rendered.set(`${point.x},${point.y}`, firstSegmentChar);
  }
  for (const point of getLinePoints(corner.x, corner.y, end.x, end.y)) {
    rendered.set(`${point.x},${point.y}`, secondSegmentChar);
  }

  if (start.x !== end.x && start.y !== end.y) {
    const connectsNorth = start.y < corner.y || end.y < corner.y;
    const connectsSouth = start.y > corner.y || end.y > corner.y;
    const connectsEast = start.x > corner.x || end.x > corner.x;
    const connectsWest = start.x < corner.x || end.x < corner.x;
    const cornerGlyph = connectsNorth
      ? connectsEast
        ? cornerNE
        : cornerNW
      : connectsSouth
        ? connectsEast
          ? cornerSE
          : cornerSW
        : connectsEast
          ? horizontal
          : connectsWest
            ? horizontal
            : vertical;
    rendered.set(`${corner.x},${corner.y}`, cornerGlyph);
  }

  const arrow =
    corner.x !== end.x
      ? end.x > corner.x
        ? ">"
        : "<"
      : corner.y !== end.y
        ? end.y > corner.y
          ? "v"
          : "^"
        : end.x !== start.x
          ? end.x > start.x
            ? ">"
            : "<"
          : end.y > start.y
            ? "v"
            : "^";
  rendered.set(`${end.x},${end.y}`, arrow);
  rendered.set(`${start.x},${start.y}`, start.x === corner.x ? vertical : horizontal);
  return rendered;
}

/** Parses a `"x,y"` map key back into a point. */
export function pointFromKey(key: string): Point {
  const [xText = "0", yText = "0"] = key.split(",");
  return {
    x: Number(xText),
    y: Number(yText),
  };
}

/** Returns the rendered cell coordinates occupied by a line. */
export function getLineRenderCells(start: Point, end: Point, style: LineStyle = "light"): Point[] {
  return [...getLineRenderCharacters(start, end, style).keys()].map((key) => pointFromKey(key));
}

/** Returns the rendered cell coordinates occupied by an elbow connector. */
export function getElbowRenderCells(
  start: Point,
  end: Point,
  style: LineStyle = "light",
  orientation: ElbowOrientation = "horizontal-first",
): Point[] {
  return [...getElbowRenderCharacters(start, end, style, orientation).keys()].map((key) =>
    pointFromKey(key),
  );
}

/** Returns Bresenham points for the line segment between the endpoints. */
export function getLinePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];

  let currentX = x0;
  let currentY = y0;
  const deltaX = Math.abs(x1 - x0);
  const deltaY = Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  let err = deltaX - deltaY;

  while (true) {
    points.push({ x: currentX, y: currentY });
    if (currentX === x1 && currentY === y1) break;
    const twiceErr = err * 2;
    if (twiceErr > -deltaY) {
      err -= deltaY;
      currentX += stepX;
    }
    if (twiceErr < deltaX) {
      err += deltaX;
      currentY += stepY;
    }
  }

  return points;
}

/** Merges points while preserving the original order of the first occurrence of each cell. */
export function mergeUniquePoints(existing: Point[], next: Point[]): Point[] {
  const merged = existing.map((point) => ({ ...point }));
  const seen = new Set(existing.map((point) => `${point.x},${point.y}`));

  for (const point of next) {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...point });
  }

  return merged;
}

/** Extends an in-progress paint stroke with the cells between two drag positions. */
export function appendPaintSegment(points: Point[], from: Point, to: Point): Point[] {
  return mergeUniquePoints(points, getLinePoints(from.x, from.y, to.x, to.y));
}

/** Returns whether two point lists are identical in both length and order. */
export function pointsEqual(a: Point[], b: Point[]): boolean {
  return (
    a.length === b.length &&
    a.every((point, index) => point.x === b[index]?.x && point.y === b[index]?.y)
  );
}
