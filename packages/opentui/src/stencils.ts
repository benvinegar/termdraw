import type { BoxStyle, DraftDrawObject } from "./draw-state.js";

export type StencilCategory = "layouts" | "windows" | "navigation" | "data" | "feedback";

export type StencilDefinition = {
  id: string;
  name: string;
  category: StencilCategory;
  description: string;
  tags: string[];
  width: number;
  height: number;
  create: () => DraftDrawObject[];
};

export const STENCIL_CATEGORY_OPTIONS: { id: StencilCategory; label: string }[] = [
  { id: "layouts", label: "Layouts" },
  { id: "windows", label: "Windows" },
  { id: "navigation", label: "Navigation" },
  { id: "data", label: "Data" },
  { id: "feedback", label: "Feedback" },
];

function box(
  left: number,
  top: number,
  right: number,
  bottom: number,
  style: BoxStyle = "light",
): DraftDrawObject {
  return { type: "box", left, top, right, bottom, style };
}

function text(x: number, y: number, content: string): DraftDrawObject {
  return { type: "text", x, y, content };
}

function line(x1: number, y1: number, x2: number, y2: number, brush = "|"): DraftDrawObject {
  return { type: "line", x1, y1, x2, y2, brush };
}

function paint(points: Array<[number, number]>, brush: string): DraftDrawObject {
  return {
    type: "paint",
    points: points.map(([x, y]) => ({ x, y })),
    brush,
  };
}

function rangePointsX(startX: number, endX: number, y: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let x = startX; x <= endX; x += 1) {
    points.push([x, y]);
  }
  return points;
}

function rangePointsY(x: number, startY: number, endY: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let y = startY; y <= endY; y += 1) {
    points.push([x, y]);
  }
  return points;
}

export const STENCIL_DEFINITIONS: StencilDefinition[] = [
  {
    id: "layout-sidebar",
    name: "Sidebar Layout",
    category: "layouts",
    description: "App shell with sidebar navigation and a main content pane.",
    tags: ["sidebar", "layout", "app", "navigation"],
    width: 38,
    height: 14,
    create: () => [
      box(0, 0, 37, 13),
      line(11, 1, 11, 12),
      text(2, 1, "Project"),
      text(2, 3, "> Inbox"),
      text(2, 4, "  Drafts"),
      text(2, 5, "  Archive"),
      text(14, 1, "Overview"),
      text(14, 3, "Content area"),
      text(14, 5, "- summary card"),
      text(14, 6, "- activity feed"),
    ],
  },
  {
    id: "layout-two-column",
    name: "Two Column Split",
    category: "layouts",
    description: "Balanced two-column content layout inside a frame.",
    tags: ["columns", "split", "layout", "content"],
    width: 38,
    height: 14,
    create: () => [
      box(0, 0, 37, 13),
      line(18, 1, 18, 12),
      text(2, 1, "Left pane"),
      text(2, 3, "- notes"),
      text(2, 4, "- checklist"),
      text(21, 1, "Right pane"),
      text(21, 3, "- preview"),
      text(21, 4, "- details"),
    ],
  },
  {
    id: "layout-inspector",
    name: "Inspector Layout",
    category: "layouts",
    description: "Primary canvas area with a right-side inspector panel.",
    tags: ["inspector", "sidebar", "layout", "editor"],
    width: 40,
    height: 14,
    create: () => [
      box(0, 0, 39, 13),
      line(28, 1, 28, 12),
      text(2, 1, "Canvas"),
      text(2, 3, "[ selected object ]"),
      text(31, 1, "Inspector"),
      text(31, 3, "Name"),
      text(31, 5, "Position"),
      text(31, 7, "Size"),
    ],
  },
  {
    id: "window-app",
    name: "App Window",
    category: "windows",
    description: "Window frame with title, content region, and status footer.",
    tags: ["window", "frame", "status", "app"],
    width: 36,
    height: 12,
    create: () => [
      box(0, 0, 35, 11),
      line(1, 2, 34, 2, "-"),
      line(1, 9, 34, 9, "-"),
      text(2, 1, "termDRAW App"),
      text(2, 4, "Main content"),
      text(2, 10, "Status: synced"),
    ],
  },
  {
    id: "dialog-modal",
    name: "Dialog / Modal",
    category: "feedback",
    description: "Centered confirmation dialog with primary and secondary actions.",
    tags: ["dialog", "modal", "confirm", "buttons"],
    width: 32,
    height: 10,
    create: () => [
      box(0, 0, 31, 9),
      text(2, 1, "Discard draft?"),
      text(2, 3, "Unsaved changes will be lost."),
      box(4, 6, 12, 8),
      box(18, 6, 27, 8),
      text(6, 7, "Cancel"),
      text(21, 7, "Discard"),
    ],
  },
  {
    id: "nav-tabs",
    name: "Tabs Panel",
    category: "navigation",
    description: "Tabbed panel with one active tab and a content body.",
    tags: ["tabs", "navigation", "panel", "header"],
    width: 36,
    height: 11,
    create: () => [
      box(0, 2, 35, 10),
      box(1, 0, 8, 2),
      box(9, 1, 16, 2),
      box(17, 1, 24, 2),
      text(3, 1, "Home"),
      text(11, 2, "Files"),
      text(19, 2, "Logs"),
      text(3, 5, "Active tab content"),
    ],
  },
  {
    id: "data-list",
    name: "List Panel",
    category: "data",
    description: "List view with a selected row and a vertical scrollbar.",
    tags: ["list", "rows", "scrollbar", "panel"],
    width: 32,
    height: 13,
    create: () => [
      box(0, 0, 31, 12),
      text(2, 1, "Items"),
      paint(rangePointsX(2, 26, 3), "█"),
      text(3, 3, "Selected row"),
      text(3, 5, "Second row"),
      text(3, 7, "Third row"),
      text(3, 9, "Fourth row"),
      paint(rangePointsY(28, 2, 10), "│"),
      paint(rangePointsY(28, 4, 6), "█"),
    ],
  },
  {
    id: "data-table",
    name: "Table",
    category: "data",
    description: "Simple table layout with headers, rows, and a scrollbar.",
    tags: ["table", "grid", "rows", "columns"],
    width: 40,
    height: 13,
    create: () => [
      box(0, 0, 39, 12),
      line(1, 2, 37, 2, "-"),
      line(12, 1, 12, 10),
      line(24, 1, 24, 10),
      text(2, 1, "Name"),
      text(14, 1, "Status"),
      text(26, 1, "Owner"),
      text(2, 4, "Alpha"),
      text(14, 4, "Open"),
      text(26, 4, "Ben"),
      text(2, 6, "Beta"),
      text(14, 6, "Draft"),
      text(26, 6, "Kai"),
      text(2, 8, "Gamma"),
      text(14, 8, "Done"),
      text(26, 8, "You"),
      paint(rangePointsY(37, 2, 10), "│"),
      paint(rangePointsY(37, 5, 7), "█"),
    ],
  },
];
