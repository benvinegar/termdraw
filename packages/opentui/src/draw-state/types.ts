/**
 * Shared draw-state constants and type definitions.
 *
 * This file defines the object model, tool enums, transient interaction state, render-grid
 * types, and the small constant tables that the rest of the draw-state internals build on.
 */
export const BRUSHES = ["#", "*", "+", "x", "o", ".", "•", "░", "▒", "▓"] as const;
export const BOX_STYLES = ["auto", "light", "heavy", "double"] as const;
export const LINE_STYLES = ["smooth", "light", "double"] as const;
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
export const TEXT_BORDER_MODES = ["none", "single", "double", "underline"] as const;

export type DrawMode = "select" | "box" | "line" | "paint" | "text";
export type BoxStyle = (typeof BOX_STYLES)[number];
export type LineStyle = (typeof LINE_STYLES)[number];
export type InkColor = (typeof INK_COLORS)[number];
export type TextBorderMode = (typeof TEXT_BORDER_MODES)[number];

export type CanvasGrid = string[][];
export type ColorGrid = (InkColor | null)[][];
export type Point = { x: number; y: number };
export type CanvasInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type Rect = { left: number; top: number; right: number; bottom: number };
export type ConnectionStyle = "light" | "heavy" | "double";
export type Direction = "n" | "e" | "s" | "w";
export type DirectionCounts = { light: number; heavy: number; double: number };
export type CellConnections = Record<Direction, DirectionCounts>;
export type ConnectionGrid = CellConnections[][];
export type BoxResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type LineEndpointHandle = "start" | "end";

export type BaseDrawObject = {
  id: string;
  z: number;
  parentId: string | null;
  color: InkColor;
};

export type BoxObject = BaseDrawObject & {
  type: "box";
  left: number;
  top: number;
  right: number;
  bottom: number;
  style: BoxStyle;
};

export type LineObject = BaseDrawObject & {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: LineStyle;
};

export type PaintObject = BaseDrawObject & {
  type: "paint";
  points: Point[];
  brush: string;
};

export type TextObject = BaseDrawObject & {
  type: "text";
  x: number;
  y: number;
  content: string;
  border: TextBorderMode;
};

export type DrawObject = BoxObject | LineObject | PaintObject | TextObject;

export type Snapshot = {
  objects: DrawObject[];
  selectedObjectIds: string[];
  selectedObjectId: string | null;
  activeTextObjectId: string | null;
  cursorX: number;
  cursorY: number;
  nextObjectNumber: number;
  nextZIndex: number;
  textBorderMode: TextBorderMode;
  textBorderModeIndex: number;
};

export type PendingSelection = { start: Point; end: Point };
export type PendingBox = { start: Point; end: Point };
export type PendingLine = { start: Point; end: Point };
export type PendingPaint = { points: Point[]; lastPoint: Point };

export type MoveDragState = {
  kind: "move";
  objectId: string;
  startMouse: Point;
  originalObjects: DrawObject[];
  pushedUndo: boolean;
  textEditOnClick: boolean;
};

export type ResizeBoxDragState = {
  kind: "resize-box";
  objectId: string;
  startMouse: Point;
  originalObject: BoxObject;
  originalObjects: DrawObject[];
  handle: BoxResizeHandle;
  pushedUndo: boolean;
};

export type LineEndpointDragState = {
  kind: "line-endpoint";
  objectId: string;
  startMouse: Point;
  originalObject: LineObject;
  endpoint: LineEndpointHandle;
  pushedUndo: boolean;
};

export type DragState = MoveDragState | ResizeBoxDragState | LineEndpointDragState;

export type EraseState = {
  erasedIds: Set<string>;
  pushedUndo: boolean;
};

export type HandleHit =
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

export type ObjectHit = {
  object: DrawObject;
  onTextContent: boolean;
};

export type PointerEventLike = {
  type: "down" | "up" | "drag" | "drag-end" | "scroll" | "move" | "drop" | "over" | "out";
  button: number;
  x: number;
  y: number;
  scrollDirection?: "up" | "down" | "left" | "right";
  shift?: boolean;
};

export const DEFAULT_CANVAS_INSETS: CanvasInsets = {
  left: 1,
  top: 3,
  right: 1,
  bottom: 2,
};
