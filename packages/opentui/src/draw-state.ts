/**
 * Home of the stateful `DrawState` coordinator.
 *
 * This file wires together tool state, selection state, undo/redo, pointer handling,
 * object transforms, scene caching, and the higher-level editor behaviors built on the
 * smaller helpers in `src/draw-state/`.
 */
import { MouseButton } from "@opentui/core";
import {
  clamp,
  getRectArea,
  getRectPerimeterPoints,
  isValidRect,
  normalizeRect,
  rectContainsPoint,
  rectContainsRect,
  rectsIntersect,
} from "./draw-state/geometry.js";
import {
  appendPaintSegment,
  constrainLinePoint,
  getLineRenderCharacters,
  mergeUniquePoints,
  pointFromKey,
  pointsEqual,
} from "./draw-state/line.js";
import {
  cloneObjects,
  getBoundsUnion,
  getBoxContentBounds,
  getBoxCornerPoints,
  getLineEndpointPoints,
  getObjectBounds,
  getObjectRenderCells,
  getObjectSelectionBounds,
  objectContainsPoint,
  translateObject,
} from "./draw-state/object-utils.js";
import {
  adjustConnection,
  applyBoxPerimeter,
  createCanvas,
  createColorGrid,
  createConnectionGrid,
  getBoxBorderGlyphs,
  getConnectionGlyph as getConnectionGlyphForGrid,
  paintConnectionColor,
} from "./draw-state/scene.js";
import {
  getTextContentOrigin,
  getTextRenderRect,
  getTextSelectionBounds,
  normalizeCellCharacter,
  padToWidth,
  splitGraphemes,
  truncateToCells,
  visibleCellCount,
} from "./text.js";
import {
  BRUSHES,
  BOX_STYLES,
  DEFAULT_CANVAS_INSETS,
  INK_COLORS,
  LINE_STYLES,
  TEXT_BORDER_MODES,
  type BoxObject,
  type BoxResizeHandle,
  type BoxStyle,
  type CanvasGrid,
  type CanvasInsets,
  type ColorGrid,
  type ConnectionGrid,
  type ConnectionStyle,
  type DragState,
  type DrawMode,
  type DrawObject,
  type EraseState,
  type HandleHit,
  type InkColor,
  type LineEndpointHandle,
  type LineObject,
  type LineStyle,
  type ObjectHit,
  type PaintObject,
  type PendingBox,
  type PendingLine,
  type PendingPaint,
  type PendingSelection,
  type PointerEventLike,
  type Point,
  type Rect,
  type Snapshot,
  type TextBorderMode,
  type TextObject,
} from "./draw-state/types.js";

export {
  BRUSHES,
  BOX_STYLES,
  INK_COLORS,
  LINE_STYLES,
  TEXT_BORDER_MODES,
  padToWidth,
  truncateToCells,
  visibleCellCount,
};
export type {
  BoxStyle,
  CanvasInsets,
  DrawMode,
  DrawObject,
  InkColor,
  LineStyle,
  PointerEventLike,
  TextBorderMode,
} from "./draw-state/types.js";

const MAX_HISTORY = 100;
const HANDLE_CHARACTER = "●";

