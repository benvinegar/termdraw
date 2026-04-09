import { MouseButton } from "@opentui/core";

export const BRUSHES = ["#", "*", "+", "-", "=", "x", "o", ".", "|", "/", "\\"] as const;
const MAX_HISTORY = 100;
const BOX_PREVIEW_ERASE_CHAR = "·";

export type DrawMode = "box" | "line" | "text";
type CanvasGrid = string[][];
type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type LineStyle = "light" | "heavy";
type Direction = "n" | "e" | "s" | "w";
type DirectionCounts = { light: number; heavy: number };
type CellConnections = Record<Direction, DirectionCounts>;
type ConnectionGrid = CellConnections[][];
type BoxRecord = Rect & { style: LineStyle };
type Snapshot = { canvas: CanvasGrid; connections: ConnectionGrid; boxes: BoxRecord[] };
type BoxDragStart = { x: number; y: number; erase: boolean };
type LineDragStart = { x: number; y: number; erase: boolean };

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

function cloneCanvas(canvas: CanvasGrid): CanvasGrid {
  return canvas.map((row) => row.slice());
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
  return Array.from({ length: height }, () => Array.from({ length: width }, () => createCellConnections()));
}

function cloneConnectionGrid(grid: ConnectionGrid): ConnectionGrid {
  return grid.map((row) =>
    row.map((cell) => ({
      n: { ...cell.n },
      e: { ...cell.e },
      s: { ...cell.s },
      w: { ...cell.w },
    })),
  );
}

