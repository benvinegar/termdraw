import { describe, expect, test } from "bun:test";
import { MouseButton } from "@opentui/core";
import { DrawState } from "./draw-state";

function canvasPoint(state: DrawState, x: number, y: number) {
  return {
    x: state.canvasLeftCol + x,
    y: state.canvasTopRow + y,
  };
}

describe("DrawState", () => {
  test("draws a straight line object with pointer events", () => {
    const state = new DrawState(20, 10);
    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 3, 0);

    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(state.exportArt()).toBe("####");
  });

  test("nested boxes still alternate heavy and light borders", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const outerStart = canvasPoint(state, 0, 0);
    const outerEnd = canvasPoint(state, 8, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...outerStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...outerEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...outerEnd });

    const innerStart = canvasPoint(state, 2, 1);
    const innerEnd = canvasPoint(state, 6, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...innerStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...innerEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...innerEnd });

    expect(state.getCompositeCell(0, 0)).toBe("┏");
    expect(state.getCompositeCell(2, 1)).toBe("┌");
  });

  test("selected boxes expose resize handles and can be resized from a corner", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    state.setMode("select");
    const handles = state.getSelectionHandleCharacters();
    expect(handles.get("1,1")).toBe("●");
    expect(handles.get("4,3")).toBe("●");

    const resizeStart = canvasPoint(state, 1, 1);
    const resizeEnd = canvasPoint(state, 0, 0);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...resizeStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...resizeEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...resizeEnd });

    expect(state.getCompositeCell(0, 0)).toBe("┏");
    expect(state.getCompositeCell(4, 3)).toBe("┛");

    state.undo();
    expect(state.getCompositeCell(1, 1)).toBe("┏");
    expect(state.getCompositeCell(0, 0)).toBe(" ");
  });

  test("line endpoints expose handles and can be dragged in select mode", () => {
    const state = new DrawState(30, 12);
    state.setMode("line");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 1);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    state.setMode("select");
    const handles = state.getSelectionHandleCharacters();
    expect(handles.get("1,1")).toBe("●");
    expect(handles.get("4,1")).toBe("●");

    const dragEndStart = canvasPoint(state, 4, 1);
    const dragEndFinish = canvasPoint(state, 6, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragEndStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEndFinish });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEndFinish });

    expect(state.getCompositeCell(1, 1)).toBe("#");
    expect(state.getCompositeCell(6, 2)).toBe("#");

    state.undo();
    expect(state.getCompositeCell(4, 1)).toBe("#");
  });

  test("box objects can be selected and dragged", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 4, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    state.setMode("select");
    const dragStart = canvasPoint(state, 0, 1);
    const dragEnd = canvasPoint(state, 3, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(0, 0)).toBe(" ");
    expect(state.getCompositeCell(3, 2)).toBe("┏");
    expect(state.getCompositeCell(7, 4)).toBe("┛");
  });

  test("existing objects can be moved without switching away from draw mode", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 3, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    const moveStart = canvasPoint(state, 0, 1);
    const moveEnd = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...moveStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...moveEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...moveEnd });

    expect(state.currentMode).toBe("box");
    expect(state.getCompositeCell(0, 0)).toBe(" ");
    expect(state.getCompositeCell(2, 1)).toBe("┏");
    expect(state.getCompositeCell(5, 3)).toBe("┛");
  });

  test("text mode click still edits text and drag moves it", () => {
    const state = new DrawState(30, 12);
    state.setMode("text");

    const start = canvasPoint(state, 0, 0);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.insertCharacter("H");
    state.insertCharacter("i");

    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...start });
    state.insertCharacter("!");

    expect(state.getCompositeCell(0, 0)).toBe("H");
    expect(state.getCompositeCell(1, 0)).toBe("i");
    expect(state.getCompositeCell(2, 0)).toBe("!");

    const dragEnd = canvasPoint(state, 2, 1);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(0, 0)).toBe(" ");
    expect(state.getCompositeCell(2, 1)).toBe("H");
    expect(state.getCompositeCell(3, 1)).toBe("i");
    expect(state.getCompositeCell(4, 1)).toBe("!");
  });

  test("undo and redo restore moved objects", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 4, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    state.setMode("select");
    const dragStart = canvasPoint(state, 0, 1);
    const dragEnd = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(4, 2)).toBe("┏");

    state.undo();
    expect(state.getCompositeCell(0, 0)).toBe("┏");

    state.redo();
    expect(state.getCompositeCell(4, 2)).toBe("┏");
  });
});
