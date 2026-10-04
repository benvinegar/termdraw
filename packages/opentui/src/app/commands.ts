import type { KeyEvent } from "@opentui/core";
import type { DrawIntent, DrawIntentDispatch } from "../draw-state/intent.js";

/** Identifies whether a command changes the document, editor state, or host environment. */
export type TermDrawCommandLocus = "document" | "editor-local" | "host-only";

/** Declarative metadata for a command that can be invoked by key, pointer, or ID. */
type TermDrawCommandDefinition = {
  id: string;
  title: string;
  defaultKeys: readonly string[];
  locus: TermDrawCommandLocus;
};

export type TermDrawCommandKeyOptions = { cancelOnCtrlC?: boolean };

/** The complete renderer-neutral command vocabulary exposed by termDRAW. */
export const TERM_DRAW_COMMAND_CATALOG = [
  {
    id: "termdraw.app.cancel",
    title: "Cancel",
    defaultKeys: ["ctrl+q"],
    locus: "host-only",
  },
  {
    id: "termdraw.text.finish",
    title: "Finish text entry",
    defaultKeys: ["enter"],
    locus: "editor-local",
  },
  { id: "termdraw.art.accept", title: "Accept art", defaultKeys: ["enter"], locus: "host-only" },
  { id: "termdraw.art.export", title: "Export art", defaultKeys: ["ctrl+s"], locus: "host-only" },
  {
    id: "termdraw.document.save",
    title: "Save diagram",
    defaultKeys: ["ctrl+d"],
    locus: "host-only",
  },
  {
    id: "termdraw.selection.clear",
    title: "Clear selection",
    defaultKeys: ["escape"],
    locus: "editor-local",
  },
  {
    id: "termdraw.tool.next",
    title: "Next tool",
    defaultKeys: ["tab", "ctrl+t"],
    locus: "editor-local",
  },
  { id: "termdraw.tool.select", title: "Select tool", defaultKeys: ["a"], locus: "editor-local" },
  { id: "termdraw.tool.box", title: "Box tool", defaultKeys: ["u"], locus: "editor-local" },
  { id: "termdraw.tool.line", title: "Line tool", defaultKeys: ["p"], locus: "editor-local" },
  { id: "termdraw.tool.elbow", title: "Elbow tool", defaultKeys: ["e"], locus: "editor-local" },
  { id: "termdraw.tool.paint", title: "Brush tool", defaultKeys: ["b"], locus: "editor-local" },
  { id: "termdraw.tool.text", title: "Text tool", defaultKeys: ["t"], locus: "editor-local" },
  {
    id: "termdraw.history.redo",
    title: "Redo",
    defaultKeys: ["ctrl+y", "ctrl+shift+z"],
    locus: "document",
  },
  { id: "termdraw.history.undo", title: "Undo", defaultKeys: ["ctrl+z"], locus: "document" },
  {
    id: "termdraw.canvas.clear",
    title: "Clear canvas",
    defaultKeys: ["ctrl+x"],
    locus: "document",
  },
  { id: "termdraw.cursor.up", title: "Move up", defaultKeys: ["up"], locus: "document" },
  { id: "termdraw.cursor.down", title: "Move down", defaultKeys: ["down"], locus: "document" },
  { id: "termdraw.cursor.left", title: "Move left", defaultKeys: ["left"], locus: "document" },
  { id: "termdraw.cursor.right", title: "Move right", defaultKeys: ["right"], locus: "document" },
  {
    id: "termdraw.style.previous",
    title: "Previous style",
    defaultKeys: ["["],
    locus: "editor-local",
  },
  { id: "termdraw.style.next", title: "Next style", defaultKeys: ["]"], locus: "editor-local" },
  {
    id: "termdraw.elbow.toggle-orientation",
    title: "Toggle elbow route",
    defaultKeys: ["r"],
    locus: "editor-local",
  },
  {
    id: "termdraw.edit.space",
    title: "Insert or stamp",
    defaultKeys: ["space"],
    locus: "document",
  },
  {
    id: "termdraw.edit.backspace",
    title: "Backspace or erase",
    defaultKeys: ["backspace"],
    locus: "document",
  },
  { id: "termdraw.edit.delete", title: "Delete", defaultKeys: ["delete"], locus: "document" },
] as const satisfies readonly TermDrawCommandDefinition[];

