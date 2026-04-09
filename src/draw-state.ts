import { MouseButton } from "@opentui/core";

export const BRUSHES = ["#", "*", "+", "-", "=", "x", "o", ".", "|", "/", "\\"] as const;
const MAX_HISTORY = 100;
const HANDLE_CHARACTER = "●";

export type DrawMode = "box" | "line" | "text";
type CanvasGrid = string[][];
type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type LineStyle = "light" | "heavy";
type Direction = "n" | "e" | "s" | "w";
type DirectionCounts = { light: number; heavy: number };
type CellConnections = Record<Direction, DirectionCounts>;
type ConnectionGrid = CellConnections[][];
type BoxResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type LineEndpointHandle = "start" | "end";

type BaseDrawObject = {
  id: string;
  z: number;
  parentId: string | null;
};

type BoxObject = BaseDrawObject & {
  type: "box";
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type LineObject = BaseDrawObject & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  brush: string;
};

type TextObject = BaseDrawObject & {
  type: "text";
  x: number;
  y: number;
  content: string;
};

export type DrawObject = BoxObject | LineObject | TextObject;

type Snapshot = {
  objects: DrawObject[];
  selectedObjectId: string | null;
  cursorX: number;
  cursorY: number;
  nextObjectNumber: number;
  nextZIndex: number;
};

type PendingBox = { start: Point; end: Point };
type PendingLine = { start: Point; end: Point };

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

