import { describe, expect, test } from "bun:test";
import { MouseButton } from "@opentui/core";
import { DrawState, TEXT_BORDER_MODES } from "./draw-state";

/** Converts canvas-local coordinates into the pointer coordinates expected by `DrawState`. */
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

    expect(state.exportArt()).toBe("────");
  });

  test("line tool auto-selects representative characters by angle", () => {
    const state = new DrawState(20, 16);

    const horizontalStart = canvasPoint(state, 0, 0);
    const horizontalEnd = canvasPoint(state, 3, 0);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...horizontalStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...horizontalEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...horizontalEnd });
    expect(state.exportArt()).toBe("────");

    const verticalStart = canvasPoint(state, 0, 2);
    const verticalEnd = canvasPoint(state, 0, 5);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...verticalStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...verticalEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...verticalEnd });
    expect(state.getCompositeCell(0, 2)).toBe("│");
    expect(state.getCompositeCell(0, 5)).toBe("│");

    const diagonalDownStart = canvasPoint(state, 6, 0);
    const diagonalDownEnd = canvasPoint(state, 9, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...diagonalDownStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...diagonalDownEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...diagonalDownEnd });
    expect(state.getCompositeCell(6, 0)).toBe("╲");
    expect(state.getCompositeCell(9, 3)).toBe("╲");

    const diagonalUpStart = canvasPoint(state, 9, 7);
    const diagonalUpEnd = canvasPoint(state, 6, 10);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...diagonalUpStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...diagonalUpEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...diagonalUpEnd });
    expect(state.getCompositeCell(9, 7)).toBe("╱");
    expect(state.getCompositeCell(6, 10)).toBe("╱");

    const shallowStart = canvasPoint(state, 11, 0);
    const shallowEnd = canvasPoint(state, 18, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...shallowStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...shallowEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...shallowEnd });
    const shallowChar = state.getCompositeCell(12, 0);
    expect((shallowChar.codePointAt(0) ?? 0) >= 0x2800).toBe(true);
  });

  test("holding Shift constrains new lines to horizontal or vertical", () => {
    const state = new DrawState(24, 16);

    const horizontalStart = canvasPoint(state, 1, 1);
    const horizontalEnd = canvasPoint(state, 6, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...horizontalStart });
    state.handlePointerEvent({
      type: "drag",
      button: MouseButton.LEFT,
      shift: true,
      ...horizontalEnd,
    });
    state.handlePointerEvent({
      type: "up",
      button: MouseButton.LEFT,
      shift: true,
      ...horizontalEnd,
    });

    expect(state.getCompositeCell(1, 1)).toBe("─");
    expect(state.getCompositeCell(6, 1)).toBe("─");
    expect(state.getCompositeCell(6, 3)).toBe(" ");

    const verticalStart = canvasPoint(state, 10, 1);
    const verticalEnd = canvasPoint(state, 12, 6);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...verticalStart });
    state.handlePointerEvent({
      type: "drag",
      button: MouseButton.LEFT,
      shift: true,
      ...verticalEnd,
    });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, shift: true, ...verticalEnd });

    expect(state.getCompositeCell(10, 1)).toBe("│");
    expect(state.getCompositeCell(10, 6)).toBe("│");
    expect(state.getCompositeCell(12, 6)).toBe(" ");
  });

  test("clicking empty space in line mode does not create a one-cell line", () => {
    const state = new DrawState(20, 10);
    state.setMode("box");

    const boxStart = canvasPoint(state, 1, 1);
    const boxEnd = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });
    expect(state.hasSelectedObject).toBe(true);

    state.setMode("line");
    const clickPoint = canvasPoint(state, 10, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...clickPoint });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...clickPoint });

    expect(state.hasSelectedObject).toBe(false);
    expect(state.getCompositeCell(10, 4)).toBe(" ");
  });

  test("paint mode creates a freehand painted object", () => {
    const state = new DrawState(20, 12);
    state.setMode("paint");

    const start = canvasPoint(state, 1, 1);
    const mid = canvasPoint(state, 4, 1);
    const end = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...mid });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(state.getCompositeCell(1, 1)).toBe("#");
    expect(state.getCompositeCell(2, 1)).toBe("#");
    expect(state.getCompositeCell(3, 1)).toBe("#");
    expect(state.getCompositeCell(4, 1)).toBe("#");
    expect(state.getCompositeCell(4, 2)).toBe("#");
    expect(state.getCompositeCell(4, 3)).toBe("#");
  });

  test("paint objects can be clicked and dragged", () => {
    const state = new DrawState(24, 12);
    state.setMode("paint");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 3, 1);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    const dragStart = canvasPoint(state, 2, 1);
    const dragEnd = canvasPoint(state, 5, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(state.getCompositeCell(1, 1)).toBe(" ");
    expect(state.getCompositeCell(4, 3)).toBe("#");
    expect(state.getCompositeCell(6, 3)).toBe("#");
  });

  test("nested auto boxes still alternate heavy and light borders", () => {
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

  test("line styles choose the closest single or double stencil by angle", () => {
    const state = new DrawState(40, 16);

    const smoothStart = canvasPoint(state, 0, 0);
    const smoothEnd = canvasPoint(state, 6, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...smoothStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...smoothEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...smoothEnd });
    const smoothChar = state.getCompositeCell(1, 0);
    expect((smoothChar.codePointAt(0) ?? 0) >= 0x2800).toBe(true);

    state.setLineStyle("light");
    const mostlyHorizontalSingleStart = canvasPoint(state, 8, 0);
    const mostlyHorizontalSingleEnd = canvasPoint(state, 18, 3);
    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...mostlyHorizontalSingleStart,
    });
    state.handlePointerEvent({
      type: "drag",
      button: MouseButton.LEFT,
      ...mostlyHorizontalSingleEnd,
    });
    state.handlePointerEvent({
      type: "up",
      button: MouseButton.LEFT,
      ...mostlyHorizontalSingleEnd,
    });
    expect(state.getCompositeCell(8, 0)).toBe("─");
    expect(state.getCompositeCell(12, 1)).toBe("─");

    const mostlyVerticalSingleStart = canvasPoint(state, 22, 0);
    const mostlyVerticalSingleEnd = canvasPoint(state, 24, 8);
    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...mostlyVerticalSingleStart,
    });
    state.handlePointerEvent({
      type: "drag",
      button: MouseButton.LEFT,
      ...mostlyVerticalSingleEnd,
    });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...mostlyVerticalSingleEnd });
    expect(state.getCompositeCell(22, 0)).toBe("│");
    expect(state.getCompositeCell(23, 4)).toBe("│");

    const diagonalSingleStart = canvasPoint(state, 28, 0);
    const diagonalSingleEnd = canvasPoint(state, 31, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...diagonalSingleStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...diagonalSingleEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...diagonalSingleEnd });
    expect(state.getCompositeCell(28, 0)).toBe("╲");

    state.setLineStyle("double");
    const mostlyHorizontalDoubleStart = canvasPoint(state, 0, 6);
    const mostlyHorizontalDoubleEnd = canvasPoint(state, 10, 9);
    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...mostlyHorizontalDoubleStart,
    });
    state.handlePointerEvent({
      type: "drag",
      button: MouseButton.LEFT,
      ...mostlyHorizontalDoubleEnd,
    });
    state.handlePointerEvent({
      type: "up",
      button: MouseButton.LEFT,
      ...mostlyHorizontalDoubleEnd,
    });
    expect(state.getCompositeCell(0, 6)).toBe("═");
    expect(state.getCompositeCell(4, 7)).toBe("═");

    const mostlyVerticalDoubleStart = canvasPoint(state, 14, 6);
    const mostlyVerticalDoubleEnd = canvasPoint(state, 15, 14);
    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...mostlyVerticalDoubleStart,
    });
    state.handlePointerEvent({
      type: "drag",
      button: MouseButton.LEFT,
      ...mostlyVerticalDoubleEnd,
    });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...mostlyVerticalDoubleEnd });
    expect(state.getCompositeCell(14, 6)).toBe("║");
    expect(state.getCompositeCell(15, 10)).toBe("║");
  });

  test("box styles can draw single and double borders", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");
    state.setBoxStyle("light");

    const lightStart = canvasPoint(state, 0, 0);
    const lightEnd = canvasPoint(state, 4, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...lightStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...lightEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...lightEnd });

    state.setBoxStyle("double");
    const doubleStart = canvasPoint(state, 6, 0);
    const doubleEnd = canvasPoint(state, 10, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...doubleStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...doubleEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...doubleEnd });

    expect(state.getCompositeCell(0, 0)).toBe("┌");
    expect(state.getCompositeCell(4, 2)).toBe("┘");
    expect(state.getCompositeCell(6, 0)).toBe("╔");
    expect(state.getCompositeCell(10, 2)).toBe("╝");
  });

  test("objects use the active color and selected objects can be recolored", () => {
    const state = new DrawState(30, 12);
    state.setInkColor("cyan");

    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 3, 0);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(state.getCompositeColor(0, 0)).toBe("cyan");

    state.setInkColor("magenta");
    expect(state.getCompositeColor(0, 0)).toBe("magenta");

    state.setMode("box");
    state.setInkColor("green");
    const boxStart = canvasPoint(state, 6, 0);
    const boxEnd = canvasPoint(state, 10, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });

    expect(state.getCompositeColor(6, 0)).toBe("green");
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
    expect(state.getCompositeCell(4, 3)).toBe("─");
    expect(state.getCompositeCell(6, 3)).toBe("─");
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

    expect(state.getCompositeCell(1, 2)).toBe("─");
    expect(state.getCompositeCell(2, 2)).toBe("─");
    expect(state.getCompositeCell(3, 2)).toBe("─");
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

    const adjustedStart = state.getCompositeCell(1, 1);
    const adjustedEnd = state.getCompositeCell(6, 2);
    expect((adjustedStart.codePointAt(0) ?? 0) >= 0x2800).toBe(true);
    expect((adjustedEnd.codePointAt(0) ?? 0) >= 0x2800).toBe(true);

    state.undo();
    expect(state.getCompositeCell(4, 1)).toBe("─");
  });

  test("holding Shift while dragging a line endpoint constrains it to an axis", () => {
    const state = new DrawState(30, 12);
    state.setMode("line");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 1);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    const dragEndStart = canvasPoint(state, 4, 1);
    const dragEndFinish = canvasPoint(state, 6, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragEndStart });
    state.handlePointerEvent({
      type: "drag",
      button: MouseButton.LEFT,
      shift: true,
      ...dragEndFinish,
    });
    state.handlePointerEvent({
      type: "up",
      button: MouseButton.LEFT,
      shift: true,
      ...dragEndFinish,
    });

    expect(state.getCompositeCell(4, 1)).toBe("─");
    expect(state.getCompositeCell(6, 1)).toBe("─");
    expect(state.getCompositeCell(6, 4)).toBe(" ");
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

  test("text mode requires clicking to start typing and Escape exits typing", () => {
    const state = new DrawState(30, 12);
    state.setMode("text");

    state.insertCharacter("a");
    expect(state.exportArt()).toBe("");

    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...canvasPoint(state, 2, 2),
    });
    state.insertCharacter("H");
    state.insertCharacter("i");
    expect(state.getCompositeCell(2, 2)).toBe("H");
    expect(state.getCompositeCell(3, 2)).toBe("i");

    state.clearSelection();
    state.insertCharacter("a");
    expect(state.exportArt()).toBe("  Hi");

    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...canvasPoint(state, 2, 2),
    });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...canvasPoint(state, 2, 2) });
    state.insertCharacter("!");
    expect(state.getCompositeCell(4, 2)).toBe("!");
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

  test("text tool supports selectable border modes", () => {
    const state = new DrawState(30, 12);
    state.setMode("text");

    expect(TEXT_BORDER_MODES).toEqual(["none", "single", "double", "underline"]);

    state.setTextBorderMode("single");
    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...canvasPoint(state, 1, 1),
    });
    state.insertCharacter("H");
    state.insertCharacter("i");
    expect(state.exportArt()).toBe(" ┌──┐\n │Hi│\n └──┘");

    state.clearCanvas();
    state.setTextBorderMode("double");
    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...canvasPoint(state, 1, 1),
    });
    state.insertCharacter("H");
    state.insertCharacter("i");
    expect(state.exportArt()).toBe(" ╔══╗\n ║Hi║\n ╚══╝");

    state.clearCanvas();
    state.setTextBorderMode("underline");
    state.handlePointerEvent({
      type: "down",
      button: MouseButton.LEFT,
      ...canvasPoint(state, 1, 1),
    });
    state.insertCharacter("H");
    state.insertCharacter("i");
    expect(state.exportArt()).toBe("  Hi\n  ──");
  });

  test("select mode can marquee-select and move multiple objects", () => {
    const state = new DrawState(40, 16);
    state.setMode("box");

    const firstStart = canvasPoint(state, 0, 0);
    const firstEnd = canvasPoint(state, 3, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...firstStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...firstEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...firstEnd });

    const secondStart = canvasPoint(state, 6, 0);
    const secondEnd = canvasPoint(state, 9, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...secondStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...secondEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...secondEnd });

    state.setMode("select");
    const marqueeStart = canvasPoint(state, 0, 3);
    const marqueeEnd = canvasPoint(state, 9, 0);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...marqueeStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...marqueeEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...marqueeEnd });

    const selected = state.getSelectedCellKeys();
    expect(selected.has("0,0")).toBe(true);
    expect(selected.has("9,2")).toBe(true);
    expect(state.getSelectionHandleCharacters().size).toBe(0);

    state.moveSelectedObjectBy(2, 2);

    expect(state.getCompositeCell(0, 0)).toBe(" ");
    expect(state.getCompositeCell(6, 0)).toBe(" ");
    expect(state.getCompositeCell(2, 2)).toBe("┏");
    expect(state.getCompositeCell(11, 4)).toBe("┛");
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