/**
 * Coordinates the editable termDRAW scene, tool state, selection state, and rendering caches.
 */
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
  private lineStyle = LINE_STYLES[0] as LineStyle;
  private lineStyleIndex = 0;
  private textBorderMode = TEXT_BORDER_MODES[0] as TextBorderMode;
  private textBorderModeIndex = 0;
  private inkColor = INK_COLORS[0] as InkColor;
  private inkColorIndex = 0;

  private objects: DrawObject[] = [];
  private selectedObjectIds: string[] = [];
  private selectedObjectId: string | null = null;
  private activeTextObjectId: string | null = null;
  private textEntryArmed = false;

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
    "Line mode: drag on empty space to create a clean line object, hold Shift to constrain horizontal/vertical, or drag an existing object to move it.";

  private sceneDirty = true;
  private renderCanvas: CanvasGrid = [];
  private renderCanvasColors: ColorGrid = [];
  private renderConnections: ConnectionGrid = [];
  private renderConnectionColors: ColorGrid = [];

  /** Creates a new draw state sized to the provided viewport and canvas insets. */
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

  public get currentLineStyle(): LineStyle {
    return this.lineStyle;
  }

  public get currentTextBorderMode(): TextBorderMode {
    return this.textBorderMode;
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

  public get isTextEntryArmed(): boolean {
    return this.textEntryArmed;
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

  /** Recomputes the drawable canvas from the current viewport and inset configuration. */
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

  /** Routes pointer input into the active tool, drag interaction, or erase session. */
  public handlePointerEvent(event: PointerEventLike): void {
    if (event.type === "scroll") {
      const direction =
        event.scrollDirection === "down" || event.scrollDirection === "left" ? -1 : 1;

      if (this.mode === "paint") {
        this.cycleBrush(direction);
      } else if (this.mode === "box") {
        this.cycleBoxStyle(direction);
      } else if (this.mode === "line") {
        this.cycleLineStyle(direction);
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
      this.syncPointerInteraction(point, event.shift === true);
      this.finishPointerInteraction(point, insideCanvas);
      return;
    }

    if (event.type === "drag") {
      this.cursorX = clampedX;
      this.cursorY = clampedY;

      if (this.dragState) {
        this.updateDraggedObject(point, event.shift === true);
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
        const nextPoint =
          event.shift === true ? constrainLinePoint(this.pendingLine.start, point) : point;
        this.pendingLine.end = nextPoint;
        this.setStatus(`Sizing line to ${nextPoint.x + 1},${nextPoint.y + 1}.`);
        return;
      }

      if (this.pendingPaint) {
        this.pendingPaint.points = appendPaintSegment(
          this.pendingPaint.points,
          this.pendingPaint.lastPoint,
          point,
        );
        this.pendingPaint.lastPoint = point;
        this.setStatus(`Brush stroke to ${point.x + 1},${point.y + 1}.`);
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
          `Line start at ${canvasX + 1},${canvasY + 1}. Drag to endpoint, hold Shift to constrain, release to commit.`,
        );
        return;
      case "paint":
        this.setSelectedObjects([]);
        this.activeTextObjectId = null;
        this.pendingPaint = {
          points: [{ x: canvasX, y: canvasY }],
          lastPoint: { x: canvasX, y: canvasY },
        };
        this.setStatus(`Brush start at ${canvasX + 1},${canvasY + 1}. Drag to draw freehand.`);
        return;
      case "text":
        this.placeTextCursor(canvasX, canvasY);
        return;
    }
  }

  /** Returns the compact UI label for the active tool mode. */
  public getModeLabel(): string {
    switch (this.mode) {
      case "select":
        return "SELECT";
      case "line":
        return "LINE";
      case "box":
        return "BOX";
      case "paint":
        return "BRUSH";
      case "text":
        return "TEXT";
    }
  }

  /** Returns the in-progress overlay characters for the current pointer interaction. */
  public getActivePreviewCharacters(): Map<string, string> {
    if (this.pendingPaint) return this.getPaintPreviewCharacters();
    if (this.pendingLine) return this.getLinePreviewCharacters();
    if (this.pendingBox) return this.getBoxPreviewCharacters();
    return new Map<string, string>();
  }

  /** Returns the rendered cell keys currently covered by the selection overlay. */
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

  /** Returns the dotted marquee preview for an in-progress selection drag. */
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

  /** Returns resize or endpoint handles for the current single-object selection. */
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

  /** Clears the current selection and active text edit state. */
  public clearSelection(): boolean {
    const hadSelection =
      this.selectedObjectIds.length > 0 || this.activeTextObjectId !== null || this.textEntryArmed;
    this.setSelectedObjects([]);
    this.activeTextObjectId = null;
    this.textEntryArmed = false;
    this.setStatus(hadSelection ? "Selection cleared." : "Nothing selected.");
    return hadSelection;
  }

  /** Returns the final rendered character at a canvas cell. */
  public getCompositeCell(x: number, y: number): string {
    this.ensureScene();
    const ink = this.renderCanvas[y]![x] ?? " ";
    if (ink !== " ") return ink;
    return this.getConnectionGlyph(x, y);
  }

  /** Returns the final rendered color at a canvas cell. */
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

  /** Moves the keyboard cursor while keeping it inside the canvas bounds. */
  public moveCursor(dx: number, dy: number): void {
    this.cursorX = Math.max(0, Math.min(this.canvasWidth - 1, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.canvasHeight - 1, this.cursorY + dy));
    if (this.mode === "text") {
      this.activeTextObjectId = null;
    }
    this.setStatus(`Cursor ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  /** Translates the selected object tree by the requested delta when possible. */
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

  /** Sets the active brush character used for paint strokes. */
  public setBrush(char: string): void {
    this.brush = normalizeCellCharacter(char);
    const idx = BRUSHES.indexOf(this.brush as (typeof BRUSHES)[number]);
    this.brushIndex = idx >= 0 ? idx : 0;
    this.setStatus(`Brush set to "${this.brush}".`);
  }

  /** Cycles through the predefined brush palette. */
  public cycleBrush(direction: 1 | -1): void {
    this.brushIndex = (this.brushIndex + direction + BRUSHES.length) % BRUSHES.length;
    this.brush = BRUSHES[this.brushIndex] ?? this.brush;
    this.setStatus(`Brush set to "${this.brush}".`);
  }

  /** Sets the active ink color and reapplies it to the current selection. */
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

  /** Cycles through the available ink colors. */
  public cycleInkColor(direction: 1 | -1): void {
    this.inkColorIndex = (this.inkColorIndex + direction + INK_COLORS.length) % INK_COLORS.length;
    this.inkColor = INK_COLORS[this.inkColorIndex] ?? this.inkColor;
    this.setStatus(`Color set to ${this.describeInkColor(this.inkColor)}.`);
  }

  /** Sets the active box border style. */
  public setBoxStyle(style: BoxStyle): void {
    this.boxStyle = style;
    const idx = BOX_STYLES.indexOf(style);
    this.boxStyleIndex = idx >= 0 ? idx : 0;
    this.setStatus(`Box style set to ${this.describeBoxStyle(style)}.`);
  }

  /** Cycles through the available box border styles. */
  public cycleBoxStyle(direction: 1 | -1): void {
    this.boxStyleIndex = (this.boxStyleIndex + direction + BOX_STYLES.length) % BOX_STYLES.length;
    this.boxStyle = BOX_STYLES[this.boxStyleIndex] ?? this.boxStyle;
    this.setStatus(`Box style set to ${this.describeBoxStyle(this.boxStyle)}.`);
  }

  /** Sets the active line style. */
  public setLineStyle(style: LineStyle): void {
    this.lineStyle = style;
    const idx = LINE_STYLES.indexOf(style);
    this.lineStyleIndex = idx >= 0 ? idx : 0;
    this.setStatus(`Line style set to ${this.describeLineStyle(style)}.`);
  }

  /** Cycles through the available line styles. */
  public cycleLineStyle(direction: 1 | -1): void {
    this.lineStyleIndex =
      (this.lineStyleIndex + direction + LINE_STYLES.length) % LINE_STYLES.length;
    this.lineStyle = LINE_STYLES[this.lineStyleIndex] ?? this.lineStyle;
    this.setStatus(`Line style set to ${this.describeLineStyle(this.lineStyle)}.`);
  }

  /** Sets the active text border mode. */
  public setTextBorderMode(mode: TextBorderMode): void {
    this.textBorderMode = mode;
    const idx = TEXT_BORDER_MODES.indexOf(mode);
    this.textBorderModeIndex = idx >= 0 ? idx : 0;
    this.setStatus(`Text border set to ${this.describeTextBorderMode(mode)}.`);
  }

  /** Cycles through the available text border modes. */
  public cycleTextBorderMode(direction: 1 | -1): void {
    this.textBorderModeIndex =
      (this.textBorderModeIndex + direction + TEXT_BORDER_MODES.length) % TEXT_BORDER_MODES.length;
    this.textBorderMode = TEXT_BORDER_MODES[this.textBorderModeIndex] ?? this.textBorderMode;
    this.setStatus(`Text border set to ${this.describeTextBorderMode(this.textBorderMode)}.`);
  }

  /** Advances to the next drawing mode in the standard tool order. */
  public cycleMode(): void {
    const order: DrawMode[] = ["select", "box", "line", "paint", "text"];
    const currentIndex = order.indexOf(this.mode);
    const next = order[(currentIndex + 1) % order.length] ?? "line";
    this.setMode(next);
  }

  /** Switches tools and clears transient interaction state that does not survive mode changes. */
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
        `Line mode (${this.describeLineStyle(this.lineStyle)}): drag on empty space to create a line. Hold Shift to constrain horizontal/vertical. Click objects to move them, or line endpoints to adjust.`,
      );
    } else if (next === "box") {
      this.setStatus(
        `Box mode (${this.describeBoxStyle(this.boxStyle)}): drag on empty space to create a box. Click objects to move them, or drag box corners to resize.`,
      );
    } else if (next === "paint") {
      this.setStatus(
        "Brush mode: drag on empty space to draw freehand. Click objects to move them, and use the current brush for freehand strokes.",
      );
    } else {
      this.setStatus(
        `Text mode (${this.describeTextBorderMode(this.textBorderMode)}): click empty space to type, click text to edit, and use its virtual selection box to move it.`,
      );
    }
  }

  /** Creates a one-cell paint or line object at the current cursor position. */
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
      this.setStatus(`Stamped brush "${this.brush}" at ${this.cursorX + 1},${this.cursorY + 1}.`);
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
      style: this.lineStyle,
    };
    this.setObjects([...this.objects, object]);
    this.setSelectedObjects([object.id], object.id);
    this.activeTextObjectId = null;
    this.setStatus(`Stamped "•" at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  /** Deletes the topmost object under the keyboard cursor. */
  public eraseAtCursor(): void {
    if (this.deleteTopmostObjectAt(this.cursorX, this.cursorY)) return;
    this.setStatus(`Nothing to erase at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  /** Appends text into the active text object or starts a new one at the cursor. */
  public insertCharacter(input: string): void {
    if (!this.textEntryArmed && !this.getActiveTextObject()) {
      this.setStatus("Click to start a text box, or click existing text to edit it.");
      return;
    }

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
      this.textEntryArmed = true;
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
      border: this.textBorderMode,
    };
    this.setObjects([...this.objects, object]);
    this.setSelectedObjects([object.id], object.id);
    this.activeTextObjectId = object.id;
    this.textEntryArmed = true;
    this.cursorX = Math.min(this.canvasWidth - 1, this.cursorX + 1);
    this.setStatus(`Created ${this.describeObject(this.getObjectById(object.id) ?? object)}.`);
  }

  /** Deletes the last grapheme from the active text object or erases under the cursor. */
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
      this.textEntryArmed = false;
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
    this.textEntryArmed = true;
    this.cursorX = Math.min(this.canvasWidth - 1, updated.x + visibleCellCount(updated.content));
    this.cursorY = updated.y;
    this.setStatus(`Backspaced ${this.describeObject(updated)}.`);
  }

  /** Deletes the current selection or the topmost object under the cursor. */
  public deleteAtCursor(): void {
    if (this.deleteSelectedObject()) return;
    if (this.deleteTopmostObjectAt(this.cursorX, this.cursorY)) return;
    this.setStatus(`Nothing to delete at ${this.cursorX + 1},${this.cursorY + 1}.`);
  }

  /** Deletes the current selection and returns whether anything was removed. */
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

  /** Removes every object from the scene. */
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

  /** Restores the previous snapshot when one exists. */
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

  /** Reapplies the next redo snapshot when one exists. */
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

  /** Exports the rendered canvas with surrounding empty rows trimmed away. */
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

  /** Attempts to start a resize, endpoint drag, or move interaction at the given cell. */
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

  /** Begins moving an object or selection rooted at the clicked object. */
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

  /** Arms text entry at the requested canvas cell. */
  private placeTextCursor(x: number, y: number): void {
    this.setSelectedObjects([]);
    this.activeTextObjectId = null;
    this.textEntryArmed = true;
    this.cursorX = x;
    this.cursorY = y;
    this.setStatus(`Text box start at ${x + 1},${y + 1}. Type to begin, Esc to stop typing.`);
  }

  /** Starts a right-drag erase session that only removes each object once. */
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

  /** Updates the active transient pointer interaction to the latest pointer location. */
  private syncPointerInteraction(point: Point, constrainLineAxis = false): void {
    if (this.dragState) {
      this.updateDraggedObject(point, constrainLineAxis);
      return;
    }

    if (this.pendingSelection) {
      this.pendingSelection.end = point;
      return;
    }

    if (this.pendingBox) {
      this.pendingBox.end = point;
      return;
    }

    if (this.pendingLine) {
      this.pendingLine.end = constrainLineAxis
        ? constrainLinePoint(this.pendingLine.start, point)
        : point;
      return;
    }

    if (this.pendingPaint) {
      this.pendingPaint.points = appendPaintSegment(
        this.pendingPaint.points,
        this.pendingPaint.lastPoint,
        point,
      );
      this.pendingPaint.lastPoint = point;
    }
  }

  /** Commits or cancels the current transient pointer interaction. */
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
        style: this.lineStyle,
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
          this.textEntryArmed = true;
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

  /** Applies the latest drag position to the active move, resize, or endpoint edit. */
  private updateDraggedObject(point: Point, constrainLineAxis = false): void {
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
          constrainLineAxis,
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

  /** Keeps stored drag snapshots aligned with any z-index changes made during dragging. */
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

  /** Erases the topmost object at a cell during an active erase session. */
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
      this.textEntryArmed = false;
    }
    this.setStatus(`Deleted ${this.describeObject(hit)}.`);
  }

  /** Deletes the topmost object at a cell and reports whether anything changed. */
  private deleteTopmostObjectAt(x: number, y: number): boolean {
    const hit = this.findTopmostObjectAt(x, y);
    if (!hit) return false;

    this.pushUndo();
    this.removeObjectById(hit.id);
    this.setSelectedObjects([]);
    if (this.activeTextObjectId === hit.id) {
      this.activeTextObjectId = null;
      this.textEntryArmed = false;
    }
    this.setStatus(`Deleted ${this.describeObject(hit)}.`);
    return true;
  }

  /** Captures the undoable editor state needed to restore the scene later. */
  private createSnapshot(): Snapshot {
    return {
      objects: cloneObjects(this.objects),
      selectedObjectIds: [...this.selectedObjectIds],
      selectedObjectId: this.selectedObjectId,
      activeTextObjectId: this.activeTextObjectId,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      nextObjectNumber: this.nextObjectNumber,
      nextZIndex: this.nextZIndex,
      textBorderMode: this.textBorderMode,
      textBorderModeIndex: this.textBorderModeIndex,
    };
  }

  /** Pushes the current state onto the undo stack and clears redo history. */
  private pushUndo(): void {
    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /** Restores editor state from an undo or redo snapshot. */
  private restoreSnapshot(snapshot: Snapshot): void {
    this.objects = this.recomputeParentAssignments(
      cloneObjects(snapshot.objects).map((object) => this.shiftObjectInsideCanvas(object)),
    );
    this.selectedObjectIds = [...snapshot.selectedObjectIds];
    this.selectedObjectId = snapshot.selectedObjectId;
    this.activeTextObjectId = snapshot.activeTextObjectId;
    this.syncSelection();
    this.cursorX = Math.max(0, Math.min(snapshot.cursorX, this.canvasWidth - 1));
    this.cursorY = Math.max(0, Math.min(snapshot.cursorY, this.canvasHeight - 1));
    this.nextObjectNumber = snapshot.nextObjectNumber;
    this.nextZIndex = snapshot.nextZIndex;
    this.textBorderMode = snapshot.textBorderMode;
    this.textBorderModeIndex = snapshot.textBorderModeIndex;
    this.textEntryArmed = this.activeTextObjectId !== null;
    this.pendingSelection = null;
    this.pendingLine = null;
    this.pendingBox = null;
    this.pendingPaint = null;
    this.dragState = null;
    this.eraseState = null;
    this.markSceneDirty();
  }

  /** Rebuilds cached render buffers when scene content has changed. */
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
          const rendered = getLineRenderCharacters(
            { x: object.x1, y: object.y1 },
            { x: object.x2, y: object.y2 },
            object.style,
          );
          for (const [key, char] of rendered) {
            const { x, y } = pointFromKey(key);
            this.paintRenderCell(x, y, char, object.color);
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
          const contentOrigin = getTextContentOrigin(object);
          if (object.border !== "none") {
            const contentWidth = Math.max(1, visibleCellCount(object.content));
            const left = object.x;
            const top = object.y;
            const right = object.x + contentWidth + 1;
            const bottom = object.y + 2;
            if (object.border === "underline") {
              for (let x = contentOrigin.x; x < contentOrigin.x + contentWidth; x += 1) {
                this.paintRenderCell(x, bottom, "─", object.color);
              }
            } else {
              const horizontal = object.border === "double" ? "═" : "─";
              const vertical = object.border === "double" ? "║" : "│";
              const topLeft = object.border === "double" ? "╔" : "┌";
              const topRight = object.border === "double" ? "╗" : "┐";
              const bottomLeft = object.border === "double" ? "╚" : "└";
              const bottomRight = object.border === "double" ? "╝" : "┘";

              this.paintRenderCell(left, top, topLeft, object.color);
              this.paintRenderCell(right, top, topRight, object.color);
              this.paintRenderCell(left, bottom, bottomLeft, object.color);
              this.paintRenderCell(right, bottom, bottomRight, object.color);
              for (let x = left + 1; x < right; x += 1) {
                this.paintRenderCell(x, top, horizontal, object.color);
                this.paintRenderCell(x, bottom, horizontal, object.color);
              }
              this.paintRenderCell(left, top + 1, vertical, object.color);
              this.paintRenderCell(right, top + 1, vertical, object.color);
            }
          }

          for (const [index, segment] of splitGraphemes(object.content).entries()) {
            this.paintRenderCell(contentOrigin.x + index, contentOrigin.y, segment, object.color);
          }
          break;
        }
      }
    }

    this.sceneDirty = false;
  }

  /** Writes a normalized character and color into the cached render canvas. */
  private paintRenderCell(x: number, y: number, char: string, color: InkColor): void {
    if (!this.isInsideCanvas(x, y)) return;
    this.renderCanvas[y]![x] = normalizeCellCharacter(char);
    this.renderCanvasColors[y]![x] = color;
  }

  /** Returns the composed box-drawing glyph for the connection grid at a cell. */
  private getConnectionGlyph(x: number, y: number): string {
    return getConnectionGlyphForGrid(
      this.renderConnections,
      x,
      y,
      this.canvasWidth,
      this.canvasHeight,
    );
  }

  /** Builds the preview overlay for an in-progress line drag. */
  private getLinePreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (!this.pendingLine) return preview;

    for (const [key, char] of getLineRenderCharacters(
      this.pendingLine.start,
      this.pendingLine.end,
      this.lineStyle,
    )) {
      const { x, y } = pointFromKey(key);
      if (!this.isInsideCanvas(x, y)) continue;
      preview.set(key, char);
    }

    return preview;
  }

  /** Builds the preview overlay for an in-progress paint stroke. */
  private getPaintPreviewCharacters(): Map<string, string> {
    const preview = new Map<string, string>();
    if (!this.pendingPaint) return preview;

    for (const point of this.pendingPaint.points) {
      if (!this.isInsideCanvas(point.x, point.y)) continue;
      preview.set(`${point.x},${point.y}`, this.brush);
    }

    return preview;
  }

  /** Builds the preview overlay for an in-progress box drag. */
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

  /** Normalizes auto box styling into a concrete connection style. */
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

  /** Alternates auto box weight based on nesting depth inside other boxes. */
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

  /** Looks up an object by id. */
  private getObjectById(id: string): DrawObject | null {
    return this.objects.find((object) => object.id === id) ?? null;
  }

  /** Returns whether the given object id is currently selected. */
  private isObjectSelected(id: string): boolean {
    return this.selectedObjectIds.includes(id) || this.selectedObjectId === id;
  }

  /** Returns the primary selected object when one exists. */
  private getSelectedObject(): DrawObject | null {
    if (!this.selectedObjectId) return null;
    return this.getObjectById(this.selectedObjectId);
  }

  /** Returns the selected objects in stable selection order. */
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

  /** Returns selected objects that are not descendants of other selected objects. */
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

  /** Returns the full object trees rooted at the selected top-level objects. */
  private getSelectedObjectTrees(): DrawObject[] {
    const treeIds = new Set<string>();

    for (const object of this.getSelectedRootObjects()) {
      for (const treeObject of this.getObjectTree(object.id)) {
        treeIds.add(treeObject.id);
      }
    }

    return this.objects.filter((object) => treeIds.has(object.id));
  }

  /** Returns the object tree that should move when the given object is dragged. */
  private getMoveSelectionForObject(object: DrawObject): DrawObject[] {
    if (!this.isObjectSelected(object.id) || this.selectedObjectIds.length <= 1) {
      return this.getObjectTree(object.id);
    }

    return this.getSelectedObjectTrees();
  }

  /** Returns the text object currently being edited, if any. */
  private getActiveTextObject(): TextObject | null {
    if (!this.activeTextObjectId) return null;
    const object = this.getObjectById(this.activeTextObjectId);
    return object?.type === "text" ? object : null;
  }

  /** Returns the object identified by `id` plus all of its descendants. */
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

  /** Reassigns parent boxes so each object belongs to the smallest containing box. */
  private recomputeParentAssignments(objects: DrawObject[]): DrawObject[] {
    return objects.map((object) => {
      const bounds = getObjectBounds(object);
      // Prefer the smallest containing box so nested boxes form the parent tree users expect.
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

  /** Replaces the scene object list and refreshes dependent selection and render state. */
  private setObjects(nextObjects: DrawObject[]): void {
    this.objects = this.recomputeParentAssignments(nextObjects);
    this.syncSelection();
    this.markSceneDirty();
  }

  /** Replaces a single object in the scene by id. */
  private replaceObject(nextObject: DrawObject): void {
    this.replaceObjects([nextObject]);
  }

  /** Replaces multiple objects in the scene by id. */
  private replaceObjects(nextObjects: DrawObject[]): void {
    const replacementMap = new Map(nextObjects.map((object) => [object.id, object]));
    this.setObjects(this.objects.map((object) => replacementMap.get(object.id) ?? object));
  }

  /** Removes a single object from the scene. */
  private removeObjectById(id: string): void {
    this.setObjects(this.objects.filter((object) => object.id !== id));
  }

  /** Updates multi-selection state while preserving a valid primary selection. */
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

  /** Drops dangling selection references after scene changes. */
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

  /** Finds the topmost resize or endpoint handle at a canvas cell. */
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

  /** Finds the topmost object occupying a canvas cell. */
  private findTopmostObjectAt(x: number, y: number): DrawObject | null {
    const hit = this.findTopmostObjectHitAt(x, y);
    return hit?.object ?? null;
  }

  /** Finds the topmost object hit and whether the click landed on text content. */
  private findTopmostObjectHitAt(x: number, y: number): ObjectHit | null {
    const indexedObjects = this.objects.map((object, index) => ({ object, index }));
    indexedObjects.sort((a, b) => b.object.z - a.object.z || b.index - a.index);

    for (const { object } of indexedObjects) {
      if (object.type === "text") {
        const contentOrigin = getTextContentOrigin(object);
        const onTextContent =
          y === contentOrigin.y &&
          x >= contentOrigin.x &&
          x < contentOrigin.x + visibleCellCount(object.content);
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

  /** Returns every object whose selection bounds intersect the marquee. */
  private getObjectsWithinSelectionRect(rect: Rect): DrawObject[] {
    return this.objects.filter((object) => rectsIntersect(getObjectSelectionBounds(object), rect));
  }

  /** Translates an object while clamping it inside the canvas bounds. */
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

  /** Translates an object tree while clamping the entire group inside the canvas. */
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

  /** Resizes a box from one handle while keeping it inside the canvas. */
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

  /** Resizes a box and remaps its descendants into the resized content area. */
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

  /** Remaps a child object from one parent-content rectangle into another. */
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

  /** Maps a point proportionally from one rectangle into another. */
  private mapPointBetweenRects(point: Point, from: Rect, to: Rect): Point {
    return {
      x: this.mapAxisBetweenRanges(point.x, from.left, from.right, to.left, to.right),
      y: this.mapAxisBetweenRanges(point.y, from.top, from.bottom, to.top, to.bottom),
    };
  }

  /** Maps a scalar value proportionally between two inclusive ranges. */
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

    // Preserve the child's relative position within the old range when remapping into the new one.
    const ratio = (value - fromStart) / (fromEnd - fromStart);
    const mapped = Math.round(toStart + ratio * (toEnd - toStart));
    const min = Math.min(toStart, toEnd);
    const max = Math.max(toStart, toEnd);
    return clamp(mapped, min, max);
  }

  /** Keeps a text object fully inside a target rectangle after remapping. */
  private clampTextIntoRect(text: TextObject, rect: Rect): TextObject {
    if (!isValidRect(rect)) return text;

    const renderRect = getTextRenderRect(text);
    const width = renderRect.right - renderRect.left + 1;
    const height = renderRect.bottom - renderRect.top + 1;
    const minX = rect.left;
    const maxX = rect.right - width + 1;
    const minY = rect.top;
    const maxY = rect.bottom - height + 1;

    return {
      ...text,
      x: maxX >= minX ? clamp(text.x, minX, maxX) : rect.left,
      y: maxY >= minY ? clamp(text.y, minY, maxY) : rect.top,
    };
  }

  /** Moves one endpoint of a line while honoring canvas bounds and axis constraints. */
  private adjustLineEndpointWithinCanvas(
    line: LineObject,
    endpoint: LineEndpointHandle,
    point: Point,
    constrainLineAxis = false,
  ): LineObject {
    const clampedPoint = this.clampPointInsideCanvas(point);
    const anchor = endpoint === "start" ? { x: line.x2, y: line.y2 } : { x: line.x1, y: line.y1 };
    const nextPoint = constrainLineAxis ? constrainLinePoint(anchor, clampedPoint) : clampedPoint;

    if (endpoint === "start") {
      return {
        ...line,
        x1: nextPoint.x,
        y1: nextPoint.y,
      };
    }

    return {
      ...line,
      x2: nextPoint.x,
      y2: nextPoint.y,
    };
  }

  /** Returns the fixed anchor corner opposite the dragged resize handle. */
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

  /** Clamps a point into the current canvas bounds. */
  private clampPointInsideCanvas(point: Point): Point {
    return {
      x: clamp(point.x, 0, this.canvasWidth - 1),
      y: clamp(point.y, 0, this.canvasHeight - 1),
    };
  }

  /** Adjusts a resized box point so the box never collapses to a single cell. */
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

  /** Shifts an object just enough to bring it fully back inside the canvas. */
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

  /** Brings a group of objects to the front while preserving their relative stacking order. */
  private bringObjectsToFront(objects: DrawObject[]): DrawObject[] {
    const byId = new Map<string, DrawObject>();

    for (const object of [...objects].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id))) {
      byId.set(object.id, this.bringObjectToFront(object));
    }

    return objects.map((object) => byId.get(object.id) ?? object);
  }

  /** Allocates the next stable object id. */
  private createObjectId(): string {
    const id = `obj-${this.nextObjectNumber}`;
    this.nextObjectNumber += 1;
    return id;
  }

  /** Allocates the next topmost z-index. */
  private allocateZIndex(): number {
    const z = this.nextZIndex;
    this.nextZIndex += 1;
    return z;
  }

  /** Formats rectangle bounds for user-facing status text. */
  private describeRect(rect: Rect): string {
    return `${rect.left + 1},${rect.top + 1} → ${rect.right + 1},${rect.bottom + 1}`;
  }

  /** Formats a line style label for user-facing status text. */
  private describeLineStyle(style: LineStyle): string {
    switch (style) {
      case "smooth":
        return "Smooth";
      case "light":
        return "Single";
      case "double":
        return "Double";
    }
  }

  /** Formats a box style label for user-facing status text. */
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

  /** Formats a text border label for user-facing status text. */
  private describeTextBorderMode(mode: TextBorderMode): string {
    switch (mode) {
      case "none":
        return "No border";
      case "single":
        return "Single";
      case "double":
        return "Double";
      case "underline":
        return "Underline";
    }
  }

  /** Formats an ink color label for user-facing status text. */
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

  /** Formats an object description for user-facing status text. */
  private describeObject(object: DrawObject): string {
    switch (object.type) {
      case "box":
        return `box ${this.describeRect(object)}`;
      case "line":
        return `line ${object.x1 + 1},${object.y1 + 1} → ${object.x2 + 1},${object.y2 + 1}`;
      case "paint": {
        const bounds = getObjectBounds(object);
        return `brush stroke ${this.describeRect(bounds)}`;
      }
      case "text":
        return `text "${object.content}" at ${object.x + 1},${object.y + 1}`;
    }
  }

  /** Returns whether two objects have equivalent editable state. */
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
          a.style === (b as LineObject).style
        );
      case "paint":
        return (
          a.brush === (b as PaintObject).brush && pointsEqual(a.points, (b as PaintObject).points)
        );
      case "text":
        return (
          a.x === (b as TextObject).x &&
          a.y === (b as TextObject).y &&
          a.content === (b as TextObject).content &&
          a.border === (b as TextObject).border
        );
    }
  }

  /** Returns whether two object lists are equal by id and editable state. */
  private objectListsEqual(a: DrawObject[], b: DrawObject[]): boolean {
    if (a.length !== b.length) return false;

    const byId = new Map(b.map((object) => [object.id, object]));
    return a.every((object) => {
      const other = byId.get(object.id);
      return other ? this.objectsEqual(object, other) : false;
    });
  }

  /** Returns whether a canvas coordinate is inside the drawable area. */
  private isInsideCanvas(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.canvasWidth && y < this.canvasHeight;
  }

  /** Marks cached render buffers as stale. */
  private markSceneDirty(): void {
    this.sceneDirty = true;
  }

  /** Updates the user-facing status message. */
  private setStatus(message: string): void {
    this.status = message;
  }
}