function createCellConnections(): CellConnections {
  return {
    n: { light: 0, heavy: 0 },
    e: { light: 0, heavy: 0 },
    s: { light: 0, heavy: 0 },
    w: { light: 0, heavy: 0 },
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
  style: LineStyle,
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

function getObjectBounds(object: DrawObject): Rect {
  switch (object.type) {
    case "box":
      return { left: object.left, top: object.top, right: object.right, bottom: object.bottom };
    case "line":
      return normalizeRect({ x: object.x1, y: object.y1 }, { x: object.x2, y: object.y2 });
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
    case "text":
      return y === object.y && x >= object.x && x < object.x + visibleCellCount(object.content);
  }
}

export class DrawState {
  public readonly canvasTopRow = 3;
  public readonly canvasLeftCol = 1;

  private canvasWidth = 0;
  private canvasHeight = 0;

  private cursorX = 0;
  private cursorY = 0;

  private mode: DrawMode = "line";
  private brush = BRUSHES[0] as string;
  private brushIndex = 0;

  private objects: DrawObject[] = [];
  private selectedObjectId: string | null = null;
  private activeTextObjectId: string | null = null;

  private pendingLine: PendingLine | null = null;
  private pendingBox: PendingBox | null = null;
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
  private renderConnections: ConnectionGrid = [];

  constructor(viewWidth: number, viewHeight: number) {
    this.ensureCanvasSize(viewWidth, viewHeight);
  }

  public get currentMode(): DrawMode {
    return this.mode;
  }

  public get currentBrush(): string {
    return this.brush;
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

  public get hasSelectedObject(): boolean {
    return this.getSelectedObject() !== null;
  }

  public get isEditingText(): boolean {
    return this.getActiveTextObject() !== null;
  }

  public get hasActivePointerInteraction(): boolean {
    return (
      this.pendingLine !== null ||
      this.pendingBox !== null ||
      this.dragState !== null ||
      this.eraseState !== null
    );
  }

  public ensureCanvasSize(viewWidth: number, viewHeight: number): void {
    const nextCanvasWidth = Math.max(1, viewWidth - 2);
    const nextCanvasHeight = Math.max(1, viewHeight - 5);

    if (nextCanvasWidth === this.canvasWidth && nextCanvasHeight === this.canvasHeight) {
      return;
    }

    this.canvasWidth = nextCanvasWidth;
    this.canvasHeight = nextCanvasHeight;
    this.cursorX = Math.max(0, Math.min(this.cursorX, this.canvasWidth - 1));
    this.cursorY = Math.max(0, Math.min(this.cursorY, this.canvasHeight - 1));

    this.setObjects(this.objects.map((object) => this.shiftObjectInsideCanvas(object)));
    this.pendingLine = null;
    this.pendingBox = null;
    this.dragState = null;
    this.eraseState = null;
  }

  public handlePointerEvent(event: PointerEventLike): void {
    if (event.type === "scroll") {
      if (this.mode === "line") {
        const direction =
          event.scrollDirection === "down" || event.scrollDirection === "left" ? -1 : 1;
        this.cycleBrush(direction);
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
        this.selectedObjectId = null;
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
      case "box":
        this.selectedObjectId = null;
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
        this.selectedObjectId = null;
        this.activeTextObjectId = null;
        this.pendingLine = {
          start: { x: canvasX, y: canvasY },
          end: { x: canvasX, y: canvasY },
        };
        this.setStatus(
          `Line start at ${canvasX + 1},${canvasY + 1}. Drag to endpoint, release to commit.`,
        );
        return;
      case "text":
        this.placeTextCursor(canvasX, canvasY);
        return;
    }
  }

  public getModeLabel(): string {
    switch (this.mode) {
      case "line":
        return "LINE";
      case "box":
        return "BOX";
      case "text":
        return "TEXT";
    }
  }

  public getActivePreviewCharacters(): Map<string, string> {
    if (this.pendingLine) return this.getLinePreviewCharacters();
    if (this.pendingBox) return this.getBoxPreviewCharacters();
    return new Map<string, string>();
  }

  public getSelectedCellKeys(): Set<string> {
    const selected = this.getSelectedObject();
    const keys = new Set<string>();
    if (!selected) return keys;

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

    return keys;
  }

  public getSelectionHandleCharacters(): Map<string, string> {
    const handles = new Map<string, string>();

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
    const hadSelection = this.selectedObjectId !== null || this.activeTextObjectId !== null;
    this.selectedObjectId = null;
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

  public moveCursor(dx: number, dy: number): void {
    this.cursorX = Math.max(0, Math.min(this.canvasWidth - 1, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.canvasHeight - 1, this.cursorY + dy));
    if (this.mode === "text") {
      this.activeTextObjectId = null;
    }
    this.setStatus(`Cursor ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public moveSelectedObjectBy(dx: number, dy: number): void {
    const selected = this.getSelectedObject();
    if (!selected) {
      this.setStatus("No object selected.");
      return;
    }

    const tree = this.getObjectTree(selected.id);
    const movedTree = this.translateObjectTreeWithinCanvas(tree, dx, dy);
    const moved = movedTree.find((object) => object.id === selected.id)!;
    if (this.objectListsEqual(movedTree, tree)) {
      this.setStatus(`${this.describeObject(selected)} is already at the edge.`);
      return;
    }

    this.pushUndo();
    this.replaceObjects(movedTree);
    this.selectedObjectId = moved.id;
    this.activeTextObjectId = null;
    this.setStatus(`Moved ${this.describeObject(moved)}.`);
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

  public cycleMode(): void {
    const order: DrawMode[] = ["box", "line", "text"];
    const currentIndex = order.indexOf(this.mode);
    const next = order[(currentIndex + 1) % order.length] ?? "line";
    this.setMode(next);
  }

  public setMode(next: DrawMode): void {
    if (this.mode === next) return;
    this.mode = next;
    this.pendingLine = null;
    this.pendingBox = null;
    this.dragState = null;
    this.eraseState = null;
    if (next !== "text") {
      this.activeTextObjectId = null;
    }

    if (next === "line") {
      this.setStatus(
        "Line mode: drag on empty space to create a line. Click objects to move them, or line endpoints to adjust.",
      );
    } else if (next === "box") {
      this.setStatus(
        "Box mode: drag on empty space to create a box. Click objects to move them, or drag box corners to resize.",
      );
    } else {
      this.setStatus(
        "Text mode: click empty space to type, click text to edit, and use its virtual selection box to move it.",
      );
    }
  }

  public stampBrushAtCursor(): void {
    this.pushUndo();
    const object: LineObject = {
      id: this.createObjectId(),
      z: this.allocateZIndex(),
      parentId: null,
      type: "line",
      x1: this.cursorX,
      y1: this.cursorY,
      x2: this.cursorX,
      y2: this.cursorY,
      brush: this.brush,
    };
    this.setObjects([...this.objects, object]);
    this.selectedObjectId = object.id;
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
      this.selectedObjectId = updated.id;
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
      type: "text",
      x: this.cursorX,
      y: this.cursorY,
      content: char,
    };
    this.setObjects([...this.objects, object]);
    this.selectedObjectId = object.id;
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
      this.selectedObjectId = null;
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
    this.selectedObjectId = updated.id;
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
    const selected = this.getSelectedObject();
    if (!selected) return false;

    this.pushUndo();
    this.removeObjectById(selected.id);
    this.selectedObjectId = null;
    if (this.activeTextObjectId === selected.id) {
      this.activeTextObjectId = null;
    }
    this.setStatus(`Deleted ${this.describeObject(selected)}.`);
    return true;
  }

  public clearCanvas(): void {
    if (this.objects.length === 0) {
      this.setStatus("Canvas already clear.");
      return;
    }

    this.pushUndo();
    this.setObjects([]);
    this.selectedObjectId = null;
    this.activeTextObjectId = null;
    this.pendingLine = null;
    this.pendingBox = null;
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
      this.selectedObjectId = handleHit.object.id;
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
      `Selected ${this.describeObject(hit.object)}. Drag to move it.`,
      this.mode === "text" && hit.object.type === "text" && hit.onTextContent,
    );
    return true;
  }

  private beginMoveInteraction(
    object: DrawObject,
    x: number,
    y: number,
    status: string,
    textEditOnClick: boolean,
  ): void {
    this.selectedObjectId = object.id;
    this.activeTextObjectId = null;
    this.dragState = {
      kind: "move",
      objectId: object.id,
      startMouse: { x, y },
      originalObjects: cloneObjects(this.getObjectTree(object.id)),
      pushedUndo: false,
      textEditOnClick,
    };
    this.setStatus(status);
  }

  private placeTextCursor(x: number, y: number): void {
    this.selectedObjectId = null;
    this.activeTextObjectId = null;
    this.setStatus(`Text cursor ${x + 1},${y + 1}.`);
  }

  private beginEraseSession(): void {
    this.pendingLine = null;
    this.pendingBox = null;
    this.dragState = null;
    this.activeTextObjectId = null;
    this.eraseState = {
      erasedIds: new Set<string>(),
      pushedUndo: false,
    };
  }

  private finishPointerInteraction(point: Point, insideCanvas: boolean): void {
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
        type: "box",
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
      this.setObjects([...this.objects, object]);
      this.selectedObjectId = object.id;
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
        type: "line",
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        brush: this.brush,
      };
      this.setObjects([...this.objects, object]);
      this.selectedObjectId = object.id;
      this.setStatus(`Created ${this.describeObject(this.getObjectById(object.id) ?? object)}.`);
      return;
    }

    if (this.dragState) {
      const dragState = this.dragState;
      this.dragState = null;
      const object = this.getObjectById(dragState.objectId);

      if (!dragState.pushedUndo) {
        if (dragState.kind === "move" && dragState.textEditOnClick && object?.type === "text") {
          this.selectedObjectId = object.id;
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
          this.setStatus(`Selected ${this.describeObject(object)}.`);
        }
        return;
      }

      if (object) {
        if (dragState.kind === "resize-box") {
          this.setStatus(`Resized ${this.describeObject(object)}.`);
        } else if (dragState.kind === "line-endpoint") {
          this.setStatus(`Adjusted ${this.describeObject(object)}.`);
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
    this.selectedObjectId = nextObject.id;
    this.activeTextObjectId = null;

    if (dragState.kind === "resize-box") {
      this.setStatus(`Resizing ${this.describeObject(nextObject)}.`);
    } else if (dragState.kind === "line-endpoint") {
      this.setStatus(`Adjusting ${this.describeObject(nextObject)}.`);
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
    if (this.selectedObjectId === hit.id) {
      this.selectedObjectId = null;
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
    this.selectedObjectId = null;
    if (this.activeTextObjectId === hit.id) {
      this.activeTextObjectId = null;
    }
    this.setStatus(`Deleted ${this.describeObject(hit)}.`);
    return true;
  }

  private createSnapshot(): Snapshot {
    return {
      objects: cloneObjects(this.objects),
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
    this.selectedObjectId = snapshot.selectedObjectId;
    this.cursorX = Math.max(0, Math.min(snapshot.cursorX, this.canvasWidth - 1));
    this.cursorY = Math.max(0, Math.min(snapshot.cursorY, this.canvasHeight - 1));
    this.nextObjectNumber = snapshot.nextObjectNumber;
    this.nextZIndex = snapshot.nextZIndex;
    this.activeTextObjectId = null;
    this.pendingLine = null;
    this.pendingBox = null;
    this.dragState = null;
    this.eraseState = null;
    this.markSceneDirty();
  }

  private ensureScene(): void {
    if (!this.sceneDirty) return;

    this.renderCanvas = createCanvas(this.canvasWidth, this.canvasHeight);
    this.renderConnections = createConnectionGrid(this.canvasWidth, this.canvasHeight);

    const indexedObjects = this.objects.map((object, index) => ({ object, index }));
    indexedObjects.sort((a, b) => a.object.z - b.object.z || a.index - b.index);

    for (const { object } of indexedObjects) {
      switch (object.type) {
        case "box": {
          const style = this.getBoxStyle(object, object.id);
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
          });
          break;
        }
        case "line": {
          for (const point of getLinePoints(object.x1, object.y1, object.x2, object.y2)) {
            this.paintRenderCell(point.x, point.y, object.brush);
          }
          break;
        }
        case "text": {
          for (const [index, segment] of splitGraphemes(object.content).entries()) {
            this.paintRenderCell(object.x + index, object.y, segment);
          }
          break;
        }
      }
    }

    this.sceneDirty = false;
  }

  private paintRenderCell(x: number, y: number, char: string): void {
    if (!this.isInsideCanvas(x, y)) return;
    this.renderCanvas[y]![x] = normalizeCellCharacter(char);
  }

  private getConnectionGlyph(x: number, y: number): string {
    if (!this.isInsideCanvas(x, y)) return " ";

    let mask = 0;
    let hasHeavy = false;

    for (const direction of DIRECTIONS) {
      const counts = this.renderConnections[y]![x]![direction];
      if (counts.light > 0 || counts.heavy > 0) {
        mask |= DIRECTION_BITS[direction];
      }
      if (counts.heavy > 0) {
        hasHeavy = true;
      }
    }

    if (mask === 0) return " ";
    const table = hasHeavy ? HEAVY_GLYPHS : LIGHT_GLYPHS;
    return table[mask] ?? (hasHeavy ? "╋" : "┼");
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

  private getBoxPreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (!this.pendingBox) return preview;

    const rect = normalizeRect(this.pendingBox.start, this.pendingBox.end);
    const style = this.getBoxStyle(rect);

    const horizontal = style === "heavy" ? "━" : "─";
    const vertical = style === "heavy" ? "┃" : "│";
    const topLeft = style === "heavy" ? "┏" : "┌";
    const topRight = style === "heavy" ? "┓" : "┐";
    const bottomLeft = style === "heavy" ? "┗" : "└";
    const bottomRight = style === "heavy" ? "┛" : "┘";

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

  private getBoxStyle(rect: Rect, ignoreId?: string): LineStyle {
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

  private getSelectedObject(): DrawObject | null {
    if (!this.selectedObjectId) return null;
    return this.getObjectById(this.selectedObjectId);
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

  private describeObject(object: DrawObject): string {
    switch (object.type) {
      case "box":
        return `box ${this.describeRect(object)}`;
      case "line":
        return `line ${object.x1 + 1},${object.y1 + 1} → ${object.x2 + 1},${object.y2 + 1}`;
      case "text":
        return `text "${object.content}" at ${object.x + 1},${object.y + 1}`;
    }
  }

  private objectsEqual(a: DrawObject, b: DrawObject): boolean {
    if (a.type !== b.type) return false;
    if (a.parentId !== b.parentId) return false;

    switch (a.type) {
      case "box":
        return (
          a.left === (b as BoxObject).left &&
          a.right === (b as BoxObject).right &&
          a.top === (b as BoxObject).top &&
          a.bottom === (b as BoxObject).bottom
        );
      case "line":
        return (
          a.x1 === (b as LineObject).x1 &&
          a.y1 === (b as LineObject).y1 &&
          a.x2 === (b as LineObject).x2 &&
          a.y2 === (b as LineObject).y2 &&
          a.brush === (b as LineObject).brush
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