export type TermDrawCommandId = (typeof TERM_DRAW_COMMAND_CATALOG)[number]["id"];
export type TermDrawCommandCatalogEntry = (typeof TERM_DRAW_COMMAND_CATALOG)[number];
export type TermDrawCommandSource = "keyboard" | "mouse" | "programmatic";
export type TermDrawCommandEvent = { id: TermDrawCommandId; source: TermDrawCommandSource };

export type TermDrawCommandContext = {
  dispatchDrawIntent: DrawIntentDispatch;
  cancelOnCtrlCEnabled: boolean;
  onSave: (() => void) | null;
  onCopy: (() => void) | null;
  onSaveDiagram: (() => void) | null;
  onCancel: (() => void) | null;
  requestRender: () => void;
  onCommand?: (event: TermDrawCommandEvent) => void;
};

type CommandHandler = (context: TermDrawCommandContext) => boolean;

function dispatchAndRender(context: TermDrawCommandContext, intent: DrawIntent): boolean {
  if (!context.dispatchDrawIntent(intent)) return false;
  context.requestRender();
  return true;
}

const COMMAND_HANDLERS: Record<TermDrawCommandId, CommandHandler> = {
  "termdraw.app.cancel": (context) => {
    context.onCancel?.();
    return true;
  },
  "termdraw.text.finish": (context) => dispatchAndRender(context, { type: "finish-text-entry" }),
  "termdraw.art.accept": (context) => {
    (context.onCopy ?? context.onSave)?.();
    return true;
  },
  "termdraw.art.export": (context) => {
    context.onSave?.();
    return true;
  },
  "termdraw.document.save": (context) => {
    if (!context.onSaveDiagram) return false;
    context.onSaveDiagram();
    return true;
  },
  "termdraw.selection.clear": (context) => dispatchAndRender(context, { type: "clear-selection" }),
  "termdraw.tool.next": (context) => dispatchAndRender(context, { type: "cycle-mode" }),
  "termdraw.tool.select": (context) =>
    dispatchAndRender(context, { type: "set-mode", mode: "select" }),
  "termdraw.tool.box": (context) => dispatchAndRender(context, { type: "set-mode", mode: "box" }),
  "termdraw.tool.line": (context) => dispatchAndRender(context, { type: "set-mode", mode: "line" }),
  "termdraw.tool.elbow": (context) =>
    dispatchAndRender(context, { type: "set-mode", mode: "elbow" }),
  "termdraw.tool.paint": (context) =>
    dispatchAndRender(context, { type: "set-mode", mode: "paint" }),
  "termdraw.tool.text": (context) => dispatchAndRender(context, { type: "set-mode", mode: "text" }),
  "termdraw.history.undo": (context) => dispatchAndRender(context, { type: "undo" }),
  "termdraw.history.redo": (context) => dispatchAndRender(context, { type: "redo" }),
  "termdraw.canvas.clear": (context) => dispatchAndRender(context, { type: "clear-canvas" }),
  "termdraw.cursor.up": (context) => dispatchAndRender(context, { type: "move", dx: 0, dy: -1 }),
  "termdraw.cursor.down": (context) => dispatchAndRender(context, { type: "move", dx: 0, dy: 1 }),
  "termdraw.cursor.left": (context) => dispatchAndRender(context, { type: "move", dx: -1, dy: 0 }),
  "termdraw.cursor.right": (context) => dispatchAndRender(context, { type: "move", dx: 1, dy: 0 }),
  "termdraw.style.previous": (context) =>
    dispatchAndRender(context, { type: "cycle-style", direction: -1 }),
  "termdraw.style.next": (context) =>
    dispatchAndRender(context, { type: "cycle-style", direction: 1 }),
  "termdraw.elbow.toggle-orientation": (context) =>
    dispatchAndRender(context, { type: "toggle-elbow-orientation" }),
  "termdraw.edit.space": (context) => dispatchAndRender(context, { type: "insert-or-stamp" }),
  "termdraw.edit.backspace": (context) =>
    dispatchAndRender(context, { type: "backspace-or-erase" }),
  "termdraw.edit.delete": (context) => dispatchAndRender(context, { type: "delete-or-erase" }),
};

const CATALOG_BY_ID = new Map(TERM_DRAW_COMMAND_CATALOG.map((entry) => [entry.id, entry] as const));

