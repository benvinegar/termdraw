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

  test("text inside a box moves with the box", () => {
    const state = new DrawState(40, 16);
    state.setMode("box");

    const boxStart = canvasPoint(state, 0, 0);
    const boxEnd = canvasPoint(state, 8, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });

    state.setMode("text");
    const textStart = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...textStart });
    state.insertCharacter("H");

    state.setMode("box");
    const dragStart = canvasPoint(state, 0, 1);
    const dragEnd = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(2, 2)).toBe("┃");
    expect(state.getCompositeCell(4, 3)).toBe("H");
  });

  test("line inside a box moves with the box", () => {
    const state = new DrawState(40, 16);
    state.setMode("box");

    const boxStart = canvasPoint(state, 0, 0);
    const boxEnd = canvasPoint(state, 8, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });

    state.setMode("line");
    const lineStart = canvasPoint(state, 2, 2);
    const lineEnd = canvasPoint(state, 4, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...lineStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...lineEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...lineEnd });

    const dragStart = canvasPoint(state, 0, 1);
    const dragEnd = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(3, 2)).toBe(" ");
    expect(state.getCompositeCell(4, 3)).toBe("#");
    expect(state.getCompositeCell(6, 3)).toBe("#");
  });

  test("a box inside a box moves with its parent", () => {
    const state = new DrawState(40, 18);
    state.setMode("box");

    const outerStart = canvasPoint(state, 0, 0);
    const outerEnd = canvasPoint(state, 10, 6);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...outerStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...outerEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...outerEnd });

    const innerStart = canvasPoint(state, 2, 2);
    const innerEnd = canvasPoint(state, 5, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...innerStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...innerEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...innerEnd });

    const dragStart = canvasPoint(state, 0, 1);
    const dragEnd = canvasPoint(state, 3, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(2, 2)).toBe(" ");
    expect(state.getCompositeCell(5, 3)).toBe("┌");
    expect(state.getCompositeCell(8, 5)).toBe("┘");
  });

  test("a child dragged outside a box no longer moves with it", () => {
    const state = new DrawState(40, 16);
    state.setMode("box");

    const boxStart = canvasPoint(state, 0, 0);
    const boxEnd = canvasPoint(state, 8, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });

    state.setMode("text");
    const textStart = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...textStart });
    state.insertCharacter("H");

    const textDragEnd = canvasPoint(state, 11, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...textStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...textDragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...textDragEnd });

    state.setMode("box");
    const dragStart = canvasPoint(state, 0, 1);
    const dragEnd = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(4, 3)).toBe(" ");
    expect(state.getCompositeCell(11, 2)).toBe("H");
  });

  test("resizing a box also resizes child lines to fit", () => {
    const state = new DrawState(40, 16);
    state.setMode("box");

    const boxStart = canvasPoint(state, 0, 0);
    const boxEnd = canvasPoint(state, 8, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });

    state.setMode("line");
    const lineStart = canvasPoint(state, 2, 2);
    const lineEnd = canvasPoint(state, 6, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...lineStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...lineEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...lineEnd });

    state.setMode("box");
    const resizeStart = canvasPoint(state, 8, 4);
    const resizeEnd = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...resizeStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...resizeEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...resizeEnd });

    expect(state.getCompositeCell(1, 2)).toBe("#");
    expect(state.getCompositeCell(2, 2)).toBe("#");
    expect(state.getCompositeCell(3, 2)).toBe("#");
    expect(state.getCompositeCell(4, 2)).toBe("┃");
  });

  test("resizing a box keeps child text inside it", () => {
    const state = new DrawState(40, 16);
    state.setMode("box");

    const boxStart = canvasPoint(state, 0, 0);
    const boxEnd = canvasPoint(state, 8, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });

    state.setMode("text");
    const textStart = canvasPoint(state, 6, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...textStart });
    state.insertCharacter("H");
    state.insertCharacter("i");

    state.setMode("box");
    const resizeStart = canvasPoint(state, 8, 4);
    const resizeEnd = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...resizeStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...resizeEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...resizeEnd });

    expect(state.getCompositeCell(6, 2)).toBe(" ");
    expect(state.getCompositeCell(2, 2)).toBe("H");
    expect(state.getCompositeCell(3, 2)).toBe("i");
  });

  test("selected boxes expose resize handles and can be resized from a corner", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

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

  test("line endpoints expose handles and can be dragged without a select mode", () => {
    const state = new DrawState(30, 12);
    state.setMode("line");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 1);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

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

  test("box objects can be clicked and dragged without a select mode", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 4, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    const dragStart = canvasPoint(state, 0, 1);
    const dragEnd = canvasPoint(state, 3, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.currentMode).toBe("box");
    expect(state.getCompositeCell(0, 0)).toBe(" ");
    expect(state.getCompositeCell(3, 2)).toBe("┏");
    expect(state.getCompositeCell(7, 4)).toBe("┛");
  });

  test("text selection shows a virtual bounding box and can drag from it", () => {
    const state = new DrawState(30, 14);
    state.setMode("text");

    const start = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.insertCharacter("H");
    state.insertCharacter("i");

    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...start });

    const selected = state.getSelectedCellKeys();
    expect(selected.has("1,1")).toBe(true);
    expect(selected.has("4,3")).toBe(true);
    expect(selected.has("2,2")).toBe(true);

    const dragFromVirtualBox = canvasPoint(state, 1, 1);
    const dragEnd = canvasPoint(state, 3, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragFromVirtualBox });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(2, 2)).toBe(" ");
    expect(state.getCompositeCell(4, 3)).toBe("H");
    expect(state.getCompositeCell(5, 3)).toBe("i");
  });

  test("text objects keep spaces inside the same virtual textbox", () => {
    const state = new DrawState(30, 14);
    state.setMode("text");

    const start = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.insertCharacter("H");
    state.insertCharacter(" ");
    state.insertCharacter("i");

    const selected = state.getSelectedCellKeys();
    expect(selected.has("2,2")).toBe(true);
    expect(selected.has("3,2")).toBe(true);
    expect(selected.has("4,2")).toBe(true);
    expect(state.exportArt()).toBe("  H i");
  });

  test("text mode click still edits text while drag moves it", () => {
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

  test("clearSelection deselects the active object", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(state.getSelectedCellKeys().size).toBeGreaterThan(0);
    expect(state.clearSelection()).toBe(true);
    expect(state.getSelectedCellKeys().size).toBe(0);
    expect(state.getSelectionHandleCharacters().size).toBe(0);
  });

  test("undo and redo restore moved objects", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 4, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

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
