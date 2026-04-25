import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import {
  BOX_STYLES,
  DrawState,
  INK_COLORS,
  LINE_STYLES,
  TEXT_BORDER_MODES,
  formatSavedOutput,
  type DrawObject,
  type InkColor,
  type TextBorderMode,
} from "../../opentui/src/index.js";

type JsonRecord = Record<string, unknown>;
type PointTuple = [number, number];
type RectTuple = [number, number, number, number];

export type DiagramCompileOptions = {
  fenced?: boolean;
};

type DiagramDefaults = {
  color: InkColor;
};

type NormalizedDiagram = {
  width: number;
  height: number;
  defaults: DiagramDefaults;
  objects: JsonRecord[];
};

const DEFAULT_COLOR: InkColor = "white";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLineColumn(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, offset);
  const lines = prefix.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function formatParseError(source: string, error: ParseError): string {
  const location = getLineColumn(source, error.offset);
  return `${printParseErrorCode(error.error)} at ${location.line}:${location.column}`;
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function readString(record: JsonRecord, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string") fail(`${path}.${key}`, "expected a string");
  return value;
}

function readOptionalString(record: JsonRecord, key: string, path: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(`${path}.${key}`, "expected a string");
  return value;
}

function readTuple(value: unknown, length: number, path: string): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    fail(path, `expected an array with ${length} numbers`);
  }

  return value.map((entry, index) => {
    if (!Number.isInteger(entry)) fail(`${path}[${index}]`, "expected an integer");
    return entry as number;
  });
}

function readPoint(record: JsonRecord, key: string, path: string): PointTuple {
  return readTuple(record[key], 2, `${path}.${key}`) as PointTuple;
}

function readRect(record: JsonRecord, key: string, path: string): RectTuple {
  return readTuple(record[key], 4, `${path}.${key}`) as RectTuple;
}

function readKnownValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  fallback: T,
): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(path, `expected one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function assertPointInBounds(point: PointTuple, width: number, height: number, path: string): void {
  const [x, y] = point;
  if (x < 0 || x >= width || y < 0 || y >= height) {
    fail(path, `point ${x},${y} is outside ${width}x${height}`);
  }
}

function assertRectInBounds(rect: RectTuple, width: number, height: number, path: string): void {
  const [left, top, right, bottom] = rect;
  if (left > right || top > bottom) {
    fail(path, "expected left <= right and top <= bottom");
  }
  assertPointInBounds([left, top], width, height, `${path}[0..1]`);
  assertPointInBounds([right, bottom], width, height, `${path}[2..3]`);
}

function textWidth(text: string): number {
  return Array.from(text).length;
}

function assertTextInBounds(
  at: PointTuple,
  text: string,
  border: TextBorderMode,
  width: number,
  height: number,
  path: string,
): void {
  const [x, y] = at;
  const contentWidth = Math.max(1, textWidth(text));
  const right = border === "none" ? x + contentWidth - 1 : x + contentWidth + 1;
  const bottom = border === "none" ? y : y + 2;
  assertRectInBounds([x, y, right, bottom], width, height, path);
}

function parseDiagramSource(source: string): NormalizedDiagram {
  const errors: ParseError[] = [];
  const parsed = parse(source, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid JSONC: ${errors.map((error) => formatParseError(source, error)).join("; ")}`,
    );
  }

  if (!isRecord(parsed)) fail("$", "expected an object");
  if (parsed.version !== 1) fail("$.version", "expected version 1");

  const size = readTuple(parsed.size, 2, "$.size");
  const width = size[0]!;
  const height = size[1]!;
  if (width <= 0 || height <= 0) fail("$.size", "expected positive dimensions");

  const defaultsValue = parsed.defaults;
  const defaultsRecord = defaultsValue === undefined ? {} : defaultsValue;
  if (!isRecord(defaultsRecord)) fail("$.defaults", "expected an object");
  const defaults: DiagramDefaults = {
    color: readKnownValue(defaultsRecord.color, INK_COLORS, "$.defaults.color", DEFAULT_COLOR),
  };

  if (!Array.isArray(parsed.objects)) fail("$.objects", "expected an array");
  const objects = parsed.objects.map((object, index) => {
    if (!isRecord(object)) fail(`$.objects[${index}]`, "expected an object");
    return object;
  });

  return {
    width,
    height,
    defaults,
    objects,
  };
}

function normalizeCell(input: string): string {
  return Array.from(input)[0] ?? " ";
}

function createObjectId(record: JsonRecord, index: number, usedIds: Set<string>): string {
  const rawId = record.id;
  if (rawId !== undefined && typeof rawId !== "string") {
    fail(`$.objects[${index}].id`, "expected a string");
  }

  let id = rawId ?? `object-${index + 1}`;
  if (usedIds.has(id)) fail(`$.objects[${index}].id`, `duplicate id "${id}"`);

  usedIds.add(id);
  return id;
}