function cloneBoxes(boxes: BoxRecord[]): BoxRecord[] {
  return boxes.map((box) => ({ ...box }));
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

export class DrawState {
  public readonly canvasTopRow = 4;
  public readonly canvasLeftCol = 1;

  private canvas: CanvasGrid = [];
  private connections: ConnectionGrid = [];
  private boxes: BoxRecord[] = [];

  private canvasWidth = 0;
  private canvasHeight = 0;

  private cursorX = 0;
  private cursorY = 0;

  private mode: DrawMode = "line";
  private brush = BRUSHES[0] as string;
  private brushIndex = 0;

  private lineStart: LineDragStart | null = null;
  private linePreviewEnd: Point | null = null;
  private boxStart: BoxDragStart | null = null;
  private boxPreviewEnd: Point | null = null;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private status = "Line mode: drag from one coordinate to another to draw straight lines.";

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

  public ensureCanvasSize(viewWidth: number, viewHeight: number): void {
    const nextCanvasWidth = Math.max(1, viewWidth - 2);
    const nextCanvasHeight = Math.max(1, viewHeight - 5);

    if (nextCanvasWidth === this.canvasWidth && nextCanvasHeight === this.canvasHeight) {
      return;
    }

    const previousCanvas = this.canvas;
    const previousConnections = this.connections;

    const nextCanvas = createCanvas(nextCanvasWidth, nextCanvasHeight);
    const nextConnections = createConnectionGrid(nextCanvasWidth, nextCanvasHeight);

    const copyHeight = Math.min(this.canvasHeight, nextCanvasHeight);
    const copyWidth = Math.min(this.canvasWidth, nextCanvasWidth);

    for (let y = 0; y < copyHeight; y += 1) {
      for (let x = 0; x < copyWidth; x += 1) {
        nextCanvas[y]![x] = previousCanvas[y]![x] ?? " ";

        const previousCell = previousConnections[y]?.[x];
        if (!previousCell) continue;

        for (const direction of DIRECTIONS) {
          nextConnections[y]![x]![direction].light = previousCell[direction].light;
          nextConnections[y]![x]![direction].heavy = previousCell[direction].heavy;
        }
      }
    }

    this.canvas = nextCanvas;
    this.connections = nextConnections;
    this.boxes = this.boxes.filter((box) => this.isRectInsideCanvas(box, nextCanvasWidth, nextCanvasHeight));
    this.canvasWidth = nextCanvasWidth;
    this.canvasHeight = nextCanvasHeight;
    this.cursorX = Math.max(0, Math.min(this.cursorX, this.canvasWidth - 1));
    this.cursorY = Math.max(0, Math.min(this.cursorY, this.canvasHeight - 1));
    this.lineStart = null;
    this.linePreviewEnd = null;
    this.boxStart = null;
    this.boxPreviewEnd = null;
  }

  public handlePointerEvent(event: PointerEventLike): void {
    if (event.type === "scroll") {
      if (this.mode === "line") {
        const direction = event.scrollDirection === "down" || event.scrollDirection === "left" ? -1 : 1;
        this.cycleBrush(direction);
      }
      return;
    }

    const canvasX = event.x - this.canvasLeftCol;
    const canvasY = event.y - this.canvasTopRow;
    const clampedX = clamp(canvasX, 0, this.canvasWidth - 1);
    const clampedY = clamp(canvasY, 0, this.canvasHeight - 1);
    const insideCanvas = this.isInsideCanvas(canvasX, canvasY);

    if (event.type === "up" || event.type === "drag-end") {
      if (this.mode === "box" && this.boxStart) {
        const endX = insideCanvas ? canvasX : clampedX;
        const endY = insideCanvas ? canvasY : clampedY;
        this.commitBox(this.boxStart.x, this.boxStart.y, endX, endY, this.boxStart.erase);
        this.cursorX = endX;
        this.cursorY = endY;
      }

      if (this.mode === "line" && this.lineStart) {
        const endX = insideCanvas ? canvasX : clampedX;
        const endY = insideCanvas ? canvasY : clampedY;
        this.commitLine(this.lineStart.x, this.lineStart.y, endX, endY, this.lineStart.erase);
        this.cursorX = endX;
        this.cursorY = endY;
      }

      this.lineStart = null;
      this.linePreviewEnd = null;
      this.boxStart = null;
      this.boxPreviewEnd = null;
      return;
    }

    if (event.type === "drag") {
      if (this.mode === "box" && this.boxStart) {
        this.cursorX = clampedX;
        this.cursorY = clampedY;
        this.boxPreviewEnd = { x: clampedX, y: clampedY };
        return;
      }

      if (this.mode === "line" && this.lineStart) {
        this.cursorX = clampedX;
        this.cursorY = clampedY;
        this.linePreviewEnd = { x: clampedX, y: clampedY };
        return;
      }
    }

    if (!insideCanvas) return;

    this.cursorX = canvasX;
    this.cursorY = canvasY;

    if (this.mode === "text") {
      if (event.type === "down" && event.button === MouseButton.RIGHT) {
        this.pushUndo();
        this.paintCell(canvasX, canvasY, " ");
        this.setStatus(`Erased at ${canvasX + 1},${canvasY + 1}.`);
      }
      return;
    }

    if (this.mode === "box") {
      if (event.type === "down" && (event.button === MouseButton.LEFT || event.button === MouseButton.RIGHT)) {
        this.pushUndo();
        const erase = event.button === MouseButton.RIGHT;
        this.boxStart = { x: canvasX, y: canvasY, erase };
        this.boxPreviewEnd = { x: canvasX, y: canvasY };
        this.setStatus(
          erase
            ? `Box erase start at ${canvasX + 1},${canvasY + 1}.`
            : `Box start at ${canvasX + 1},${canvasY + 1}. Drag to size, release to commit.`,
        );
      }
      return;
    }

    if (this.mode === "line") {
      if (event.type === "down" && (event.button === MouseButton.LEFT || event.button === MouseButton.RIGHT)) {
        this.pushUndo();
        const erase = event.button === MouseButton.RIGHT;
        this.lineStart = { x: canvasX, y: canvasY, erase };
        this.linePreviewEnd = { x: canvasX, y: canvasY };
        this.setStatus(
          erase
            ? `Line erase start at ${canvasX + 1},${canvasY + 1}.`
            : `Line start at ${canvasX + 1},${canvasY + 1}. Drag to endpoint, release to commit.`,
        );
      }
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
    if (this.mode === "line") return this.getLinePreviewCharacters();
    if (this.mode === "box") return this.getBoxPreviewCharacters();
    return new Map<string, string>();
  }

  public getCompositeCell(x: number, y: number): string {
    const ink = this.canvas[y]![x] ?? " ";
    if (ink !== " ") return ink;
    return this.getConnectionGlyph(x, y);
  }

  public moveCursor(dx: number, dy: number): void {
    this.cursorX = Math.max(0, Math.min(this.canvasWidth - 1, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.canvasHeight - 1, this.cursorY + dy));
    this.setStatus(`Cursor ${this.cursorX + 1},${this.cursorY + 1}.`);
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
    this.lineStart = null;
    this.linePreviewEnd = null;
    this.boxStart = null;
    this.boxPreviewEnd = null;

    if (next === "line") {
      this.setStatus("Line mode: drag from one coordinate to another to draw straight lines.");
    } else if (next === "box") {
      this.setStatus("Box mode: left drag draws auto-connected boxes (heavy outer, light inner). Right drag erases box edges.");
    } else {
      this.setStatus("Text mode: type to place characters, click to move cursor.");
    }
  }

  public stampBrushAtCursor(): void {
    this.pushUndo();
    this.paintCell(this.cursorX, this.cursorY, this.brush);
    this.setStatus(`Stamped "${this.brush}" at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public eraseAtCursor(): void {
    this.pushUndo();
    this.paintCell(this.cursorX, this.cursorY, " ");
    this.setStatus(`Erased at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public insertCharacter(input: string): void {
    const char = normalizeCellCharacter(input);
    this.pushUndo();
    this.paintCell(this.cursorX, this.cursorY, char);

    if (this.cursorX < this.canvasWidth - 1) {
      this.cursorX += 1;
    } else if (this.cursorY < this.canvasHeight - 1) {
      this.cursorX = 0;
      this.cursorY += 1;
    }

    this.setStatus(`Inserted "${char}".`);
  }

  public backspace(): void {
    this.pushUndo();

    if (this.cursorX > 0) {
      this.cursorX -= 1;
    } else if (this.cursorY > 0) {
      this.cursorY -= 1;
      this.cursorX = this.canvasWidth - 1;
    }

    this.paintCell(this.cursorX, this.cursorY, " ");
    this.setStatus(`Backspaced at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public deleteAtCursor(): void {
    this.pushUndo();
    this.paintCell(this.cursorX, this.cursorY, " ");
    this.setStatus(`Deleted at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  public clearCanvas(): void {
    this.pushUndo();

    for (let y = 0; y < this.canvasHeight; y += 1) {
      for (let x = 0; x < this.canvasWidth; x += 1) {
        this.canvas[y]![x] = " ";
      }
    }

    this.connections = createConnectionGrid(this.canvasWidth, this.canvasHeight);
    this.boxes = [];
    this.lineStart = null;
    this.linePreviewEnd = null;
    this.boxStart = null;
    this.boxPreviewEnd = null;
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
    const lines: string[] = [];

    for (let y = 0; y < this.canvasHeight; y += 1) {
      let row = "";
      for (let x = 0; x < this.canvasWidth; x += 1) {
        row += this.getCompositeCell(x, y);
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

  private getLinePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
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

  private getLinePreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (this.mode !== "line" || !this.lineStart || !this.linePreviewEnd) return preview;

    const char = this.lineStart.erase ? BOX_PREVIEW_ERASE_CHAR : this.brush;
    for (const point of this.getLinePoints(
      this.lineStart.x,
      this.lineStart.y,
      this.linePreviewEnd.x,
      this.linePreviewEnd.y,
    )) {
      if (!this.isInsideCanvas(point.x, point.y)) continue;
      preview.set(`${point.x},${point.y}`, char);
    }

    return preview;
  }

  private getBoxPreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (this.mode !== "box" || !this.boxStart || !this.boxPreviewEnd) return preview;

    const rect = normalizeRect(this.boxStart, this.boxPreviewEnd);
    const style = this.boxStart.erase ? "light" : this.inferBoxStyle(rect);

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

    if (this.boxStart.erase) {
      for (const key of preview.keys()) {
        preview.set(key, BOX_PREVIEW_ERASE_CHAR);
      }
    }

    return preview;
  }

  private getConnectionGlyph(x: number, y: number): string {
    if (!this.isInsideCanvas(x, y)) return " ";

    let mask = 0;
    let hasHeavy = false;

    for (const direction of DIRECTIONS) {
      const counts = this.connections[y]![x]![direction];
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

  private commitLine(startX: number, startY: number, endX: number, endY: number, erase: boolean): void {
    const char = erase ? " " : this.brush;
    for (const point of this.getLinePoints(startX, startY, endX, endY)) {
      this.paintCell(point.x, point.y, char);
    }

    this.setStatus(
      erase
        ? `Erased line to ${endX + 1},${endY + 1}.`
        : `Drew line to ${endX + 1},${endY + 1} with "${this.brush}".`,
    );
  }

  private commitBox(startX: number, startY: number, endX: number, endY: number, erase: boolean): void {
    const rect = normalizeRect({ x: startX, y: startY }, { x: endX, y: endY });

    if (erase) {
      this.applyBoxPerimeter(rect, (x, y, direction) => this.removeConnectionAny(x, y, direction));

      const matchIndex = this.findLastMatchingBox(rect);
      if (matchIndex >= 0) {
        this.boxes.splice(matchIndex, 1);
      }

      this.setStatus(`Erased box edges ${this.describeRect(rect)}.`);
      return;
    }

    const style = this.inferBoxStyle(rect);
    this.applyBoxPerimeter(rect, (x, y, direction) => this.adjustConnection(x, y, direction, style, 1));
    this.boxes.push({ ...rect, style });
    this.setStatus(`Drew ${style} box ${this.describeRect(rect)}.`);
  }

  private inferBoxStyle(rect: Rect): LineStyle {
    const depth = this.boxes.filter(
      (box) => rect.left > box.left && rect.right < box.right && rect.top > box.top && rect.bottom < box.bottom,
    ).length;
    return depth % 2 === 0 ? "heavy" : "light";
  }

  private findLastMatchingBox(rect: Rect): number {
    for (let i = this.boxes.length - 1; i >= 0; i -= 1) {
      const box = this.boxes[i]!;
      if (box.left === rect.left && box.top === rect.top && box.right === rect.right && box.bottom === rect.bottom) {
        return i;
      }
    }
    return -1;
  }

  private describeRect(rect: Rect): string {
    return `${rect.left + 1},${rect.top + 1} → ${rect.right + 1},${rect.bottom + 1}`;
  }

  private applyBoxPerimeter(rect: Rect, applySegment: (x: number, y: number, direction: Direction) => void): void {
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

  private adjustConnection(x: number, y: number, direction: Direction, style: LineStyle, delta: number): void {
    if (!this.isInsideCanvas(x, y)) return;
    const offset = DIRECTION_DELTAS[direction];
    const nx = x + offset.dx;
    const ny = y + offset.dy;
    if (!this.isInsideCanvas(nx, ny)) return;

    const source = this.connections[y]![x]![direction];
    source[style] = Math.max(0, source[style] + delta);

    const opposite = OPPOSITE_DIRECTION[direction];
    const target = this.connections[ny]![nx]![opposite];
    target[style] = Math.max(0, target[style] + delta);
  }

  private removeConnectionAny(x: number, y: number, direction: Direction): void {
    if (!this.isInsideCanvas(x, y)) return;
    const offset = DIRECTION_DELTAS[direction];
    const nx = x + offset.dx;
    const ny = y + offset.dy;
    if (!this.isInsideCanvas(nx, ny)) return;

    const source = this.connections[y]![x]![direction];
    const style: LineStyle | null = source.heavy > 0 ? "heavy" : source.light > 0 ? "light" : null;
    if (!style) return;
    this.adjustConnection(x, y, direction, style, -1);
  }

  private isInsideCanvas(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.canvasWidth && y < this.canvasHeight;
  }

  private isRectInsideCanvas(rect: Rect, width = this.canvasWidth, height = this.canvasHeight): boolean {
    return rect.left >= 0 && rect.top >= 0 && rect.right < width && rect.bottom < height;
  }

  private paintCell(x: number, y: number, char: string): void {
    if (!this.isInsideCanvas(x, y)) return;
    this.canvas[y]![x] = normalizeCellCharacter(char);
  }

  private createSnapshot(): Snapshot {
    return {
      canvas: cloneCanvas(this.canvas),
      connections: cloneConnectionGrid(this.connections),
      boxes: cloneBoxes(this.boxes),
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
    const restoredCanvas = createCanvas(this.canvasWidth, this.canvasHeight);
    const restoredConnections = createConnectionGrid(this.canvasWidth, this.canvasHeight);

    const canvasCopyHeight = Math.min(this.canvasHeight, snapshot.canvas.length);
    const canvasCopyWidth = Math.min(this.canvasWidth, snapshot.canvas[0]?.length ?? 0);
    for (let y = 0; y < canvasCopyHeight; y += 1) {
      for (let x = 0; x < canvasCopyWidth; x += 1) {
        restoredCanvas[y]![x] = snapshot.canvas[y]![x] ?? " ";
      }
    }

    const connectionCopyHeight = Math.min(this.canvasHeight, snapshot.connections.length);
    const connectionCopyWidth = Math.min(this.canvasWidth, snapshot.connections[0]?.length ?? 0);
    for (let y = 0; y < connectionCopyHeight; y += 1) {
      for (let x = 0; x < connectionCopyWidth; x += 1) {
        const sourceCell = snapshot.connections[y]![x]!;
        const targetCell = restoredConnections[y]![x]!;
        for (const direction of DIRECTIONS) {
          targetCell[direction].light = sourceCell[direction].light;
          targetCell[direction].heavy = sourceCell[direction].heavy;
        }
      }
    }

    this.canvas = restoredCanvas;
    this.connections = restoredConnections;
    this.boxes = cloneBoxes(snapshot.boxes).filter((box) => this.isRectInsideCanvas(box));
    this.cursorX = Math.max(0, Math.min(this.cursorX, this.canvasWidth - 1));
    this.cursorY = Math.max(0, Math.min(this.cursorY, this.canvasHeight - 1));
    this.lineStart = null;
    this.linePreviewEnd = null;
    this.boxStart = null;
    this.boxPreviewEnd = null;
  }

  private setStatus(message: string): void {
    this.status = message;
  }
}
