import type { KeyEvent } from "@opentui/core";
import type { DrawState } from "../draw-state.js";

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
  state: DrawState;
  cancelOnCtrlCEnabled: boolean;
  onSave: (() => void) | null;
  onCopy: (() => void) | null;
  onSaveDiagram: (() => void) | null;
  onCancel: (() => void) | null;
  requestRender: () => void;
  onCommand?: (event: TermDrawCommandEvent) => void;
};

type CommandHandler = (context: TermDrawCommandContext) => boolean;

function renderAfter(context: TermDrawCommandContext, action: () => void): boolean {
  action();
  context.requestRender();
  return true;
}

function move(context: TermDrawCommandContext, dx: number, dy: number): boolean {
  return renderAfter(context, () => {
    if (context.state.hasSelectedObject && !context.state.isEditingText) {
      context.state.moveSelectedObjectBy(dx, dy);
    } else {
      context.state.moveCursor(dx, dy);
    }
  });
}

function cycleStyle(context: TermDrawCommandContext, delta: -1 | 1): boolean {
  const { state } = context;
  if (state.currentMode === "box") return renderAfter(context, () => state.cycleBoxStyle(delta));
  if (state.currentMode === "line" || state.currentMode === "elbow") {
    return renderAfter(context, () => state.cycleLineStyle(delta));
  }
  if (state.currentMode === "paint") return renderAfter(context, () => state.cycleBrush(delta));
  if (state.currentMode === "text") {
    return renderAfter(context, () => state.cycleTextBorderMode(delta));
  }
  return false;
}

const COMMAND_HANDLERS: Record<TermDrawCommandId, CommandHandler> = {
  "termdraw.app.cancel": (context) => {
    context.onCancel?.();
    return true;
  },
  "termdraw.text.finish": (context) => {
    if (context.state.currentMode !== "text" || !context.state.isTextEntryArmed) return false;
    return renderAfter(context, () => context.state.clearSelection());
  },
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
  "termdraw.selection.clear": (context) =>
    renderAfter(context, () => context.state.clearSelection()),
  "termdraw.tool.next": (context) => renderAfter(context, () => context.state.cycleMode()),
  "termdraw.tool.select": (context) => renderAfter(context, () => context.state.setMode("select")),
  "termdraw.tool.box": (context) => renderAfter(context, () => context.state.setMode("box")),
  "termdraw.tool.line": (context) => renderAfter(context, () => context.state.setMode("line")),
  "termdraw.tool.elbow": (context) => renderAfter(context, () => context.state.setMode("elbow")),
  "termdraw.tool.paint": (context) => renderAfter(context, () => context.state.setMode("paint")),
  "termdraw.tool.text": (context) => renderAfter(context, () => context.state.setMode("text")),
  "termdraw.history.undo": (context) => renderAfter(context, () => context.state.undo()),
  "termdraw.history.redo": (context) => renderAfter(context, () => context.state.redo()),
  "termdraw.canvas.clear": (context) => renderAfter(context, () => context.state.clearCanvas()),
  "termdraw.cursor.up": (context) => move(context, 0, -1),
  "termdraw.cursor.down": (context) => move(context, 0, 1),
  "termdraw.cursor.left": (context) => move(context, -1, 0),
  "termdraw.cursor.right": (context) => move(context, 1, 0),
  "termdraw.style.previous": (context) => cycleStyle(context, -1),
  "termdraw.style.next": (context) => cycleStyle(context, 1),
  "termdraw.elbow.toggle-orientation": (context) => {
    if (context.state.currentMode !== "elbow") return false;
    return renderAfter(context, () => context.state.toggleElbowOrientation());
  },
  "termdraw.edit.space": (context) => {
    if (context.state.currentMode === "text") {
      return renderAfter(context, () => context.state.insertCharacter(" "));
    }
    if (
      context.state.currentMode === "line" ||
      context.state.currentMode === "elbow" ||
      context.state.currentMode === "paint"
    ) {
      return renderAfter(context, () => context.state.stampBrushAtCursor());
    }
    return false;
  },
  "termdraw.edit.backspace": (context) => {
    if (!context.state.isEditingText && context.state.hasSelectedObject) {
      return renderAfter(context, () => context.state.deleteSelectedObject());
    }
    if (context.state.currentMode === "text") {
      return renderAfter(context, () => context.state.backspace());
    }
    if (
      context.state.currentMode === "line" ||
      context.state.currentMode === "elbow" ||
      context.state.currentMode === "paint"
    ) {
      return renderAfter(context, () => context.state.eraseAtCursor());
    }
    return false;
  },
  "termdraw.edit.delete": (context) => {
    if (!context.state.isEditingText && context.state.hasSelectedObject) {
      return renderAfter(context, () => context.state.deleteSelectedObject());
    }
    if (context.state.currentMode === "text") {
      return renderAfter(context, () => context.state.deleteAtCursor());
    }
    if (
      context.state.currentMode === "line" ||
      context.state.currentMode === "elbow" ||
      context.state.currentMode === "paint"
    ) {
      return renderAfter(context, () => context.state.eraseAtCursor());
    }
    return false;
  },
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
