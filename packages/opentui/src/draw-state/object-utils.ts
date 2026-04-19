/**
 * Object-level draw-state helpers.
 *
 * This file contains cloning, bounds calculation, selection bounds, render-cell expansion,
 * point hit testing, and object translation utilities for the retained scene model.
 */
import { normalizeRect } from "./geometry.js";
import { getLineRenderCells } from "./line.js";
import { getTextRenderRect, getTextSelectionBounds, visibleCellCount } from "../text.js";
import type {
  BoxObject,
  BoxResizeHandle,
  DrawObject,
  LineEndpointHandle,
  LineObject,
  Point,
  Rect,
} from "./types.js";

/** Returns a structural clone of a draw object. */
export function cloneObject(object: DrawObject): DrawObject {
  if (object.type === "paint") {
    return {
      ...object,
      points: object.points.map((point) => ({ ...point })),
    };
  }

  return { ...object };
}

/** Returns structural clones for an object list. */
export function cloneObjects(objects: DrawObject[]): DrawObject[] {
  return objects.map((object) => cloneObject(object));
}

/** Returns the inclusive bounds occupied by an object's content. */
export function getObjectBounds(object: DrawObject): Rect {
  switch (object.type) {
    case "box":
      return { left: object.left, top: object.top, right: object.right, bottom: object.bottom };
    case "line":
      return normalizeRect({ x: object.x1, y: object.y1 }, { x: object.x2, y: object.y2 });
    case "paint": {
      const [firstPoint] = object.points;
      let left = firstPoint?.x ?? 0;
      let right = firstPoint?.x ?? 0;
      let top = firstPoint?.y ?? 0;
      let bottom = firstPoint?.y ?? 0;

      for (const point of object.points) {
        left = Math.min(left, point.x);
        right = Math.max(right, point.x);
        top = Math.min(top, point.y);
        bottom = Math.max(bottom, point.y);
      }

      return { left, top, right, bottom };
    }
    case "text": {
      const width = Math.max(1, visibleCellCount(object.content));
      return {
        left: object.x,
        top: object.y,
        right: object.x + width - 1,
        bottom: object.y,
      };
    }
  }
}

/** Returns the inner content bounds of a box, excluding its border stroke. */
export function getBoxContentBounds(box: BoxObject): Rect {
  return {
    left: box.left + 1,
    top: box.top + 1,
    right: box.right - 1,
    bottom: box.bottom - 1,
  };
}

/** Returns the union bounds for a set of objects, or `null` when empty. */
export function getBoundsUnion(objects: DrawObject[]): Rect | null {
  if (objects.length === 0) return null;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const object of objects) {
    const bounds = getObjectBounds(object);
    left = Math.min(left, bounds.left);
    top = Math.min(top, bounds.top);
    right = Math.max(right, bounds.right);
    bottom = Math.max(bottom, bounds.bottom);
  }

  return { left, top, right, bottom };
}

/** Returns the bounds used when selecting an object. */
export function getObjectSelectionBounds(object: DrawObject): Rect {
  return object.type === "text" ? getTextSelectionBounds(object) : getObjectBounds(object);
}

/** Returns the resize-handle locations for a box. */
export function getBoxCornerPoints(box: BoxObject): Record<BoxResizeHandle, Point> {
  return {
    "top-left": { x: box.left, y: box.top },
    "top-right": { x: box.right, y: box.top },
    "bottom-left": { x: box.left, y: box.bottom },
    "bottom-right": { x: box.right, y: box.bottom },
  };
}

/** Returns the editable endpoint-handle locations for a line. */
export function getLineEndpointPoints(line: LineObject): Record<LineEndpointHandle, Point> {
  return {
    start: { x: line.x1, y: line.y1 },
    end: { x: line.x2, y: line.y2 },
  };
}

/** Returns every rendered cell occupied by an object. */
export function getObjectRenderCells(object: DrawObject): Point[] {
  switch (object.type) {
    case "box": {
      const cells = new Map<string, Point>();
      const add = (x: number, y: number) => {
        cells.set(`${x},${y}`, { x, y });
      };

      for (let x = object.left; x <= object.right; x += 1) {
        add(x, object.top);
        add(x, object.bottom);
      }
      for (let y = object.top; y <= object.bottom; y += 1) {
        add(object.left, y);
        add(object.right, y);
      }

      return [...cells.values()];
    }
    case "line":
      return getLineRenderCells(
        { x: object.x1, y: object.y1 },
        { x: object.x2, y: object.y2 },
        object.style,
      );
    case "paint":
      return object.points.map((point) => ({ ...point }));
    case "text": {
      const rect = getTextRenderRect(object);
      const cells: Point[] = [];
      for (let y = rect.top; y <= rect.bottom; y += 1) {
        for (let x = rect.left; x <= rect.right; x += 1) {
          cells.push({ x, y });
        }
      }
      return cells;
    }
  }
}

/** Returns a translated copy of an object. */
export function translateObject(object: DrawObject, dx: number, dy: number): DrawObject {
  switch (object.type) {
    case "box":
      return {
        ...object,
        left: object.left + dx,
        right: object.right + dx,
        top: object.top + dy,
        bottom: object.bottom + dy,
      };
    case "line":
      return {
        ...object,
        x1: object.x1 + dx,
        x2: object.x2 + dx,
        y1: object.y1 + dy,
        y2: object.y2 + dy,
      };
    case "paint":
      return {
        ...object,
        points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      };
    case "text":
      return {
        ...object,
        x: object.x + dx,
        y: object.y + dy,
      };
  }
}

/** Returns whether an object currently occupies the provided canvas cell. */
export function objectContainsPoint(object: DrawObject, x: number, y: number): boolean {
  switch (object.type) {
    case "box": {
      const withinBounds =
        x >= object.left && x <= object.right && y >= object.top && y <= object.bottom;
      if (!withinBounds) return false;
      return x === object.left || x === object.right || y === object.top || y === object.bottom;
    }
    case "line":
      return getLineRenderCells(
        { x: object.x1, y: object.y1 },
        { x: object.x2, y: object.y2 },
        object.style,
      ).some((point) => point.x === x && point.y === y);
    case "paint":
      return object.points.some((point) => point.x === x && point.y === y);
    case "text":
      return y === object.y && x >= object.x && x < object.x + visibleCellCount(object.content);
  }
}
