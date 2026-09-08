import { expect, test } from "bun:test";
import { MouseButton } from "@opentui/core";
import { DrawState } from "../draw-state";
import { getLayout } from "./layout";
import { handleMouseEvent, handleKeyPress } from "./input";

function createMockKey(
  name: string,
  options: Partial<{
    raw: string;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
    option: boolean;
  }> = {},
) {
  let prevented = false;

  return {
    key: {
      name,
      raw: options.raw ?? name,
      ctrl: options.ctrl ?? false,
      shift: options.shift ?? false,
      meta: options.meta ?? false,
      option: options.option ?? false,
      preventDefault: () => {
        prevented = true;
      },
    },
    wasPrevented: () => prevented,
  };
}

function createPointerEvent(type: "down" | "move") {
  let prevented = false;
  let stopped = false;
  return {
    event: {
      type,
      button: MouseButton.LEFT,
      modifiers: { shift: false },
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    },
    wasPrevented: () => prevented,
    wasStopped: () => stopped,
  };
}

test("handleKeyPress routes arrow keys to cursor movement without a selection", () => {
  const moves: Array<[number, number]> = [];
  let renders = 0;
  const { key, wasPrevented } = createMockKey("up", { raw: "\u001b[A" });

  const handled = handleKeyPress({
    key: key as never,
    state: {
      currentMode: "line",
      isTextEntryArmed: false,
      isEditingText: false,
      hasSelectedObject: false,
      moveCursor: (dx: number, dy: number) => {
        moves.push([dx, dy]);
      },
    } as DrawState,
    cancelOnCtrlCEnabled: true,
    onSave: null,
    onSaveDiagram: null,
    onCancel: null,
    requestRender: () => {
      renders += 1;
    },
    dismissStartupLogo: () => {},
  });

  expect(handled).toBe(true);
  expect(wasPrevented()).toBe(true);
  expect(moves).toEqual([[0, -1]]);
  expect(renders).toBe(1);
});

test("handleKeyPress routes arrow keys to selected object movement", () => {
  const moves: Array<[number, number]> = [];
  const { key } = createMockKey("right", { raw: "\u001b[C" });

  const handled = handleKeyPress({
    key: key as never,
    state: {
      currentMode: "line",
      isTextEntryArmed: false,
      isEditingText: false,
      hasSelectedObject: true,
      moveSelectedObjectBy: (dx: number, dy: number) => {
        moves.push([dx, dy]);
      },
    } as DrawState,
    cancelOnCtrlCEnabled: true,
    onSave: null,
    onSaveDiagram: null,
    onCancel: null,
    requestRender: () => {},
    dismissStartupLogo: () => {},
  });

  expect(handled).toBe(true);
  expect(moves).toEqual([[1, 0]]);
});

test("handleKeyPress handles undo, redo, and clear canvas shortcuts", () => {
  let undos = 0;
  let redos = 0;
  let clears = 0;
  const state = {
    currentMode: "line",
    isTextEntryArmed: false,
    isEditingText: false,
    hasSelectedObject: false,
    undo: () => {
      undos += 1;
    },
    redo: () => {
      redos += 1;
    },
    clearCanvas: () => {
      clears += 1;
    },
  } as DrawState;

  expect(
    handleKeyPress({
      key: createMockKey("z", { ctrl: true }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);
  expect(
    handleKeyPress({
      key: createMockKey("y", { ctrl: true }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);
  expect(
    handleKeyPress({
      key: createMockKey("x", { ctrl: true }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);

  expect(undos).toBe(1);
  expect(redos).toBe(1);
  expect(clears).toBe(1);
});

test("handleKeyPress supports paint-mode stamping and erasing", () => {
  let stamped = 0;
  let erased = 0;
  const state = {
    currentMode: "paint",
    isTextEntryArmed: false,
    isEditingText: false,
    hasSelectedObject: false,
    stampBrushAtCursor: () => {
      stamped += 1;
    },
    eraseAtCursor: () => {
      erased += 1;
    },
  } as DrawState;

  expect(
    handleKeyPress({
      key: createMockKey("space", { raw: " " }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);
  expect(
    handleKeyPress({
      key: createMockKey("delete", { raw: "\u007f" }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);

  expect(stamped).toBe(1);
  expect(erased).toBe(1);
});

test("handleKeyPress supports text-mode border cycling and editing keys", () => {
  const borderCycles: number[] = [];
  let backspaces = 0;
  let deletes = 0;
  let inserted: string | null = null;
  const state = {
    currentMode: "text",
    isTextEntryArmed: true,
    isEditingText: true,
    hasSelectedObject: false,
    cycleTextBorderMode: (delta: number) => {
      borderCycles.push(delta);
    },
    backspace: () => {
      backspaces += 1;
    },
    deleteAtCursor: () => {
      deletes += 1;
    },
    insertCharacter: (value: string) => {
      inserted = value;
    },
  } as DrawState;

  expect(
    handleKeyPress({
      key: createMockKey("[", { raw: "[" }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);
  expect(
    handleKeyPress({
      key: createMockKey("backspace", { raw: "\b" }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);
  expect(
    handleKeyPress({
      key: createMockKey("delete", { raw: "\u007f" }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);
  expect(
    handleKeyPress({
      key: createMockKey("space", { raw: " " }).key as never,
      state,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);

  expect(borderCycles).toEqual([-1]);
  expect(backspaces).toBe(1);
  expect(deletes).toBe(1);
  expect(inserted === " ").toBe(true);
});

test("handleMouseEvent selects a tool from the full chrome palette", () => {
  const layout = getLayout(80, 24);
  const state = new DrawState(80, 24);
  let renders = 0;
  let dismissed = 0;
  const { event, wasPrevented, wasStopped } = createPointerEvent("down");

  handleMouseEvent({
    event: event as never,
    x: layout.paletteLeft + 2,
    y: layout.bodyTop + 4,
    state,
    chromeMode: "full",
    layout,
    executeCommand: (id) => {
      expect(id).toBe("termdraw.tool.select");
      state.setMode("select");
      renders += 1;
      return true;
    },
    requestRender: () => {},
    dismissStartupLogo: () => {
      dismissed += 1;
    },
  });

  expect(state.currentMode).toBe("select");
  expect(renders).toBe(1);
  expect(dismissed).toBe(1);
  expect(wasPrevented()).toBe(true);
  expect(wasStopped()).toBe(true);
});

test("handleMouseEvent swallows non-canvas chrome clicks", () => {
  const layout = getLayout(80, 24);
  const state = new DrawState(80, 24);
  const { event, wasPrevented, wasStopped } = createPointerEvent("down");

  handleMouseEvent({
    event: event as never,
    x: 0,
    y: 0,
    state,
    chromeMode: "full",
    layout,
    executeCommand: () => false,
    requestRender: () => {},
    dismissStartupLogo: () => {},
  });

  expect(wasPrevented()).toBe(true);
  expect(wasStopped()).toBe(true);
});
