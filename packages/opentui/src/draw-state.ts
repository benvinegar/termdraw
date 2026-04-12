import { MouseButton } from "@opentui/core";

export const BRUSHES = ["#", "*", "+", "-", "=", "x", "o", ".", "|", "/", "\\"] as const;
export const BOX_STYLES = ["auto", "light", "heavy", "double"] as const;
export const INK_COLORS = [
  "white",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "magenta",
] as const;
const MAX_HISTORY = 100;
const HANDLE_CHARACTER = "●";

export type DrawMode = "select" | "box" | "line" | "paint" | "text";
export type BoxStyle = (typeof BOX_STYLES)[number];
export type InkColor = (typeof INK_COLORS)[number];
type CanvasGrid = string[][];
type ColorGrid = (InkColor | null)[][];
type Point = { x: number; y: number };
export type CanvasInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
type Rect = { left: number; top: number; right: number; bottom: number };
type ConnectionStyle = "light" | "heavy" | "double";
type Direction = "n" | "e" | "s" | "w";
type DirectionCounts = { light: number; heavy: number; double: number };
type CellConnections = Record<Direction, DirectionCounts>;
type ConnectionGrid = CellConnections[][];
type BoxResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type LineEndpointHandle = "start" | "end";

type BaseDrawObject = {
  id: string;
  z: number;
  parentId: string | null;
  color: InkColor;
};

type BoxObject = BaseDrawObject & {
  type: "box";
  left: number;
  top: number;
  right: number;
  bottom: number;
  style: BoxStyle;
};

type LineObject = BaseDrawObject & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  brush: string;
};

type PaintObject = BaseDrawObject & {
  type: "paint";
  points: Point[];
  brush: string;
};

type TextObject = BaseDrawObject & {
  type: "text";
  x: number;
  y: number;
  content: string;
};

export type DrawObject = BoxObject | LineObject | PaintObject | TextObject;

export type DraftDrawObject =
  | {
      type: "box";
      color?: InkColor;
      left: number;
      top: number;
      right: number;
      bottom: number;
      style?: BoxStyle;
    }
  | {
      type: "line";
      color?: InkColor;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      brush?: string;
    }
  | {
      type: "paint";
      color?: InkColor;
      points: Point[];
      brush?: string;
    }
  | {
      type: "text";
      color?: InkColor;
      x: number;
      y: number;
      content: string;
    };

export type InsertDraftObjectsOptions = {
  anchor?: "cursor" | "center";
  switchToSelectMode?: boolean;
  selectInserted?: boolean;
  statusLabel?: string | null;
};

export type InsertDraftObjectsResult = {
  insertedIds: string[];
  bounds: { left: number; top: number; right: number; bottom: number } | null;
};

type Snapshot = {
  objects: DrawObject[];
  selectedObjectIds: string[];
  selectedObjectId: string | null;
  cursorX: number;
  cursorY: number;
  nextObjectNumber: number;
  nextZIndex: number;
};

type PendingSelection = { start: Point; end: Point };
type PendingBox = { start: Point; end: Point };
type PendingLine = { start: Point; end: Point };
type PendingPaint = { points: Point[]; lastPoint: Point };

type MoveDragState = {
  kind: "move";
  objectId: string;
  startMouse: Point;
  originalObjects: DrawObject[];
  pushedUndo: boolean;
  textEditOnClick: boolean;
};

type ResizeBoxDragState = {
  kind: "resize-box";
  objectId: string;
  startMouse: Point;
  originalObject: BoxObject;
  originalObjects: DrawObject[];
  handle: BoxResizeHandle;
  pushedUndo: boolean;
};

type LineEndpointDragState = {
  kind: "line-endpoint";
  objectId: string;
  startMouse: Point;
  originalObject: LineObject;
  endpoint: LineEndpointHandle;
  pushedUndo: boolean;
};

type DragState = MoveDragState | ResizeBoxDragState | LineEndpointDragState;

type EraseState = {
  erasedIds: Set<string>;
  pushedUndo: boolean;
};

type HandleHit =
  | {
      kind: "box-corner";
      object: BoxObject;
      handle: BoxResizeHandle;
    }
  | {
      kind: "line-endpoint";
      object: LineObject;
      endpoint: LineEndpointHandle;
    };

type ObjectHit = {
  object: DrawObject;
  onTextContent: boolean;
};

export type PointerEventLike = {
  type: "down" | "up" | "drag" | "drag-end" | "scroll" | "move" | "drop" | "over" | "out";
  button: number;
  x: number;
  y: number;
  scrollDirection?: "up" | "down" | "left" | "right";
};

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

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function splitGraphemes(input: string): string[] {
  return Array.from(graphemeSegmenter.segment(input), (segment) => segment.segment);
}

export function truncateToCells(input: string, width: number): string {
  if (width <= 0) return "";
  return splitGraphemes(input).slice(0, width).join("");
}

export function visibleCellCount(input: string): number {
  return splitGraphemes(input).length;
}

export function padToWidth(content: string, width: number): string {
  const clipped = truncateToCells(content, width);
  return clipped + " ".repeat(Math.max(0, width - visibleCellCount(clipped)));
}

function normalizeCellCharacter(input: string): string {
  const first = splitGraphemes(input)[0] ?? " ";
  return first.length > 0 ? first : " ";
}

function createCanvas(width: number, height: number): CanvasGrid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
}

function createColorGrid(width: number, height: number): ColorGrid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
}

function createCellConnections(): CellConnections {
  return {
    n: { light: 0, heavy: 0, double: 0 },
    e: { light: 0, heavy: 0, double: 0 },
    s: { light: 0, heavy: 0, double: 0 },
    w: { light: 0, heavy: 0, double: 0 },
  };
}

function createConnectionGrid(width: number, height: number): ConnectionGrid {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => createCellConnections()),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function normalizeRect(start: Point, end: Point): Rect {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };
}

function rectContainsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getRectPerimeterPoints(rect: Rect): Point[] {
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

function cloneObject(object: DrawObject): DrawObject {
  if (object.type === "paint") {
    return {
      ...object,
      points: object.points.map((point) => ({ ...point })),
    };
  }

  return { ...object };
}

function cloneObjects(objects: DrawObject[]): DrawObject[] {
  return objects.map((object) => cloneObject(object));
}

function adjustConnection(
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

function paintConnectionColor(
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

function applyBoxPerimeter(
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

function getBoxBorderGlyphs(style: ConnectionStyle) {
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

function getLinePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
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

function mergeUniquePoints(existing: Point[], next: Point[]): Point[] {
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

function appendPaintSegment(points: Point[], from: Point, to: Point): Point[] {
  return mergeUniquePoints(points, getLinePoints(from.x, from.y, to.x, to.y));
}

function pointsEqual(a: Point[], b: Point[]): boolean {
  return (
    a.length === b.length &&
    a.every((point, index) => point.x === b[index]?.x && point.y === b[index]?.y)
  );
}

function getObjectBounds(object: DrawObject): Rect {
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

function getBoxContentBounds(box: BoxObject): Rect {
  return {
    left: box.left + 1,
    top: box.top + 1,
    right: box.right - 1,
    bottom: box.bottom - 1,
  };
}

function isValidRect(rect: Rect): boolean {
  return rect.left <= rect.right && rect.top <= rect.bottom;
}

function rectContainsRect(outer: Rect, inner: Rect): boolean {
  if (!isValidRect(outer)) return false;
  return (
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom
  );
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function getRectArea(rect: Rect): number {
  return Math.max(0, rect.right - rect.left + 1) * Math.max(0, rect.bottom - rect.top + 1);
}

function getBoundsUnion(objects: DrawObject[]): Rect | null {
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

function getTextSelectionBounds(object: TextObject): Rect {
  const width = Math.max(1, visibleCellCount(object.content));
  return {
    left: object.x - 1,
    top: object.y - 1,
    right: object.x + width,
    bottom: object.y + 1,
  };
}

function getObjectSelectionBounds(object: DrawObject): Rect {
  return object.type === "text" ? getTextSelectionBounds(object) : getObjectBounds(object);
}

function getBoxCornerPoints(box: BoxObject): Record<BoxResizeHandle, Point> {
  return {
    "top-left": { x: box.left, y: box.top },
    "top-right": { x: box.right, y: box.top },
    "bottom-left": { x: box.left, y: box.bottom },
    "bottom-right": { x: box.right, y: box.bottom },
  };
}

function getLineEndpointPoints(line: LineObject): Record<LineEndpointHandle, Point> {
  return {
    start: { x: line.x1, y: line.y1 },
    end: { x: line.x2, y: line.y2 },
  };
}

function getObjectRenderCells(object: DrawObject): Point[] {
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
      return getLinePoints(object.x1, object.y1, object.x2, object.y2);
    case "paint":
      return object.points.map((point) => ({ ...point }));
    case "text":
      return splitGraphemes(object.content).map((_, index) => ({
        x: object.x + index,
        y: object.y,
      }));
  }
}

function translateObject(object: DrawObject, dx: number, dy: number): DrawObject {
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

function objectContainsPoint(object: DrawObject, x: number, y: number): boolean {
  switch (object.type) {
    case "box": {
      const withinBounds =
        x >= object.left && x <= object.right && y >= object.top && y <= object.bottom;
      if (!withinBounds) return false;
      return x === object.left || x === object.right || y === object.top || y === object.bottom;
    }
    case "line":
      return getLinePoints(object.x1, object.y1, object.x2, object.y2).some(
        (point) => point.x === x && point.y === y,
      );
    case "paint":
      return object.points.some((point) => point.x === x && point.y === y);
    case "text":
      return y === object.y && x >= object.x && x < object.x + visibleCellCount(object.content);
  }
}

const DEFAULT_CANVAS_INSETS: CanvasInsets = {
  left: 1,
  top: 3,
  right: 1,
  bottom: 2,
};

export class DrawState {
  private canvasInsets: CanvasInsets = { ...DEFAULT_CANVAS_INSETS };

  private canvasWidth = 0;
  private canvasHeight = 0;

  private cursorX = 0;
  private cursorY = 0;

  private mode: DrawMode = "line";
  private brush = BRUSHES[0] as string;
  private brushIndex = 0;
  private boxStyle = BOX_STYLES[0] as BoxStyle;
  private boxStyleIndex = 0;
  private inkColor = INK_COLORS[0] as InkColor;
  private inkColorIndex = 0;

  private objects: DrawObject[] = [];
  private selectedObjectIds: string[] = [];
  private selectedObjectId: string | null = null;
  private activeTextObjectId: string | null = null;

  private pendingSelection: PendingSelection | null = null;
  private pendingLine: PendingLine | null = null;
  private pendingBox: PendingBox | null = null;
  private pendingPaint: PendingPaint | null = null;
  private dragState: DragState | null = null;
  private eraseState: EraseState | null = null;

  private nextObjectNumber = 1;
  private nextZIndex = 1;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private status =
    "Line mode: drag on empty space to create a line object, or drag an existing object to move it.";

  private sceneDirty = true;
  private renderCanvas: CanvasGrid = [];
  private renderCanvasColors: ColorGrid = [];
  private renderConnections: ConnectionGrid = [];
  private renderConnectionColors: ColorGrid = [];

  constructor(viewWidth: number, viewHeight: number, insets: CanvasInsets = DEFAULT_CANVAS_INSETS) {
    this.ensureCanvasSize(viewWidth, viewHeight, insets);
  }

  public get currentMode(): DrawMode {
    return this.mode;
  }

  public get currentBrush(): string {
    return this.brush;
  }

  public get currentBoxStyle(): BoxStyle {
    return this.boxStyle;
  }

  public get currentInkColor(): InkColor {
    return this.inkColor;
  }

  public get currentStatus(): string {
    return this.status;
  }

  public get currentCursorX(): number {
    return this.cursorX;
  }

  public get currentCursorY(): number {
    return this.cursorY;
  }

  public get width(): number {
    return this.canvasWidth;
  }

  public get height(): number {
    return this.canvasHeight;
  }

  public get canvasTopRow(): number {
    return this.canvasInsets.top;
  }

  public get canvasLeftCol(): number {
    return this.canvasInsets.left;
  }

  public get hasSelectedObject(): boolean {
    return this.selectedObjectIds.length > 0;
  }

  public get isEditingText(): boolean {
    return this.getActiveTextObject() !== null;
  }

  public get hasActivePointerInteraction(): boolean {
    return (
      this.pendingSelection !== null ||
      this.pendingLine !== null ||
      this.pendingBox !== null ||
      this.pendingPaint !== null ||
      this.dragState !== null ||
      this.eraseState !== null
    );
  }

  public ensureCanvasSize(
    viewWidth: number,
    viewHeight: number,
    insets: CanvasInsets = this.canvasInsets,
  ): void {
    const nextInsets = { ...insets };
    const nextCanvasWidth = Math.max(1, viewWidth - nextInsets.left - nextInsets.right);
    const nextCanvasHeight = Math.max(1, viewHeight - nextInsets.top - nextInsets.bottom);

    if (
      nextCanvasWidth === this.canvasWidth &&
      nextCanvasHeight === this.canvasHeight &&
      nextInsets.left === this.canvasInsets.left &&
      nextInsets.top === this.canvasInsets.top &&
      nextInsets.right === this.canvasInsets.right &&
      nextInsets.bottom === this.canvasInsets.bottom
    ) {
      return;
    }

    this.canvasInsets = nextInsets;
    this.canvasWidth = nextCanvasWidth;
    this.canvasHeight = nextCanvasHeight;
    this.cursorX = Math.max(0, Math.min(this.cursorX, this.canvasWidth - 1));
    this.cursorY = Math.max(0, Math.min(this.cursorY, this.canvasHeight - 1));

    this.setObjects(this.objects.map((object) => this.shiftObjectInsideCanvas(object)));
    this.pendingSelection = null;
    this.pendingLine = null;
    this.pendingBox = null;
    this.pendingPaint = null;
    this.dragState = null;
    this.eraseState = null;
  }

  public handlePointerEvent(event: PointerEventLike): void {
    if (event.type === "scroll") {
      const direction =
        event.scrollDirection === "down" || event.scrollDirection === "left" ? -1 : 1;

      if (this.mode === "line" || this.mode === "paint") {
        this.cycleBrush(direction);
      } else if (this.mode === "box") {
        this.cycleBoxStyle(direction);
      }
      return;
    }

    const canvasX = event.x - this.canvasLeftCol;
    const canvasY = event.y - this.canvasTopRow;
    const clampedX = clamp(canvasX, 0, this.canvasWidth - 1);
    const clampedY = clamp(canvasY, 0, this.canvasHeight - 1);
    const insideCanvas = this.isInsideCanvas(canvasX, canvasY);
    const point = { x: clampedX, y: clampedY };

    if (event.type === "up" || event.type === "drag-end") {
      this.finishPointerInteraction(point, insideCanvas);
      return;
    }

    if (event.type === "drag") {
      this.cursorX = clampedX;
      this.cursorY = clampedY;

      if (this.dragState) {
        this.updateDraggedObject(point);
        return;
      }

      if (this.pendingSelection) {
        this.pendingSelection.end = point;
        this.setStatus(
          `Selecting ${this.describeRect(normalizeRect(this.pendingSelection.start, this.pendingSelection.end))}.`,
        );
        return;
      }

      if (this.pendingBox) {
        this.pendingBox.end = point;
        this.setStatus(
          `Sizing box ${this.describeRect(normalizeRect(this.pendingBox.start, this.pendingBox.end))}.`,
        );
        return;
      }

      if (this.pendingLine) {
        this.pendingLine.end = point;
        this.setStatus(`Sizing line to ${point.x + 1},${point.y + 1}.`);
        return;
      }

      if (this.pendingPaint) {
        this.pendingPaint.points = appendPaintSegment(
          this.pendingPaint.points,
          this.pendingPaint.lastPoint,
          point,
        );
        this.pendingPaint.lastPoint = point;
        this.setStatus(`Painting to ${point.x + 1},${point.y + 1}.`);
        return;
      }

      if (insideCanvas && this.eraseState) {
        this.eraseObjectAt(point.x, point.y);
      }
      return;
    }

    if (event.type !== "down") {
      return;
    }

    if (!insideCanvas) {
      if (event.button === MouseButton.LEFT) {
        this.setSelectedObjects([]);
        this.activeTextObjectId = null;
        this.setStatus("Selection cleared.");
      }
      return;
    }

    this.cursorX = canvasX;
    this.cursorY = canvasY;

    if (event.button === MouseButton.RIGHT) {
      this.beginEraseSession();
      this.eraseObjectAt(canvasX, canvasY);
      return;
    }

    if (this.tryBeginObjectInteraction(canvasX, canvasY)) {
      return;
    }

    switch (this.mode) {
      case "select":
        this.activeTextObjectId = null;
        this.pendingSelection = {
          start: { x: canvasX, y: canvasY },
          end: { x: canvasX, y: canvasY },
        };
        this.setStatus(
          `Selection start at ${canvasX + 1},${canvasY + 1}. Drag to select multiple objects.`,
        );
        return;
      case "box":
        this.setSelectedObjects([]);
        this.activeTextObjectId = null;
        this.pendingBox = {
          start: { x: canvasX, y: canvasY },
          end: { x: canvasX, y: canvasY },
        };
        this.setStatus(
          `Box start at ${canvasX + 1},${canvasY + 1}. Drag to size, release to commit.`,
        );
        return;
      case "line":
        this.setSelectedObjects([]);
        this.activeTextObjectId = null;
        this.pendingLine = {
          start: { x: canvasX, y: canvasY },
          end: { x: canvasX, y: canvasY },
        };
        this.setStatus(
          `Line start at ${canvasX + 1},${canvasY + 1}. Drag to endpoint, release to commit.`,
        );
        return;
      case "paint":
        this.setSelectedObjects([]);
        this.activeTextObjectId = null;
        this.pendingPaint = {
          points: [{ x: canvasX, y: canvasY }],
          lastPoint: { x: canvasX, y: canvasY },
        };
        this.setStatus(`Paint start at ${canvasX + 1},${canvasY + 1}. Drag to paint.`);
        return;
      case "text":
        this.placeTextCursor(canvasX, canvasY);
        return;
    }
  }

  public getModeLabel(): string {
    switch (this.mode) {
      case "select":
        return "SELECT";
      case "line":
        return "LINE";
      case "box":
        return "BOX";
      case "paint":
        return "PAINT";
      case "text":
        return "TEXT";
    }
  }

  public getActivePreviewCharacters(): Map<string, string> {
    if (this.pendingPaint) return this.getPaintPreviewCharacters();
    if (this.pendingLine) return this.getLinePreviewCharacters();
    if (this.pendingBox) return this.getBoxPreviewCharacters();
    return new Map<string, string>();
  }

  public getSelectedCellKeys(): Set<string> {
    const keys = new Set<string>();

    for (const selected of this.getSelectedObjects()) {
      for (const point of getObjectRenderCells(selected)) {
        if (!this.isInsideCanvas(point.x, point.y)) continue;
        keys.add(`${point.x},${point.y}`);
      }

      if (selected.type === "text") {
        for (const point of getRectPerimeterPoints(getTextSelectionBounds(selected))) {
          if (!this.isInsideCanvas(point.x, point.y)) continue;
          keys.add(`${point.x},${point.y}`);
        }
      }
    }

    return keys;
  }

  public getSelectionMarqueeCharacters(): Map<string, string> {
    const marquee = new Map<string, string>();
    if (!this.pendingSelection) return marquee;

    const rect = normalizeRect(this.pendingSelection.start, this.pendingSelection.end);
    for (const point of getRectPerimeterPoints(rect)) {
      if (!this.isInsideCanvas(point.x, point.y)) continue;
      marquee.set(`${point.x},${point.y}`, "·");
    }

    return marquee;
  }

  public getSelectionHandleCharacters(): Map<string, string> {
    const handles = new Map<string, string>();

    if (this.selectedObjectIds.length !== 1) return handles;

    const selected = this.getSelectedObject();
    if (!selected) return handles;

    if (selected.type === "box") {
      for (const point of Object.values(getBoxCornerPoints(selected))) {
        if (!this.isInsideCanvas(point.x, point.y)) continue;
        handles.set(`${point.x},${point.y}`, HANDLE_CHARACTER);
      }
      return handles;
    }

    if (selected.type === "line") {
      for (const point of Object.values(getLineEndpointPoints(selected))) {
        if (!this.isInsideCanvas(point.x, point.y)) continue;
        handles.set(`${point.x},${point.y}`, HANDLE_CHARACTER);
      }
    }

    return handles;
  }

  public clearSelection(): boolean {
    const hadSelection = this.selectedObjectIds.length > 0 || this.activeTextObjectId !== null;
    this.setSelectedObjects([]);
    this.activeTextObjectId = null;
    this.setStatus(hadSelection ? "Selection cleared." : "Nothing selected.");
    return hadSelection;
  }

  public getCompositeCell(x: number, y: number): string {
    this.ensureScene();
    const ink = this.renderCanvas[y]![x] ?? " ";
    if (ink !== " ") return ink;
    return this.getConnectionGlyph(x, y);
  }

  public getCompositeColor(x: number, y: number): InkColor | null {
    this.ensureScene();
    const ink = this.renderCanvas[y]![x] ?? " ";
    if (ink !== " ") {
      return this.renderCanvasColors[y]![x] ?? null;
    }

    return this.getConnectionGlyph(x, y) === " "
      ? null
      : (this.renderConnectionColors[y]![x] ?? null);
  }

  public moveCursor(dx: number, dy: number): void {
    this.cursorX = Math.max(0, Math.min(this.canvasWidth - 1, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.canvasHeight - 1, this.cursorY + dy));
    if (this.mode === "text") {
      this.activeTextObjectId = null;
    }
    this.setStatus(`Cursor ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public moveSelectedObjectBy(dx: number, dy: number): void {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) {
      this.setStatus("No object selected.");
      return;
    }

    const selectedTree = this.getSelectedObjectTrees();
    const movedTree = this.translateObjectTreeWithinCanvas(selectedTree, dx, dy);
    if (this.objectListsEqual(movedTree, selectedTree)) {
      this.setStatus(
        selected.length === 1
          ? `${this.describeObject(selected[0]!)} is already at the edge.`
          : "Selection is already at the edge.",
      );
      return;
    }

    this.pushUndo();
    this.replaceObjects(movedTree);
    this.activeTextObjectId = null;
    this.setStatus(
      selected.length === 1
        ? `Moved ${this.describeObject(selected[0]!)}.`
        : `Moved ${selected.length} objects.`,
    );
  }

  public setBrush(char: string): void {
    this.brush = normalizeCellCharacter(char);
    const idx = BRUSHES.indexOf(this.brush as (typeof BRUSHES)[number]);
    this.brushIndex = idx >= 0 ? idx : 0;
    this.setStatus(`Brush set to "${this.brush}".`);
  }

  public cycleBrush(direction: 1 | -1): void {
    this.brushIndex = (this.brushIndex + direction + BRUSHES.length) % BRUSHES.length;
    this.brush = BRUSHES[this.brushIndex] ?? this.brush;
    this.setStatus(`Brush set to "${this.brush}".`);
  }

  public setInkColor(color: InkColor): void {
    this.inkColor = color;
    const idx = INK_COLORS.indexOf(color);
    this.inkColorIndex = idx >= 0 ? idx : 0;

    const selected = this.getSelectedObjects();
    const recolorable = selected.filter((object) => object.color !== color);
    if (recolorable.length === 0) {
      this.setStatus(`Color set to ${this.describeInkColor(color)}.`);
      return;
    }

    this.pushUndo();
    this.replaceObjects(recolorable.map((object) => ({ ...object, color })));
    this.setStatus(
      recolorable.length === 1
        ? `Applied ${this.describeInkColor(color)} to ${this.describeObject(recolorable[0]!)}.`
        : `Applied ${this.describeInkColor(color)} to ${recolorable.length} objects.`,
    );
  }

  public cycleInkColor(direction: 1 | -1): void {
    this.inkColorIndex = (this.inkColorIndex + direction + INK_COLORS.length) % INK_COLORS.length;
    this.inkColor = INK_COLORS[this.inkColorIndex] ?? this.inkColor;
    this.setStatus(`Color set to ${this.describeInkColor(this.inkColor)}.`);
  }

  public setBoxStyle(style: BoxStyle): void {
    this.boxStyle = style;
    const idx = BOX_STYLES.indexOf(style);
    this.boxStyleIndex = idx >= 0 ? idx : 0;
    this.setStatus(`Box style set to ${this.describeBoxStyle(style)}.`);
  }

  public cycleBoxStyle(direction: 1 | -1): void {
    this.boxStyleIndex = (this.boxStyleIndex + direction + BOX_STYLES.length) % BOX_STYLES.length;
    this.boxStyle = BOX_STYLES[this.boxStyleIndex] ?? this.boxStyle;
    this.setStatus(`Box style set to ${this.describeBoxStyle(this.boxStyle)}.`);
  }

  public cycleMode(): void {
    const order: DrawMode[] = ["select", "box", "line", "paint", "text"];
    const currentIndex = order.indexOf(this.mode);
    const next = order[(currentIndex + 1) % order.length] ?? "line";
    this.setMode(next);
  }

  public setMode(next: DrawMode): void {
    if (this.mode === next) return;
    this.mode = next;
    this.pendingSelection = null;
    this.pendingLine = null;
    this.pendingBox = null;
    this.pendingPaint = null;
    this.dragState = null;
    this.eraseState = null;
    if (next !== "text") {
      this.activeTextObjectId = null;
    }

    if (next === "select") {
      this.setStatus(
        "Select mode: click objects to select them, drag selected objects to move them, or drag empty space to marquee-select multiple objects.",
      );
    } else if (next === "line") {
      this.setStatus(
        "Line mode: drag on empty space to create a line. Click objects to move them, or line endpoints to adjust.",
      );
    } else if (next === "box") {
      this.setStatus(
        `Box mode (${this.describeBoxStyle(this.boxStyle)}): drag on empty space to create a box. Click objects to move them, or drag box corners to resize.`,
      );
    } else if (next === "paint") {
      this.setStatus(
        "Paint mode: drag on empty space to paint. Click objects to move them, and use the current brush for freehand strokes.",
      );
    } else {
      this.setStatus(
        "Text mode: click empty space to type, click text to edit, and use its virtual selection box to move it.",
      );
    }
  }

  public insertDraftObjects(
    drafts: DraftDrawObject[],
    options: InsertDraftObjectsOptions = {},
  ): InsertDraftObjectsResult {
    if (drafts.length === 0) {
      if (options.statusLabel !== null) {
        this.setStatus("Nothing to insert.");
      }
      return { insertedIds: [], bounds: null };
    }

    const materialized = drafts.map((draft) => this.materializeDraftObject(draft));
    const originalBounds = getBoundsUnion(materialized);
    if (!originalBounds) {
      if (options.statusLabel !== null) {
        this.setStatus("Nothing to insert.");
      }
      return { insertedIds: [], bounds: null };
    }

    const anchor = options.anchor ?? "cursor";
    const desiredLeft =
      anchor === "center"
        ? Math.max(
            0,
            Math.floor((this.canvasWidth - (originalBounds.right - originalBounds.left + 1)) / 2),
          )
        : this.cursorX;
    const desiredTop =
      anchor === "center"
        ? Math.max(
            0,
            Math.floor((this.canvasHeight - (originalBounds.bottom - originalBounds.top + 1)) / 2),
          )
        : this.cursorY;
    const translated = this.translateObjectTreeWithinCanvas(
      materialized,
      desiredLeft - originalBounds.left,
      desiredTop - originalBounds.top,
    );
    const bounds = getBoundsUnion(translated);

    this.pushUndo();
    this.setObjects([...this.objects, ...translated]);
    this.activeTextObjectId = null;

    if (options.selectInserted ?? true) {
      const insertedIds = translated.map((object) => object.id);
      this.setSelectedObjects(insertedIds, insertedIds.at(-1) ?? null);
    }

    if (options.switchToSelectMode ?? true) {
      this.setMode("select");
    }

    if (options.statusLabel !== null) {
      this.setStatus(
        options.statusLabel?.trim()
          ? `Inserted ${options.statusLabel}.`
          : translated.length === 1
            ? `Inserted ${this.describeObject(translated[0]!)}.`
            : `Inserted ${translated.length} objects.`,
      );
    }

    return {
      insertedIds: translated.map((object) => object.id),
      bounds,
    };
  }

  public stampBrushAtCursor(): void {
    this.pushUndo();

    if (this.mode === "paint") {
      const object: PaintObject = {
        id: this.createObjectId(),
        z: this.allocateZIndex(),
        parentId: null,
        color: this.inkColor,
        type: "paint",
        points: [{ x: this.cursorX, y: this.cursorY }],
        brush: this.brush,
      };
      this.setObjects([...this.objects, object]);
      this.setSelectedObjects([object.id], object.id);
      this.activeTextObjectId = null;
      this.setStatus(`Painted "${this.brush}" at ${this.cursorX + 1},${this.cursorY + 1}.`);
      return;
    }

    const object: LineObject = {
      id: this.createObjectId(),
      z: this.allocateZIndex(),
      parentId: null,
      color: this.inkColor,
      type: "line",
      x1: this.cursorX,
      y1: this.cursorY,
      x2: this.cursorX,
      y2: this.cursorY,
      brush: this.brush,
    };
    this.setObjects([...this.objects, object]);
    this.setSelectedObjects([object.id], object.id);
    this.activeTextObjectId = null;
    this.setStatus(`Stamped "${this.brush}" at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public eraseAtCursor(): void {
    if (this.deleteTopmostObjectAt(this.cursorX, this.cursorY)) return;
    this.setStatus(`Nothing to erase at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public insertCharacter(input: string): void {
    const char = normalizeCellCharacter(input);
    this.pushUndo();

    const activeObject = this.getActiveTextObject();
    if (activeObject) {
      const updated: TextObject = {
        ...activeObject,
        content: activeObject.content + char,
      };
      this.replaceObject(updated);
      this.setSelectedObjects([updated.id], updated.id);
      this.activeTextObjectId = updated.id;
      this.cursorX = Math.min(this.canvasWidth - 1, updated.x + visibleCellCount(updated.content));
      this.cursorY = updated.y;
      this.setStatus(`Appended "${char}" to ${this.describeObject(updated)}.`);
      return;
    }

    const object: TextObject = {
      id: this.createObjectId(),
      z: this.allocateZIndex(),
      parentId: null,
      color: this.inkColor,
      type: "text",
      x: this.cursorX,
      y: this.cursorY,
      content: char,
    };
    this.setObjects([...this.objects, object]);
    this.setSelectedObjects([object.id], object.id);
    this.activeTextObjectId = object.id;
    this.cursorX = Math.min(this.canvasWidth - 1, this.cursorX + 1);
    this.setStatus(`Created ${this.describeObject(this.getObjectById(object.id) ?? object)}.`);
  }

  public backspace(): void {
    const activeObject = this.getActiveTextObject();
    if (!activeObject) {
      if (this.deleteTopmostObjectAt(this.cursorX, this.cursorY)) return;
      this.setStatus(`Nothing to backspace at ${this.cursorX + 1},${this.cursorY + 1}.`);
      return;
    }

    this.pushUndo();
    const parts = splitGraphemes(activeObject.content);
    parts.pop();

    if (parts.length === 0) {
      this.removeObjectById(activeObject.id);
      this.setSelectedObjects([]);
      this.activeTextObjectId = null;
      this.cursorX = activeObject.x;
      this.cursorY = activeObject.y;
      this.setStatus(`Removed ${this.describeObject(activeObject)}.`);
      return;
    }

    const updated: TextObject = {
      ...activeObject,
      content: parts.join(""),
    };
    this.replaceObject(updated);
    this.setSelectedObjects([updated.id], updated.id);
    this.activeTextObjectId = updated.id;
    this.cursorX = Math.min(this.canvasWidth - 1, updated.x + visibleCellCount(updated.content));
    this.cursorY = updated.y;
    this.setStatus(`Backspaced ${this.describeObject(updated)}.`);
  }

  public deleteAtCursor(): void {
    if (this.deleteSelectedObject()) return;
    if (this.deleteTopmostObjectAt(this.cursorX, this.cursorY)) return;
    this.setStatus(`Nothing to delete at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public deleteSelectedObject(): boolean {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return false;

    this.pushUndo();
    const selectedIds = new Set(selected.map((object) => object.id));
    this.setObjects(this.objects.filter((object) => !selectedIds.has(object.id)));
    this.setSelectedObjects([]);
    this.activeTextObjectId = null;
    this.setStatus(
      selected.length === 1
        ? `Deleted ${this.describeObject(selected[0]!)}.`
        : `Deleted ${selected.length} objects.`,
    );
    return true;
  }

  public clearCanvas(): void {
    if (this.objects.length === 0) {
      this.setStatus("Canvas already clear.");
      return;
    }

    this.pushUndo();
    this.setObjects([]);
    this.setSelectedObjects([]);
    this.activeTextObjectId = null;
    this.pendingSelection = null;
    this.pendingLine = null;
    this.pendingBox = null;
    this.pendingPaint = null;
    this.dragState = null;
    this.eraseState = null;
    this.markSceneDirty();
    this.setStatus("Canvas cleared.");
  }

  public undo(): void {
    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      this.setStatus("Nothing to undo.");
      return;
    }

    this.redoStack.push(this.createSnapshot());
    if (this.redoStack.length > MAX_HISTORY) {
      this.redoStack.shift();
    }

    this.restoreSnapshot(snapshot);
    this.setStatus("Undid last change.");
  }

  public redo(): void {
    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      this.setStatus("Nothing to redo.");
      return;
    }

    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }

    this.restoreSnapshot(snapshot);
    this.setStatus("Redid change.");
  }

  public exportArt(): string {
    this.ensureScene();
    const lines: string[] = [];

    for (let y = 0; y < this.canvasHeight; y += 1) {
      let row = "";
      for (let x = 0; x < this.canvasWidth; x += 1) {
        const ink = this.renderCanvas[y]![x] ?? " ";
        row += ink !== " " ? ink : this.getConnectionGlyph(x, y);
      }
      lines.push(row.replace(/\s+$/g, ""));
    }

    while (lines.length > 0 && (lines[0] ?? "") === "") {
      lines.shift();
    }
    while (lines.length > 0 && (lines[lines.length - 1] ?? "") === "") {
      lines.pop();
    }

    return lines.join("\n");
  }

  private tryBeginObjectInteraction(x: number, y: number): boolean {
    this.activeTextObjectId = null;

    const handleHit = this.findTopmostHandleAt(x, y);
    if (handleHit) {
      this.setSelectedObjects([handleHit.object.id], handleHit.object.id);
      if (handleHit.kind === "box-corner") {
        this.dragState = {
          kind: "resize-box",
          objectId: handleHit.object.id,
          startMouse: { x, y },
          originalObject: { ...handleHit.object },
          originalObjects: cloneObjects(this.getObjectTree(handleHit.object.id)),
          handle: handleHit.handle,
          pushedUndo: false,
        };
        this.setStatus(`Selected ${this.describeObject(handleHit.object)}. Drag corner to resize.`);
        return true;
      }

      this.dragState = {
        kind: "line-endpoint",
        objectId: handleHit.object.id,
        startMouse: { x, y },
        originalObject: { ...handleHit.object },
        endpoint: handleHit.endpoint,
        pushedUndo: false,
      };
      this.setStatus(
        `Selected ${this.describeObject(handleHit.object)}. Drag endpoint to adjust it.`,
      );
      return true;
    }

    const hit = this.findTopmostObjectHitAt(x, y);
    if (!hit) return false;

    this.beginMoveInteraction(
      hit.object,
      x,
      y,
      this.mode === "text" && hit.object.type === "text" && hit.onTextContent,
    );
    return true;
  }

  private beginMoveInteraction(
    object: DrawObject,
    x: number,
    y: number,
    textEditOnClick: boolean,
  ): void {
    const selectionIds =
      this.isObjectSelected(object.id) && this.selectedObjectIds.length > 0
        ? this.selectedObjectIds
        : [object.id];
    const moveSelection = this.getMoveSelectionForObject(object);
    const movingMultiple = selectionIds.length > 1;

    this.setSelectedObjects(selectionIds, object.id);
    this.activeTextObjectId = null;
    this.dragState = {
      kind: "move",
      objectId: object.id,
      startMouse: { x, y },
      originalObjects: cloneObjects(moveSelection),
      pushedUndo: false,
      textEditOnClick: textEditOnClick && selectionIds.length === 1,
    };
    this.setStatus(
      movingMultiple
        ? `Selected ${selectionIds.length} objects. Drag to move them.`
        : `Selected ${this.describeObject(object)}. Drag to move it.`,
    );
  }

  private placeTextCursor(x: number, y: number): void {
    this.setSelectedObjects([]);
    this.activeTextObjectId = null;
    this.setStatus(`Text cursor ${x + 1},${y + 1}.`);
  }

  private beginEraseSession(): void {
    this.pendingSelection = null;
    this.pendingLine = null;
    this.pendingBox = null;
    this.pendingPaint = null;
    this.dragState = null;
    this.activeTextObjectId = null;
    this.eraseState = {
      erasedIds: new Set<string>(),
      pushedUndo: false,
    };
  }

  private finishPointerInteraction(point: Point, insideCanvas: boolean): void {
    if (this.pendingSelection) {
      const rect = normalizeRect(this.pendingSelection.start, this.pendingSelection.end);
      this.pendingSelection = null;

      if (rect.left === rect.right && rect.top === rect.bottom) {
        this.setSelectedObjects([]);
        this.setStatus(`Selection cleared at ${rect.left + 1},${rect.top + 1}.`);
        return;
      }

      const selected = this.getObjectsWithinSelectionRect(rect);
      this.setSelectedObjects(
        selected.map((object) => object.id),
        selected.at(-1)?.id ?? null,
      );
      this.activeTextObjectId = null;
      this.setStatus(
        selected.length === 0
          ? `No objects in ${this.describeRect(rect)}.`
          : selected.length === 1
            ? `Selected ${this.describeObject(selected[0]!)}.`
            : `Selected ${selected.length} objects.`,
      );
      return;
    }

    if (this.pendingBox) {
      const rect = normalizeRect(this.pendingBox.start, this.pendingBox.end);
      this.pendingBox = null;
      if (rect.left === rect.right && rect.top === rect.bottom) {
        this.setStatus("Ignored zero-size box.");
        return;
      }

      this.pushUndo();
      const object: BoxObject = {
        id: this.createObjectId(),
        z: this.allocateZIndex(),
        parentId: null,
        color: this.inkColor,
        type: "box",
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        style: this.boxStyle,
      };
      this.setObjects([...this.objects, object]);
      this.setSelectedObjects([object.id], object.id);
      this.setStatus(`Created ${this.describeObject(this.getObjectById(object.id) ?? object)}.`);
      return;
    }

    if (this.pendingLine) {
      const start = this.pendingLine.start;
      const end = this.pendingLine.end;
      this.pendingLine = null;

      if (start.x === end.x && start.y === end.y) {
        this.setStatus(`Line cancelled at ${start.x + 1},${start.y + 1}.`);
        return;
      }

      this.pushUndo();
      const object: LineObject = {
        id: this.createObjectId(),
        z: this.allocateZIndex(),
        parentId: null,
        color: this.inkColor,
        type: "line",
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        brush: this.brush,
      };
      this.setObjects([...this.objects, object]);
      this.setSelectedObjects([object.id], object.id);
      this.setStatus(`Created ${this.describeObject(this.getObjectById(object.id) ?? object)}.`);
      return;
    }

    if (this.pendingPaint) {
      const points = this.pendingPaint.points.map((pointEntry) => ({ ...pointEntry }));
      this.pendingPaint = null;

      this.pushUndo();
      const object: PaintObject = {
        id: this.createObjectId(),
        z: this.allocateZIndex(),
        parentId: null,
        color: this.inkColor,
        type: "paint",
        points,
        brush: this.brush,
      };
      this.setObjects([...this.objects, object]);
      this.setSelectedObjects([object.id], object.id);
      this.setStatus(`Created ${this.describeObject(this.getObjectById(object.id) ?? object)}.`);
      return;
    }

    if (this.dragState) {
      const dragState = this.dragState;
      this.dragState = null;
      const object = this.getObjectById(dragState.objectId);

      if (!dragState.pushedUndo) {
        if (dragState.kind === "move" && dragState.textEditOnClick && object?.type === "text") {
          this.setSelectedObjects([object.id], object.id);
          this.activeTextObjectId = object.id;
          this.cursorX = Math.min(
            this.canvasWidth - 1,
            object.x + visibleCellCount(object.content),
          );
          this.cursorY = object.y;
          this.setStatus(`Editing ${this.describeObject(object)}.`);
          return;
        }

        if (object) {
          this.setStatus(
            dragState.kind === "move" && this.selectedObjectIds.length > 1
              ? `Selected ${this.selectedObjectIds.length} objects.`
              : `Selected ${this.describeObject(object)}.`,
          );
        }
        return;
      }

      if (object) {
        if (dragState.kind === "resize-box") {
          this.setStatus(`Resized ${this.describeObject(object)}.`);
        } else if (dragState.kind === "line-endpoint") {
          this.setStatus(`Adjusted ${this.describeObject(object)}.`);
        } else if (this.selectedObjectIds.length > 1) {
          this.setStatus(`Moved ${this.selectedObjectIds.length} objects.`);
        } else {
          this.setStatus(`Moved ${this.describeObject(object)}.`);
        }
      }
      return;
    }

    if (this.eraseState) {
      this.eraseState = null;
      if (!insideCanvas) {
        this.setStatus(`Cursor ${point.x + 1},${point.y + 1}.`);
      }
    }
  }

  private updateDraggedObject(point: Point): void {
    const dragState = this.dragState;
    if (!dragState) return;

    let nextObjects: DrawObject[];
    let nextObject: DrawObject;

    switch (dragState.kind) {
      case "move": {
        const dx = point.x - dragState.startMouse.x;
        const dy = point.y - dragState.startMouse.y;
        nextObjects = this.translateObjectTreeWithinCanvas(dragState.originalObjects, dx, dy);
        nextObject = nextObjects.find((object) => object.id === dragState.objectId)!;
        break;
      }
      case "resize-box":
        nextObjects = this.resizeObjectTreeWithinCanvas(
          dragState.originalObjects,
          dragState.originalObject,
          dragState.handle,
          point,
        );
        nextObject = nextObjects.find((object) => object.id === dragState.objectId)!;
        break;
      case "line-endpoint":
        nextObject = this.adjustLineEndpointWithinCanvas(
          dragState.originalObject,
          dragState.endpoint,
          point,
        );
        nextObjects = [nextObject];
        break;
    }

    const changed =
      dragState.kind === "move"
        ? !this.objectListsEqual(nextObjects, dragState.originalObjects)
        : dragState.kind === "resize-box"
          ? !this.objectListsEqual(nextObjects, dragState.originalObjects)
          : !this.objectsEqual(nextObject, dragState.originalObject);

    if (!dragState.pushedUndo && changed) {
      this.pushUndo();
      dragState.pushedUndo = true;
      nextObjects = this.bringObjectsToFront(nextObjects);
      nextObject = nextObjects.find((object) => object.id === dragState.objectId)!;
      this.syncDragStateZ(nextObjects);
    }

    this.replaceObjects(nextObjects);
    this.setSelectedObjects(this.selectedObjectIds, nextObject.id);
    this.activeTextObjectId = null;

    if (dragState.kind === "resize-box") {
      this.setStatus(`Resizing ${this.describeObject(nextObject)}.`);
    } else if (dragState.kind === "line-endpoint") {
      this.setStatus(`Adjusting ${this.describeObject(nextObject)}.`);
    } else if (this.selectedObjectIds.length > 1) {
      this.setStatus(`Moving ${this.selectedObjectIds.length} objects.`);
    } else {
      this.setStatus(`Moving ${this.describeObject(nextObject)}.`);
    }
  }

  private syncDragStateZ(objects: DrawObject[]): void {
    if (!this.dragState) return;

    const zById = new Map(objects.map((object) => [object.id, object.z]));

    switch (this.dragState.kind) {
      case "move":
        this.dragState.originalObjects = this.dragState.originalObjects.map((object) => ({
          ...object,
          z: zById.get(object.id) ?? object.z,
        }));
        break;
      case "resize-box":
        this.dragState.originalObject = {
          ...this.dragState.originalObject,
          z: zById.get(this.dragState.originalObject.id) ?? this.dragState.originalObject.z,
        };
        this.dragState.originalObjects = this.dragState.originalObjects.map((object) => ({
          ...object,
          z: zById.get(object.id) ?? object.z,
        }));
        break;
      case "line-endpoint":
        this.dragState.originalObject = {
          ...this.dragState.originalObject,
          z: zById.get(this.dragState.originalObject.id) ?? this.dragState.originalObject.z,
        };
        break;
    }
  }

  private eraseObjectAt(x: number, y: number): void {
    const hit = this.findTopmostObjectAt(x, y);
    if (!hit || !this.eraseState) return;
    if (this.eraseState.erasedIds.has(hit.id)) return;

    if (!this.eraseState.pushedUndo) {
      this.pushUndo();
      this.eraseState.pushedUndo = true;
    }

    this.eraseState.erasedIds.add(hit.id);
    this.removeObjectById(hit.id);
    if (this.isObjectSelected(hit.id)) {
      this.setSelectedObjects(this.selectedObjectIds.filter((id) => id !== hit.id));
    }
    if (this.activeTextObjectId === hit.id) {
      this.activeTextObjectId = null;
    }
    this.setStatus(`Deleted ${this.describeObject(hit)}.`);
  }

  private deleteTopmostObjectAt(x: number, y: number): boolean {
    const hit = this.findTopmostObjectAt(x, y);
    if (!hit) return false;

    this.pushUndo();
    this.removeObjectById(hit.id);
    this.setSelectedObjects([]);
    if (this.activeTextObjectId === hit.id) {
      this.activeTextObjectId = null;
    }
    this.setStatus(`Deleted ${this.describeObject(hit)}.`);
    return true;
  }

  private createSnapshot(): Snapshot {
    return {
      objects: cloneObjects(this.objects),
      selectedObjectIds: [...this.selectedObjectIds],
      selectedObjectId: this.selectedObjectId,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      nextObjectNumber: this.nextObjectNumber,
      nextZIndex: this.nextZIndex,
    };
  }

  private pushUndo(): void {
    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private restoreSnapshot(snapshot: Snapshot): void {
    this.objects = this.recomputeParentAssignments(
      cloneObjects(snapshot.objects).map((object) => this.shiftObjectInsideCanvas(object)),
    );
    this.selectedObjectIds = [...snapshot.selectedObjectIds];
    this.selectedObjectId = snapshot.selectedObjectId;
    this.syncSelection();
    this.cursorX = Math.max(0, Math.min(snapshot.cursorX, this.canvasWidth - 1));
    this.cursorY = Math.max(0, Math.min(snapshot.cursorY, this.canvasHeight - 1));
    this.nextObjectNumber = snapshot.nextObjectNumber;
    this.nextZIndex = snapshot.nextZIndex;
    this.activeTextObjectId = null;
    this.pendingSelection = null;
    this.pendingLine = null;
    this.pendingBox = null;
    this.pendingPaint = null;
    this.dragState = null;
    this.eraseState = null;
    this.markSceneDirty();
  }

  private ensureScene(): void {
    if (!this.sceneDirty) return;

    this.renderCanvas = createCanvas(this.canvasWidth, this.canvasHeight);
    this.renderCanvasColors = createColorGrid(this.canvasWidth, this.canvasHeight);
    this.renderConnections = createConnectionGrid(this.canvasWidth, this.canvasHeight);
    this.renderConnectionColors = createColorGrid(this.canvasWidth, this.canvasHeight);

    const indexedObjects = this.objects.map((object, index) => ({ object, index }));
    indexedObjects.sort((a, b) => a.object.z - b.object.z || a.index - b.index);

    for (const { object } of indexedObjects) {
      switch (object.type) {
        case "box": {
          const style = this.resolveBoxConnectionStyle(object, object.style, object.id);
          applyBoxPerimeter(object, (x, y, direction) => {
            adjustConnection(
              this.renderConnections,
              this.canvasWidth,
              this.canvasHeight,
              x,
              y,
              direction,
              style,
              1,
            );
            paintConnectionColor(
              this.renderConnectionColors,
              this.canvasWidth,
              this.canvasHeight,
              x,
              y,
              direction,
              object.color,
            );
          });
          break;
        }
        case "line": {
          for (const point of getLinePoints(object.x1, object.y1, object.x2, object.y2)) {
            this.paintRenderCell(point.x, point.y, object.brush, object.color);
          }
          break;
        }
        case "paint": {
          for (const point of object.points) {
            this.paintRenderCell(point.x, point.y, object.brush, object.color);
          }
          break;
        }
        case "text": {
          for (const [index, segment] of splitGraphemes(object.content).entries()) {
            this.paintRenderCell(object.x + index, object.y, segment, object.color);
          }
          break;
        }
      }
    }

    this.sceneDirty = false;
  }

  private paintRenderCell(x: number, y: number, char: string, color: InkColor): void {
    if (!this.isInsideCanvas(x, y)) return;
    this.renderCanvas[y]![x] = normalizeCellCharacter(char);
    this.renderCanvasColors[y]![x] = color;
  }

  private getConnectionGlyph(x: number, y: number): string {
    if (!this.isInsideCanvas(x, y)) return " ";

    let mask = 0;
    let hasHeavy = false;
    let hasDouble = false;

    for (const direction of DIRECTIONS) {
      const counts = this.renderConnections[y]![x]![direction];
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

  private getLinePreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (!this.pendingLine) return preview;

    for (const point of getLinePoints(
      this.pendingLine.start.x,
      this.pendingLine.start.y,
      this.pendingLine.end.x,
      this.pendingLine.end.y,
    )) {
      if (!this.isInsideCanvas(point.x, point.y)) continue;
      preview.set(`${point.x},${point.y}`, this.brush);
    }

    return preview;
  }

  private getPaintPreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (!this.pendingPaint) return preview;

    for (const point of this.pendingPaint.points) {
      if (!this.isInsideCanvas(point.x, point.y)) continue;
      preview.set(`${point.x},${point.y}`, this.brush);
    }

    return preview;
  }

  private getBoxPreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (!this.pendingBox) return preview;

    const rect = normalizeRect(this.pendingBox.start, this.pendingBox.end);
    const style = this.resolveBoxConnectionStyle(rect, this.boxStyle);
    const { horizontal, vertical, topLeft, topRight, bottomLeft, bottomRight } =
      getBoxBorderGlyphs(style);

    const setPreview = (x: number, y: number, value: string): void => {
      if (!this.isInsideCanvas(x, y)) return;
      preview.set(`${x},${y}`, value);
    };

    for (let x = rect.left; x <= rect.right; x += 1) {
      setPreview(x, rect.top, horizontal);
      setPreview(x, rect.bottom, horizontal);
    }
    for (let y = rect.top; y <= rect.bottom; y += 1) {
      setPreview(rect.left, y, vertical);
      setPreview(rect.right, y, vertical);
    }

    setPreview(rect.left, rect.top, topLeft);
    setPreview(rect.right, rect.top, topRight);
    setPreview(rect.left, rect.bottom, bottomLeft);
    setPreview(rect.right, rect.bottom, bottomRight);

    return preview;
  }

  private resolveBoxConnectionStyle(
    rect: Rect,
    style: BoxStyle,
    ignoreId?: string,
  ): ConnectionStyle {
    if (style === "auto") {
      return this.getAutoBoxConnectionStyle(rect, ignoreId);
    }

    return style;
  }

  private getAutoBoxConnectionStyle(rect: Rect, ignoreId?: string): ConnectionStyle {
    const depth = this.objects.filter((object) => {
      if (object.type !== "box") return false;
      if (object.id === ignoreId) return false;
      return (
        rect.left > object.left &&
        rect.right < object.right &&
        rect.top > object.top &&
        rect.bottom < object.bottom
      );
    }).length;

    return depth % 2 === 0 ? "heavy" : "light";
  }

  private getObjectById(id: string): DrawObject | null {
    return this.objects.find((object) => object.id === id) ?? null;
  }

  private isObjectSelected(id: string): boolean {
    return this.selectedObjectIds.includes(id) || this.selectedObjectId === id;
  }

  private getSelectedObject(): DrawObject | null {
    if (!this.selectedObjectId) return null;
    return this.getObjectById(this.selectedObjectId);
  }

  private getSelectedObjects(): DrawObject[] {
    const ids =
      this.selectedObjectIds.length > 0
        ? this.selectedObjectIds
        : this.selectedObjectId
          ? [this.selectedObjectId]
          : [];

    return ids
      .map((id) => this.getObjectById(id))
      .filter((object): object is DrawObject => object !== null);
  }

  private getSelectedRootObjects(): DrawObject[] {
    const selectedIds = new Set(this.selectedObjectIds);

    return this.getSelectedObjects().filter((object) => {
      let parentId = object.parentId;
      while (parentId) {
        if (selectedIds.has(parentId)) {
          return false;
        }
        parentId = this.getObjectById(parentId)?.parentId ?? null;
      }
      return true;
    });
  }

  private getSelectedObjectTrees(): DrawObject[] {
    const treeIds = new Set<string>();

    for (const object of this.getSelectedRootObjects()) {
      for (const treeObject of this.getObjectTree(object.id)) {
        treeIds.add(treeObject.id);
      }
    }

    return this.objects.filter((object) => treeIds.has(object.id));
  }

  private getMoveSelectionForObject(object: DrawObject): DrawObject[] {
    if (!this.isObjectSelected(object.id) || this.selectedObjectIds.length <= 1) {
      return this.getObjectTree(object.id);
    }

    return this.getSelectedObjectTrees();
  }

  private getActiveTextObject(): TextObject | null {
    if (!this.activeTextObjectId) return null;
    const object = this.getObjectById(this.activeTextObjectId);
    return object?.type === "text" ? object : null;
  }

  private getObjectTree(id: string, objects = this.objects): DrawObject[] {
    const descendants = new Set<string>([id]);
    let changed = true;

    while (changed) {
      changed = false;
      for (const object of objects) {
        if (object.parentId && descendants.has(object.parentId) && !descendants.has(object.id)) {
          descendants.add(object.id);
          changed = true;
        }
      }
    }

    return objects.filter((object) => descendants.has(object.id));
  }

  private recomputeParentAssignments(objects: DrawObject[]): DrawObject[] {
    return objects.map((object) => {
      const bounds = getObjectBounds(object);
      const candidates = objects
        .filter(
          (candidate): candidate is BoxObject =>
            candidate.type === "box" && candidate.id !== object.id,
        )
        .filter((candidate) => rectContainsRect(getBoxContentBounds(candidate), bounds))
        .sort(
          (a, b) =>
            getRectArea(getBoxContentBounds(a)) - getRectArea(getBoxContentBounds(b)) || a.z - b.z,
        );

      return {
        ...object,
        parentId: candidates[0]?.id ?? null,
      };
    });
  }

  private setObjects(nextObjects: DrawObject[]): void {
    this.objects = this.recomputeParentAssignments(nextObjects);
    this.syncSelection();
    this.markSceneDirty();
  }

  private replaceObject(nextObject: DrawObject): void {
    this.replaceObjects([nextObject]);
  }

  private replaceObjects(nextObjects: DrawObject[]): void {
    const replacementMap = new Map(nextObjects.map((object) => [object.id, object]));
    this.setObjects(this.objects.map((object) => replacementMap.get(object.id) ?? object));
  }

  private removeObjectById(id: string): void {
    this.setObjects(this.objects.filter((object) => object.id !== id));
  }

  private setSelectedObjects(ids: string[], primaryId: string | null = ids.at(-1) ?? null): void {
    const existingIds = new Set(this.objects.map((object) => object.id));
    const nextIds = [...new Set(ids)].filter((id) => existingIds.has(id));

    this.selectedObjectIds = nextIds;
    this.selectedObjectId =
      primaryId && nextIds.includes(primaryId) ? primaryId : (nextIds.at(-1) ?? null);

    if (
      this.activeTextObjectId !== null &&
      (nextIds.length !== 1 || this.activeTextObjectId !== this.selectedObjectId)
    ) {
      this.activeTextObjectId = null;
    }
  }

  private syncSelection(): void {
    const existingIds = new Set(this.objects.map((object) => object.id));
    this.selectedObjectIds = this.selectedObjectIds.filter((id) => existingIds.has(id));

    if (this.selectedObjectId && !existingIds.has(this.selectedObjectId)) {
      this.selectedObjectId = null;
    }

    if (this.selectedObjectId && !this.selectedObjectIds.includes(this.selectedObjectId)) {
      this.selectedObjectIds.push(this.selectedObjectId);
    }

    if (this.selectedObjectIds.length === 0) {
      this.selectedObjectId = null;
    } else if (!this.selectedObjectId) {
      this.selectedObjectId = this.selectedObjectIds.at(-1) ?? null;
    }

    if (
      this.activeTextObjectId !== null &&
      (!existingIds.has(this.activeTextObjectId) ||
        this.selectedObjectIds.length !== 1 ||
        this.activeTextObjectId !== this.selectedObjectId)
    ) {
      this.activeTextObjectId = null;
    }
  }

  private findTopmostHandleAt(x: number, y: number): HandleHit | null {
    const indexedObjects = this.objects.map((object, index) => ({ object, index }));
    indexedObjects.sort((a, b) => b.object.z - a.object.z || b.index - a.index);

    for (const { object } of indexedObjects) {
      if (object.type === "box") {
        for (const [handle, point] of Object.entries(getBoxCornerPoints(object)) as [
          BoxResizeHandle,
          Point,
        ][]) {
          if (point.x === x && point.y === y) {
            return { kind: "box-corner", object, handle };
          }
        }
      }

      if (object.type === "line") {
        for (const [endpoint, point] of Object.entries(getLineEndpointPoints(object)) as [
          LineEndpointHandle,
          Point,
        ][]) {
          if (point.x === x && point.y === y) {
            return { kind: "line-endpoint", object, endpoint };
          }
        }
      }
    }

    return null;
  }

  private findTopmostObjectAt(x: number, y: number): DrawObject | null {
    const hit = this.findTopmostObjectHitAt(x, y);
    return hit?.object ?? null;
  }

  private findTopmostObjectHitAt(x: number, y: number): ObjectHit | null {
    const indexedObjects = this.objects.map((object, index) => ({ object, index }));
    indexedObjects.sort((a, b) => b.object.z - a.object.z || b.index - a.index);

    for (const { object } of indexedObjects) {
      if (object.type === "text") {
        const onTextContent = objectContainsPoint(object, x, y);
        const inSelectedTextBounds =
          object.id === this.selectedObjectId &&
          rectContainsPoint(getTextSelectionBounds(object), x, y);

        if (onTextContent || inSelectedTextBounds) {
          return { object, onTextContent };
        }
        continue;
      }

      if (objectContainsPoint(object, x, y)) {
        return { object, onTextContent: false };
      }
    }

    return null;
  }

  private getObjectsWithinSelectionRect(rect: Rect): DrawObject[] {
    return this.objects.filter((object) => rectsIntersect(getObjectSelectionBounds(object), rect));
  }

  private translateObjectWithinCanvas(
    object: DrawObject,
    desiredDx: number,
    desiredDy: number,
  ): DrawObject {
    const bounds = getObjectBounds(object);

    const minDx = -bounds.left;
    const maxDx = this.canvasWidth - 1 - bounds.right;
    const minDy = -bounds.top;
    const maxDy = this.canvasHeight - 1 - bounds.bottom;

    const dx = minDx <= maxDx ? clamp(desiredDx, minDx, maxDx) : desiredDx;
    const dy = minDy <= maxDy ? clamp(desiredDy, minDy, maxDy) : desiredDy;

    return translateObject(object, dx, dy);
  }

  private translateObjectTreeWithinCanvas(
    objects: DrawObject[],
    desiredDx: number,
    desiredDy: number,
  ): DrawObject[] {
    const bounds = getBoundsUnion(objects);
    if (!bounds) return objects;

    const minDx = -bounds.left;
    const maxDx = this.canvasWidth - 1 - bounds.right;
    const minDy = -bounds.top;
    const maxDy = this.canvasHeight - 1 - bounds.bottom;

    const dx = minDx <= maxDx ? clamp(desiredDx, minDx, maxDx) : desiredDx;
    const dy = minDy <= maxDy ? clamp(desiredDy, minDy, maxDy) : desiredDy;

    return objects.map((object) => translateObject(object, dx, dy));
  }

  private resizeBoxWithinCanvas(box: BoxObject, handle: BoxResizeHandle, point: Point): BoxObject {
    const anchor = this.getOppositeBoxCorner(box, handle);
    const clampedPoint = this.clampPointInsideCanvas(point);
    const safePoint = this.ensureBoxDoesNotCollapse(anchor, clampedPoint);
    const rect = normalizeRect(anchor, safePoint);

    return {
      ...box,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  }

  private resizeObjectTreeWithinCanvas(
    originalObjects: DrawObject[],
    originalBox: BoxObject,
    handle: BoxResizeHandle,
    point: Point,
  ): DrawObject[] {
    const resizedBox = this.resizeBoxWithinCanvas(originalBox, handle, point);
    const originalContentBounds = getBoxContentBounds(originalBox);
    const nextContentBounds = getBoxContentBounds(resizedBox);

    return originalObjects.map((object) => {
      if (object.id === originalBox.id) {
        return resizedBox;
      }

      return this.transformObjectForResizedParent(object, originalContentBounds, nextContentBounds);
    });
  }

  private transformObjectForResizedParent(
    object: DrawObject,
    originalContentBounds: Rect,
    nextContentBounds: Rect,
  ): DrawObject {
    if (!isValidRect(originalContentBounds) || !isValidRect(nextContentBounds)) {
      return object;
    }

    switch (object.type) {
      case "line": {
        const start = this.mapPointBetweenRects(
          { x: object.x1, y: object.y1 },
          originalContentBounds,
          nextContentBounds,
        );
        const end = this.mapPointBetweenRects(
          { x: object.x2, y: object.y2 },
          originalContentBounds,
          nextContentBounds,
        );
        return {
          ...object,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
        };
      }
      case "paint": {
        const mappedPoints = object.points.map((point) =>
          this.mapPointBetweenRects(point, originalContentBounds, nextContentBounds),
        );
        return {
          ...object,
          points: mergeUniquePoints([], mappedPoints),
        };
      }
      case "text": {
        const mapped = this.mapPointBetweenRects(
          { x: object.x, y: object.y },
          originalContentBounds,
          nextContentBounds,
        );
        return this.clampTextIntoRect(
          {
            ...object,
            x: mapped.x,
            y: mapped.y,
          },
          nextContentBounds,
        );
      }
      case "box": {
        const topLeft = this.mapPointBetweenRects(
          { x: object.left, y: object.top },
          originalContentBounds,
          nextContentBounds,
        );
        const bottomRight = this.mapPointBetweenRects(
          { x: object.right, y: object.bottom },
          originalContentBounds,
          nextContentBounds,
        );
        const rect = normalizeRect(topLeft, bottomRight);
        return {
          ...object,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      }
    }
  }

  private mapPointBetweenRects(point: Point, from: Rect, to: Rect): Point {
    return {
      x: this.mapAxisBetweenRanges(point.x, from.left, from.right, to.left, to.right),
      y: this.mapAxisBetweenRanges(point.y, from.top, from.bottom, to.top, to.bottom),
    };
  }

  private mapAxisBetweenRanges(
    value: number,
    fromStart: number,
    fromEnd: number,
    toStart: number,
    toEnd: number,
  ): number {
    if (fromStart === fromEnd) {
      return toStart;
    }

    const ratio = (value - fromStart) / (fromEnd - fromStart);
    const mapped = Math.round(toStart + ratio * (toEnd - toStart));
    const min = Math.min(toStart, toEnd);
    const max = Math.max(toStart, toEnd);
    return clamp(mapped, min, max);
  }

  private clampTextIntoRect(text: TextObject, rect: Rect): TextObject {
    if (!isValidRect(rect)) return text;

    const width = visibleCellCount(text.content);
    const minX = rect.left;
    const maxX = rect.right - width + 1;

    return {
      ...text,
      x: maxX >= minX ? clamp(text.x, minX, maxX) : rect.left,
      y: clamp(text.y, rect.top, rect.bottom),
    };
  }

  private adjustLineEndpointWithinCanvas(
    line: LineObject,
    endpoint: LineEndpointHandle,
    point: Point,
  ): LineObject {
    const clampedPoint = this.clampPointInsideCanvas(point);

    if (endpoint === "start") {
      return {
        ...line,
        x1: clampedPoint.x,
        y1: clampedPoint.y,
      };
    }

    return {
      ...line,
      x2: clampedPoint.x,
      y2: clampedPoint.y,
    };
  }

  private getOppositeBoxCorner(box: BoxObject, handle: BoxResizeHandle): Point {
    switch (handle) {
      case "top-left":
        return { x: box.right, y: box.bottom };
      case "top-right":
        return { x: box.left, y: box.bottom };
      case "bottom-left":
        return { x: box.right, y: box.top };
      case "bottom-right":
        return { x: box.left, y: box.top };
    }
  }

  private clampPointInsideCanvas(point: Point): Point {
    return {
      x: clamp(point.x, 0, this.canvasWidth - 1),
      y: clamp(point.y, 0, this.canvasHeight - 1),
    };
  }

  private ensureBoxDoesNotCollapse(anchor: Point, point: Point): Point {
    if (anchor.x !== point.x || anchor.y !== point.y) {
      return point;
    }

    if (point.x > 0) {
      return { x: point.x - 1, y: point.y };
    }
    if (point.x < this.canvasWidth - 1) {
      return { x: point.x + 1, y: point.y };
    }
    if (point.y > 0) {
      return { x: point.x, y: point.y - 1 };
    }
    if (point.y < this.canvasHeight - 1) {
      return { x: point.x, y: point.y + 1 };
    }

    return point;
  }

  private shiftObjectInsideCanvas(object: DrawObject): DrawObject {
    const bounds = getObjectBounds(object);
    let dx = 0;
    let dy = 0;

    if (bounds.left < 0) {
      dx = -bounds.left;
    } else if (bounds.right >= this.canvasWidth) {
      dx = this.canvasWidth - 1 - bounds.right;
    }

    if (bounds.top < 0) {
      dy = -bounds.top;
    } else if (bounds.bottom >= this.canvasHeight) {
      dy = this.canvasHeight - 1 - bounds.bottom;
    }

    return translateObject(object, dx, dy);
  }

  private bringObjectToFront<T extends DrawObject>(object: T): T {
    return {
      ...object,
      z: this.allocateZIndex(),
    } as T;
  }

  private materializeDraftObject(draft: DraftDrawObject): DrawObject {
    if (draft.type === "box") {
      return {
        id: this.createObjectId(),
        z: this.allocateZIndex(),
        parentId: null,
        color: draft.color ?? this.inkColor,
        type: "box",
        left: draft.left,
        top: draft.top,
        right: draft.right,
        bottom: draft.bottom,
        style: draft.style ?? this.boxStyle,
      };
    }

    if (draft.type === "line") {
      return {
        id: this.createObjectId(),
        z: this.allocateZIndex(),
        parentId: null,
        color: draft.color ?? this.inkColor,
        type: "line",
        x1: draft.x1,
        y1: draft.y1,
        x2: draft.x2,
        y2: draft.y2,
        brush: normalizeCellCharacter(draft.brush ?? this.brush),
      };
    }

    if (draft.type === "paint") {
      return {
        id: this.createObjectId(),
        z: this.allocateZIndex(),
        parentId: null,
        color: draft.color ?? this.inkColor,
        type: "paint",
        points: draft.points.map((point) => ({ ...point })),
        brush: normalizeCellCharacter(draft.brush ?? this.brush),
      };
    }

    return {
      id: this.createObjectId(),
      z: this.allocateZIndex(),
      parentId: null,
      color: draft.color ?? this.inkColor,
      type: "text",
      x: draft.x,
      y: draft.y,
      content: draft.content,
    };
  }

  private bringObjectsToFront(objects: DrawObject[]): DrawObject[] {
    const byId = new Map<string, DrawObject>();

    for (const object of [...objects].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id))) {
      byId.set(object.id, this.bringObjectToFront(object));
    }

    return objects.map((object) => byId.get(object.id) ?? object);
  }

  private createObjectId(): string {
    const id = `obj-${this.nextObjectNumber}`;
    this.nextObjectNumber += 1;
    return id;
  }

  private allocateZIndex(): number {
    const z = this.nextZIndex;
    this.nextZIndex += 1;
    return z;
  }

  private describeRect(rect: Rect): string {
    return `${rect.left + 1},${rect.top + 1} → ${rect.right + 1},${rect.bottom + 1}`;
  }

  private describeBoxStyle(style: BoxStyle): string {
    switch (style) {
      case "auto":
        return "Auto";
      case "light":
        return "Single";
      case "heavy":
        return "Heavy";
      case "double":
        return "Double";
    }
  }

  private describeInkColor(color: InkColor): string {
    switch (color) {
      case "white":
        return "white";
      case "red":
        return "red";
      case "orange":
        return "orange";
      case "yellow":
        return "yellow";
      case "green":
        return "green";
      case "cyan":
        return "cyan";
      case "blue":
        return "blue";
      case "magenta":
        return "magenta";
    }
  }

  private describeObject(object: DrawObject): string {
    switch (object.type) {
      case "box":
        return `box ${this.describeRect(object)}`;
      case "line":
        return `line ${object.x1 + 1},${object.y1 + 1} → ${object.x2 + 1},${object.y2 + 1}`;
      case "paint": {
        const bounds = getObjectBounds(object);
        return `paint ${this.describeRect(bounds)}`;
      }
      case "text":
        return `text "${object.content}" at ${object.x + 1},${object.y + 1}`;
    }
  }

  private objectsEqual(a: DrawObject, b: DrawObject): boolean {
    if (a.type !== b.type) return false;
    if (a.parentId !== b.parentId) return false;
    if (a.color !== b.color) return false;

    switch (a.type) {
      case "box":
        return (
          a.left === (b as BoxObject).left &&
          a.right === (b as BoxObject).right &&
          a.top === (b as BoxObject).top &&
          a.bottom === (b as BoxObject).bottom &&
          a.style === (b as BoxObject).style
        );
      case "line":
        return (
          a.x1 === (b as LineObject).x1 &&
          a.y1 === (b as LineObject).y1 &&
          a.x2 === (b as LineObject).x2 &&
          a.y2 === (b as LineObject).y2 &&
          a.brush === (b as LineObject).brush
        );
      case "paint":
        return (
          a.brush === (b as PaintObject).brush && pointsEqual(a.points, (b as PaintObject).points)
        );
      case "text":
        return (
          a.x === (b as TextObject).x &&
          a.y === (b as TextObject).y &&
          a.content === (b as TextObject).content
        );
    }
  }

  private objectListsEqual(a: DrawObject[], b: DrawObject[]): boolean {
    if (a.length !== b.length) return false;

    const byId = new Map(b.map((object) => [object.id, object]));
    return a.every((object) => {
      const other = byId.get(object.id);
      return other ? this.objectsEqual(object, other) : false;
    });
  }

  private isInsideCanvas(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.canvasWidth && y < this.canvasHeight;
  }

  private markSceneDirty(): void {
    this.sceneDirty = true;
  }

  private setStatus(message: string): void {
    this.status = message;
  }
}
