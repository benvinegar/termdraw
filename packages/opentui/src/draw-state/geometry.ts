/**
 * Low-level geometry helpers for draw-state internals.
 *
 * This file covers rectangle normalization, containment/intersection checks, perimeter
 * extraction, and a few tiny math primitives used across selection and transforms.
 */
import type { Point, Rect } from "./types.js";

/** Clamps a numeric value into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Builds a normalized rectangle whose edges are ordered regardless of drag direction. */
export function normalizeRect(start: Point, end: Point): Rect {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };
}

/** Returns whether the point lies within the inclusive rectangle bounds. */
export function rectContainsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Returns the unique perimeter cells for a rectangle.
 *
 * A map is used so degenerate one-cell or one-row rectangles do not emit duplicate points.
 */
export function getRectPerimeterPoints(rect: Rect): Point[] {
  const cells = new Map<string, Point>();
  const add = (x: number, y: number) => {
    cells.set(`${x},${y}`, { x, y });
  };

  for (let x = rect.left; x <= rect.right; x += 1) {
    add(x, rect.top);
    add(x, rect.bottom);
  }
  for (let y = rect.top; y <= rect.bottom; y += 1) {
    add(rect.left, y);
    add(rect.right, y);
  }

  return [...cells.values()];
}

/** Returns whether the rectangle has a non-negative width and height. */
export function isValidRect(rect: Rect): boolean {
  return rect.left <= rect.right && rect.top <= rect.bottom;
}

/** Returns whether `inner` is fully contained inside `outer`. */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  if (!isValidRect(outer)) return false;
  return (
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom
  );
}

/** Returns whether two inclusive rectangles overlap at all. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** Returns the inclusive cell area of a rectangle. */
export function getRectArea(rect: Rect): number {
  return Math.max(0, rect.right - rect.left + 1) * Math.max(0, rect.bottom - rect.top + 1);
}