function keyMatchesChord(key: KeyEvent, chord: string): boolean {
  const parts = chord.toLowerCase().split("+");
  const name = parts.at(-1)!;
  const ctrl = parts.includes("ctrl");
  const shift = parts.includes("shift");
  const meta = parts.includes("meta");
  const option = parts.includes("option") || parts.includes("alt");
  const keyName = key.name.toLowerCase();
  const nameMatches =
    name === "escape"
      ? keyName === "escape" || keyName === "esc"
      : name === "enter"
        ? keyName === "enter" || keyName === "return"
        : name === "[" || name === "]"
          ? key.raw === name
          : keyName === name;

  if (!nameMatches) return false;
  if ((ctrl && !key.ctrl) || (meta && !key.meta) || (option && !key.option)) return false;
  // Preserve the existing behavior where shifted plain letters select tools and brackets cycle.
  if (shift && !key.shift) return false;
  if (!ctrl && !meta && !option && /^[a-z]$/.test(name)) {
    return !key.ctrl && !key.meta && !key.option;
  }
  return true;
}

/** Executes a command by stable ID and reports it only when its handler accepts the action. */
export function executeTermDrawCommand(
  id: TermDrawCommandId,
  context: TermDrawCommandContext,
  source: TermDrawCommandSource = "programmatic",
): boolean {
  const handler: CommandHandler | undefined = COMMAND_HANDLERS[id];
  if (!handler) return false;
  const handled = handler(context);
  if (handled) context.onCommand?.({ id, source });
  return handled;
}

/** Dispatches the first catalog command matching a keyboard event. */
export function dispatchTermDrawCommand(
  key: KeyEvent,
  context: TermDrawCommandContext,
): TermDrawCommandId | null {
  for (const command of TERM_DRAW_COMMAND_CATALOG) {
    if (
      command.id === "termdraw.text.finish" &&
      (key.ctrl || key.meta || key.option || key.super || key.hyper)
    ) {
      continue;
    }
    const keys =
      command.id === "termdraw.app.cancel" && context.cancelOnCtrlCEnabled
        ? [...command.defaultKeys, "ctrl+c"]
        : command.defaultKeys;
    if (!keys.some((chord) => keyMatchesChord(key, chord))) continue;
    if (!executeTermDrawCommand(command.id, context, "keyboard")) continue;
    key.preventDefault();
    return command.id;
  }
  return null;
}

/** Returns a display label for a command's shipped bindings. */
export function getTermDrawCommandKeyLabel(
  id: TermDrawCommandId,
  options: TermDrawCommandKeyOptions = {},
): string {
  const command = CATALOG_BY_ID.get(id)!;
  const keys =
    id === "termdraw.app.cancel" && options.cancelOnCtrlC
      ? [...command.defaultKeys, "ctrl+c"]
      : command.defaultKeys;
  return keys
    .map((chord) =>
      chord
        .split("+")
        .map((part) => {
          if (part === "ctrl") return "Ctrl";
          if (part === "shift") return "Shift";
          if (part === "escape") return "Esc";
          if (part.length === 1) return part.toUpperCase();
          return part[0]!.toUpperCase() + part.slice(1);
        })
        .join("+"),
    )
    .join(" / ");
}

/** Builds the default footer from command IDs rather than duplicated key literals. */
export function buildTermDrawFooterText(
  canSaveDiagram: boolean,
  canCopy: boolean,
  cancelOnCtrlC = false,
): string {
  const key = getTermDrawCommandKeyLabel;
  const saveKeys = canCopy
    ? `${key("termdraw.art.accept")} Finish Text/Copy • ${key("termdraw.art.export")} Export Art`
    : `${key("termdraw.art.accept")} Finish Text/Export Art • ${key("termdraw.art.export")} Export Art`;
  return `${key("termdraw.tool.paint")} Brush • ${key("termdraw.tool.select")} Select • ${key("termdraw.tool.box")} Box • ${key("termdraw.tool.line")} Line • ${key("termdraw.tool.elbow")} Elbow • ${key("termdraw.tool.text")} Text • ${key("termdraw.selection.clear")} Deselect • ${saveKeys}${
    canSaveDiagram ? ` • ${key("termdraw.document.save")} Save Diagram` : ""
  } • ${key("termdraw.app.cancel", { cancelOnCtrlC })} Quit`;
}