function createGeneratedObjectId(baseId: string, suffix: string, usedIds: Set<string>): string {
  let id = `${baseId}:${suffix}`;
  let counter = 2;
  while (usedIds.has(id)) {
    id = `${baseId}:${suffix}-${counter}`;
    counter += 1;
  }
  usedIds.add(id);
  return id;
}

function getObjectColor(record: JsonRecord, path: string, defaults: DiagramDefaults): InkColor {
  return readKnownValue(record.color, INK_COLORS, `${path}.color`, defaults.color);
}

function compileObjects(diagram: NormalizedDiagram): DrawObject[] {
  const objects: DrawObject[] = [];
  const usedIds = new Set<string>();
  let z = 1;

  for (const [index, record] of diagram.objects.entries()) {
    const path = `$.objects[${index}]`;
    const type = readString(record, "type", path);
    const id = createObjectId(record, index, usedIds);
    const color = getObjectColor(record, path, diagram.defaults);

    if (type === "box") {
      const rect = readRect(record, "rect", path);
      assertRectInBounds(rect, diagram.width, diagram.height, `${path}.rect`);
      const style = readKnownValue(record.style, BOX_STYLES, `${path}.style`, "auto");
      const [left, top, right, bottom] = rect;

      objects.push({
        id,
        z,
        parentId: null,
        color,
        type: "box",
        left,
        top,
        right,
        bottom,
        style,
      });
      z += 1;

      const label = readOptionalString(record, "text", path);
      if (label !== undefined) {
        const at: PointTuple = [left + 2, top + 1];
        assertTextInBounds(at, label, "none", diagram.width, diagram.height, `${path}.text`);
        objects.push({
          id: createGeneratedObjectId(id, "text", usedIds),
          z,
          parentId: null,
          color,
          type: "text",
          x: at[0],
          y: at[1],
          content: label,
          border: "none",
        });
        z += 1;
      }
      continue;
    }

    if (type === "line") {
      const from = readPoint(record, "from", path);
      const to = readPoint(record, "to", path);
      assertPointInBounds(from, diagram.width, diagram.height, `${path}.from`);
      assertPointInBounds(to, diagram.width, diagram.height, `${path}.to`);
      const style = readKnownValue(record.style, LINE_STYLES, `${path}.style`, "smooth");

      objects.push({
        id,
        z,
        parentId: null,
        color,
        type: "line",
        x1: from[0],
        y1: from[1],
        x2: to[0],
        y2: to[1],
        style,
      });
      z += 1;

      const marker = readOptionalString(record, "marker", path);
      if (marker !== undefined) {
        const markerAt = record.markerAt;
        const at =
          markerAt === undefined || markerAt === "to"
            ? to
            : markerAt === "from"
              ? from
              : (readTuple(markerAt, 2, `${path}.markerAt`) as PointTuple);
        assertTextInBounds(at, marker, "none", diagram.width, diagram.height, `${path}.markerAt`);
        objects.push({
          id: createGeneratedObjectId(id, "marker", usedIds),
          z,
          parentId: null,
          color,
          type: "text",
          x: at[0],
          y: at[1],
          content: normalizeCell(marker),
          border: "none",
        });
        z += 1;
      }
      continue;
    }

    if (type === "paint") {
      const pointsValue = record.points;
      if (!Array.isArray(pointsValue) || pointsValue.length === 0) {
        fail(`${path}.points`, "expected a non-empty point array");
      }
      const points = pointsValue.map((point, pointIndex) => {
        const normalizedPoint = readTuple(point, 2, `${path}.points[${pointIndex}]`) as PointTuple;
        assertPointInBounds(
          normalizedPoint,
          diagram.width,
          diagram.height,
          `${path}.points[${pointIndex}]`,
        );
        return { x: normalizedPoint[0], y: normalizedPoint[1] };
      });

      objects.push({
        id,
        z,
        parentId: null,
        color,
        type: "paint",
        points,
        brush: normalizeCell(readOptionalString(record, "brush", path) ?? "#"),
      });
      z += 1;
      continue;
    }

    if (type === "text") {
      const at = readPoint(record, "at", path);
      const content = readString(record, "text", path);
      const border = readKnownValue(record.border, TEXT_BORDER_MODES, `${path}.border`, "none");
      assertTextInBounds(at, content, border, diagram.width, diagram.height, `${path}.at`);

      objects.push({
        id,
        z,
        parentId: null,
        color,
        type: "text",
        x: at[0],
        y: at[1],
        content,
        border,
      });
      z += 1;
      continue;
    }

    fail(`${path}.type`, "expected box, line, paint, or text");
  }

  return objects;
}

export function renderDiagramSource(source: string): string {
  const diagram = parseDiagramSource(source);
  const state = new DrawState(diagram.width, diagram.height, {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  });
  state.loadObjects(compileObjects(diagram));
  return state.exportArt();
}

export function compileDiagramSource(source: string, options: DiagramCompileOptions = {}): string {
  return formatSavedOutput(renderDiagramSource(source), options.fenced === true);
}
