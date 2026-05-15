import { expect, test } from "bun:test";
import type { KeyEvent } from "@opentui/core";
import { handleDiagramSavePromptKey, handleKeyPress } from "./input";
import type { DiagramSavePromptState } from "./types";

function createKeyEvent(
  name: string,
  overrides: Partial<KeyEvent> = {},
): { event: KeyEvent; wasPrevented: () => boolean } {
  let prevented = false;

  return {
    event: {
      name,
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      sequence: "",
      number: false,
      raw: "",
      eventType: "press",
      source: "raw",
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {},
      ...overrides,
    } as KeyEvent,
    wasPrevented: () => prevented,
  };
}

function createMockState(overrides: Record<string, unknown> = {}) {
  return {
    currentMode: "line",
    isTextEntryArmed: false,
    isEditingText: false,
    hasSelectedObject: false,
    clearSelection: () => {},
    cycleMode: () => {},
    setMode: () => {},
    undo: () => {},
    redo: () => {},
    clearCanvas: () => {},
    deleteSelectedObject: () => {},
    moveSelectedObjectBy: () => {},
    moveCursor: () => {},
    cycleBoxStyle: () => {},
    cycleLineStyle: () => {},
    toggleElbowOrientation: () => {},
    stampBrushAtCursor: () => {},
    eraseAtCursor: () => {},
    cycleBrush: () => {},
    cycleTextBorderMode: () => {},
    backspace: () => {},
    deleteAtCursor: () => {},
    insertCharacter: () => {},
    ...overrides,
  };
}

test("handleDiagramSavePromptKey cancels the prompt for esc keys", () => {
  const prompt: DiagramSavePromptState = {
    value: "diagram",
    error: null,
    pending: false,
  };
  const { event, wasPrevented } = createKeyEvent("esc");

  const result = handleDiagramSavePromptKey(event, prompt);

  expect(result).toEqual({
    handled: true,
    prompt: null,
    statusMessage: "Save diagram cancelled.",
  });
  expect(wasPrevented()).toBe(true);
});

test("handleKeyPress clears selection on Escape", () => {
  let cleared = 0;
  let renders = 0;
  let dismissed = 0;
  const { event, wasPrevented } = createKeyEvent("escape", { raw: "\u001b" });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState({
      clearSelection: () => {
        cleared += 1;
      },
    }) as never,
    cancelOnCtrlCEnabled: true,
    onSave: null,
    onSaveDiagram: null,
    onCancel: null,
    requestRender: () => {
      renders += 1;
    },
    dismissStartupLogo: () => {
      dismissed += 1;
    },
  });

  expect(handled).toBe(true);
  expect(wasPrevented()).toBe(true);
  expect(cleared).toBe(1);
  expect(renders).toBe(1);
  expect(dismissed).toBe(1);
});

test("handleKeyPress invokes cancel on Ctrl+Q", () => {
  let cancelled = 0;
  const { event, wasPrevented } = createKeyEvent("q", { ctrl: true });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState() as never,
    cancelOnCtrlCEnabled: true,
    onSave: null,
    onSaveDiagram: null,
    onCancel: () => {
      cancelled += 1;
    },
    requestRender: () => {},
    dismissStartupLogo: () => {},
  });

  expect(handled).toBe(true);
  expect(wasPrevented()).toBe(true);
  expect(cancelled).toBe(1);
});

test("handleKeyPress invokes save on Ctrl+S", () => {
  let saved = 0;
  const { event, wasPrevented } = createKeyEvent("s", { ctrl: true });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState() as never,
    cancelOnCtrlCEnabled: true,
    onSave: () => {
      saved += 1;
    },
    onSaveDiagram: null,
    onCancel: null,
    requestRender: () => {},
    dismissStartupLogo: () => {},
  });

  expect(handled).toBe(true);
  expect(wasPrevented()).toBe(true);
  expect(saved).toBe(1);
});

test("handleKeyPress switches tools with hotkeys outside text entry", () => {
  let mode: string | null = null;
  let renders = 0;
  const { event, wasPrevented } = createKeyEvent("e", { raw: "e" });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState({
      currentMode: "line",
      setMode: (next: string) => {
        mode = next;
      },
    }) as never,
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
  expect(mode === "elbow").toBe(true);
  expect(renders).toBe(1);
});

test("handleKeyPress does not switch tools while text entry is armed", () => {
  let mode: string | null = null;
  let inserted: string | null = null;
  const { event } = createKeyEvent("b", { raw: "b" });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState({
      currentMode: "text",
      isTextEntryArmed: true,
      setMode: (next: string) => {
        mode = next;
      },
      insertCharacter: (value: string) => {
        inserted = value;
      },
    }) as never,
    cancelOnCtrlCEnabled: true,
    onSave: null,
    onSaveDiagram: null,
    onCancel: null,
    requestRender: () => {},
    dismissStartupLogo: () => {},
  });

  expect(handled).toBe(true);
  expect(mode).toBeNull();
  expect(inserted === "b").toBe(true);
});

test("handleKeyPress cycles line styles with bracket keys", () => {
  const cycles: number[] = [];
  const { event: leftKey } = createKeyEvent("[", { raw: "[" });
  const { event: rightKey } = createKeyEvent("]", { raw: "]" });
  const state = createMockState({
    currentMode: "elbow",
    cycleLineStyle: (delta: number) => {
      cycles.push(delta);
    },
  });

  expect(
    handleKeyPress({
      key: leftKey as never,
      state: state as never,
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
      key: rightKey as never,
      state: state as never,
      cancelOnCtrlCEnabled: true,
      onSave: null,
      onSaveDiagram: null,
      onCancel: null,
      requestRender: () => {},
      dismissStartupLogo: () => {},
    }),
  ).toBe(true);

  expect(cycles).toEqual([-1, 1]);
});

test("handleKeyPress toggles elbow route with R", () => {
  let toggles = 0;
  let renders = 0;
  const { event, wasPrevented } = createKeyEvent("r", { raw: "r" });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState({
      currentMode: "elbow",
      toggleElbowOrientation: () => {
        toggles += 1;
      },
    }) as never,
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
  expect(toggles).toBe(1);
  expect(renders).toBe(1);
});

test("handleKeyPress deletes selected objects outside text editing", () => {
  let deleted = 0;
  let renders = 0;
  const { event, wasPrevented } = createKeyEvent("delete", { raw: "\u007f" });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState({
      hasSelectedObject: true,
      deleteSelectedObject: () => {
        deleted += 1;
      },
    }) as never,
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
  expect(deleted).toBe(1);
  expect(renders).toBe(1);
});

test("handleKeyPress inserts printable text in text mode when entry is armed", () => {
  const inserted: string[] = [];
  let renders = 0;
  const { event, wasPrevented } = createKeyEvent("a", { raw: "a" });

  const handled = handleKeyPress({
    key: event as never,
    state: createMockState({
      currentMode: "text",
      isTextEntryArmed: true,
      insertCharacter: (value: string) => {
        inserted.push(value);
      },
    }) as never,
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
  expect(inserted).toEqual(["a"]);
  expect(renders).toBe(1);
});
