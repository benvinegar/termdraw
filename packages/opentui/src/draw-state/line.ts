/**
 * Line rendering and stroke-path helpers for draw-state.
 *
 * This file handles line glyph choice, Braille-based smooth-line rendering, Bresenham point
 * generation, axis-constrained endpoints, and paint-stroke point accumulation.
 */
import { clamp, normalizeRect } from "./geometry.js";
import type { LineStyle, Point } from "./types.js";

const BRAILLE_DOT_MASKS = [
  [0x1, 0x8],
  [0x2, 0x10],
  [0x4, 0x20],
  [0x40, 0x80],
] as const;
const BRAILLE_X_OFFSETS = [0.25, 0.75] as const;
const BRAILLE_Y_OFFSETS = [0.125, 0.375, 0.625, 0.875] as const;
const BRAILLE_LINE_THRESHOLD = 0.22;

/** Chooses the best single-cell glyph for a non-Braille line segment. */
function getLineCharacter(start: Point, end: Point, style: LineStyle = "smooth"): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (style === "light") {
    if (dx === 0 && dy === 0) return "•";
    if (dx === 0) return "│";
    if (dy === 0) return "─";
    if (absDx >= absDy * 2) return "─";
    if (absDy >= absDx * 2) return "│";
    return Math.sign(dx) === Math.sign(dy) ? "╲" : "╱";
  }

  if (style === "double") {
    if (dx === 0 && dy === 0) return "•";
    if (dx === 0) return "║";
    if (dy === 0) return "═";
    if (absDx >= absDy * 2) return "═";
    if (absDy >= absDx * 2) return "║";
    return Math.sign(dx) === Math.sign(dy) ? "╲" : "╱";
  }

  if (dx === 0 && dy === 0) return "•";
  if (dx === 0) return "│";
  if (dy === 0) return "─";
  return Math.sign(dx) === Math.sign(dy) ? "╲" : "╱";
}

/** Returns whether a smooth line should use sub-cell Braille rendering for better fidelity. */
function shouldRenderLineAsBraille(start: Point, end: Point, style: LineStyle = "smooth"): boolean {
  if (style !== "smooth") return false;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx !== 0 && dy !== 0 && dx !== dy;
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

/** Returns the squared distance from a sub-cell sample point to a line segment. */
function getDistanceToSegmentSquared(
  point: { x: number; y: number },
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    const offsetX = point.x - start.x;
    const offsetY = point.y - start.y;
    return offsetX * offsetX + offsetY * offsetY;
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  const offsetX = point.x - projectedX;
  const offsetY = point.y - projectedY;
  return offsetX * offsetX + offsetY * offsetY;
}

/**
 * Returns the rendered character map for a line.
 *
 * Smooth lines fall back to Braille cells for shallow and steep diagonals so the terminal output
 * looks much closer to the intended vector line.
 */
export function getLineRenderCharacters(
  start: Point,
  end: Point,
  style: LineStyle = "smooth",
): Map<string, string> {
  const rendered = new Map<string, string>();

  if (!shouldRenderLineAsBraille(start, end, style)) {
    const char = getLineCharacter(start, end, style);
    for (const point of getLinePoints(start.x, start.y, end.x, end.y)) {
      rendered.set(`${point.x},${point.y}`, char);
    }
    return rendered;
  }

  const segmentStart = { x: start.x + 0.5, y: start.y + 0.5 };
  const segmentEnd = { x: end.x + 0.5, y: end.y + 0.5 };
  const thresholdSquared = BRAILLE_LINE_THRESHOLD * BRAILLE_LINE_THRESHOLD;
  const rect = normalizeRect(start, end);

  for (let y = rect.top; y <= rect.bottom; y += 1) {
    for (let x = rect.left; x <= rect.right; x += 1) {
      let mask = 0;

      // Sample each Braille dot position within the cell and light up the dots that are close
      // enough to the intended segment.
      for (let row = 0; row < BRAILLE_Y_OFFSETS.length; row += 1) {
        for (let col = 0; col < BRAILLE_X_OFFSETS.length; col += 1) {
          const point = {
            x: x + BRAILLE_X_OFFSETS[col]!,
            y: y + BRAILLE_Y_OFFSETS[row]!,
          };
          if (getDistanceToSegmentSquared(point, segmentStart, segmentEnd) > thresholdSquared) {
            continue;
          }
          mask |= BRAILLE_DOT_MASKS[row]![col]!;
        }
      }

      if (mask !== 0) {
        rendered.set(`${x},${y}`, String.fromCodePoint(0x2800 + mask));
      }
    }
  }

  if (rendered.size > 0) {
    return rendered;
  }

  const fallbackChar = getLineCharacter(start, end, style);
  for (const point of getLinePoints(start.x, start.y, end.x, end.y)) {
    rendered.set(`${point.x},${point.y}`, fallbackChar);
  }
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
export function getLineRenderCells(start: Point, end: Point, style: LineStyle = "smooth"): Point[] {
  return [...getLineRenderCharacters(start, end, style).keys()].map((key) => pointFromKey(key));
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
