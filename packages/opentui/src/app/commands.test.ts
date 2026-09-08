import { expect, test } from "bun:test";
import { MouseButton, type KeyEvent } from "@opentui/core";
import { DrawState } from "../draw-state";
import {
  TERM_DRAW_COMMAND_CATALOG,
  dispatchTermDrawCommand,
  executeTermDrawCommand,
  getTermDrawCommandKeyLabel,
  type TermDrawCommandContext,
  type TermDrawCommandEvent,
} from "./commands";

function context(overrides: Partial<TermDrawCommandContext> = {}): TermDrawCommandContext {
  return {
    state: new DrawState(40, 20),
    cancelOnCtrlCEnabled: false,
    onSave: null,
    onCopy: null,
    onSaveDiagram: null,
    onCancel: null,
    requestRender: () => {},
    ...overrides,
  };
}

test("command catalog has unique namespaced IDs", () => {
  const ids = TERM_DRAW_COMMAND_CATALOG.map((command) => command.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => id.startsWith("termdraw."))).toBe(true);
});

test("commands execute by ID and report their source", () => {
  const events: TermDrawCommandEvent[] = [];
  const commandContext = context({ onCommand: (event) => events.push(event) });

  expect(executeTermDrawCommand("termdraw.tool.box", commandContext)).toBe(true);

  expect(commandContext.state.currentMode).toBe("box");
  expect(events).toEqual([{ id: "termdraw.tool.box", source: "programmatic" }]);
});

test("keyboard dispatch resolves to the same named command", () => {
  let prevented = false;
  const events: TermDrawCommandEvent[] = [];
  const key = {
    name: "e",
    raw: "e",
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    preventDefault: () => {
      prevented = true;
    },
  } as KeyEvent;
  const commandContext = context({ onCommand: (event) => events.push(event) });

  expect(dispatchTermDrawCommand(key, commandContext)).toBe("termdraw.tool.elbow");
  expect(commandContext.state.currentMode).toBe("elbow");
  expect(prevented).toBe(true);
  expect(events).toEqual([{ id: "termdraw.tool.elbow", source: "keyboard" }]);
});

test("shifted modified shortcuts preserve existing command behavior", () => {
  let saved = 0;
  const saveKey = {
    name: "s",
    raw: "S",
    ctrl: true,
    shift: true,
    meta: false,
    option: false,
    preventDefault: () => {},
  } as KeyEvent;
  const redoKey = { ...saveKey, name: "z", raw: "Z" } as KeyEvent;
  const commandContext = context({ onSave: () => saved++ });

  expect(dispatchTermDrawCommand(saveKey, commandContext)).toBe("termdraw.art.export");
  expect(dispatchTermDrawCommand(redoKey, commandContext)).toBe("termdraw.history.redo");
  expect(saved).toBe(1);
});

test("text entry resolves Enter to a contextual named command", () => {
  const events: TermDrawCommandEvent[] = [];
  const state = new DrawState(40, 20);
  state.setMode("text");
  state.handlePointerEvent({
    type: "down",
    button: MouseButton.LEFT,
    x: state.canvasLeftCol,
    y: state.canvasTopRow,
  });
  state.insertCharacter("a");
  const key = {
    name: "enter",
    raw: "\r",
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    preventDefault: () => {},
  } as KeyEvent;

  expect(
    dispatchTermDrawCommand(key, context({ state, onCommand: (event) => events.push(event) })),
  ).toBe("termdraw.text.finish");
  expect(state.isTextEntryArmed).toBe(false);
  expect(events).toEqual([{ id: "termdraw.text.finish", source: "keyboard" }]);
});

test("modified Enter bypasses text completion for the host action", () => {
  let saved = 0;
  const state = new DrawState(40, 20);
  state.setMode("text");
  state.handlePointerEvent({
    type: "down",
    button: MouseButton.LEFT,
    x: state.canvasLeftCol,
    y: state.canvasTopRow,
  });
  const key = {
    name: "enter",
    raw: "\r",
    ctrl: true,
    shift: false,
    meta: false,
    option: false,
    preventDefault: () => {},
  } as KeyEvent;

  expect(dispatchTermDrawCommand(key, context({ state, onSave: () => saved++ }))).toBe(
    "termdraw.art.accept",
  );
  expect(state.isTextEntryArmed).toBe(true);
  expect(saved).toBe(1);
});

test("editing commands retain modifier-tolerant keyboard behavior", () => {
  const state = new DrawState(40, 20);
  const key = {
    name: "up",
    raw: "\u001b[A",
    ctrl: true,
    shift: false,
    meta: true,
    option: false,
    preventDefault: () => {},
  } as KeyEvent;

  expect(dispatchTermDrawCommand(key, context({ state }))).toBe("termdraw.cursor.up");
});

test("disabled host commands are not consumed or observed", () => {
  let prevented = false;
  const events: TermDrawCommandEvent[] = [];
  const key = {
    name: "d",
    raw: "\u0004",
    ctrl: true,
    shift: false,
    meta: false,
    option: false,
    preventDefault: () => {
      prevented = true;
    },
  } as KeyEvent;

  expect(
    dispatchTermDrawCommand(key, context({ onCommand: (event) => events.push(event) })),
  ).toBeNull();
  expect(prevented).toBe(false);
  expect(events).toEqual([]);
});

test("display labels come from catalog bindings", () => {
  expect(getTermDrawCommandKeyLabel("termdraw.history.redo")).toBe("Ctrl+Y / Ctrl+Shift+Z");
  expect(getTermDrawCommandKeyLabel("termdraw.selection.clear")).toBe("Esc");
  expect(getTermDrawCommandKeyLabel("termdraw.app.cancel", { cancelOnCtrlC: true })).toBe(
    "Ctrl+Q / Ctrl+C",
  );
});
