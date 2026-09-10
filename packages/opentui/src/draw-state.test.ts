import { describe, expect, test } from "bun:test";
import { MouseButton } from "@opentui/core";
import {
  DRAW_DOCUMENT_VERSION,
  DrawState,
  parseDrawDocument,
  TEXT_BORDER_MODES,
} from "./draw-state";

/** Converts canvas-local coordinates into the pointer coordinates expected by `DrawState`. */
function canvasPoint(state: DrawState, x: number, y: number) {
  return {
    x: state.canvasLeftCol + x,
    y: state.canvasTopRow + y,
  };
}

/** Reads committed content without overlays while exercising the state-owned scene cache. */
function contentCell(state: DrawState, x: number, y: number) {
  return {
    character: state.getCompositeCell(x, y),
    inkColor: state.getCompositeColor(x, y),
    kind: "content" as const,
  };
}

function contentCharacter(state: DrawState, x: number, y: number): string {
  return contentCell(state, x, y).character;
}

function contentColor(state: DrawState, x: number, y: number) {
  return contentCell(state, x, y).inkColor;
}

function projectionKeys(state: DrawState, kind: string): Set<string> {
  return new Set(
    [...state.getCanvasProjection().cells]
      .filter(([, cell]) => cell.kind === kind)
      .map(([key]) => key),
  );
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
    expect(contentCharacter(state, 0, 2)).toBe("│");
    expect(contentCharacter(state, 0, 5)).toBe("│");

    const diagonalDownStart = canvasPoint(state, 6, 0);
    const diagonalDownEnd = canvasPoint(state, 9, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...diagonalDownStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...diagonalDownEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...diagonalDownEnd });
    expect(contentCharacter(state, 6, 0)).toBe("╲");
    expect(contentCharacter(state, 9, 3)).toBe("╲");

    const diagonalUpStart = canvasPoint(state, 9, 7);
    const diagonalUpEnd = canvasPoint(state, 6, 10);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...diagonalUpStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...diagonalUpEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...diagonalUpEnd });
    expect(contentCharacter(state, 9, 7)).toBe("╱");
    expect(contentCharacter(state, 6, 10)).toBe("╱");

    const shallowStart = canvasPoint(state, 11, 0);
    const shallowEnd = canvasPoint(state, 18, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...shallowStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...shallowEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...shallowEnd });
    const shallowChar = contentCharacter(state, 12, 0);
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

    expect(contentCharacter(state, 1, 1)).toBe("─");
    expect(contentCharacter(state, 6, 1)).toBe("─");
    expect(contentCharacter(state, 6, 3)).toBe(" ");

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

    expect(contentCharacter(state, 10, 1)).toBe("│");
    expect(contentCharacter(state, 10, 6)).toBe("│");
    expect(contentCharacter(state, 12, 6)).toBe(" ");
  });

  test("elbow tool keeps a live orthogonal preview and commits with an arrowhead", () => {
    const state = new DrawState(24, 16);
    state.setMode("elbow");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 6, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });

    const preview = state.getCanvasProjection().cells;
    expect(preview.get("1,1")?.character).toBe("─");
    expect(preview.get("5,1")?.character).toBe("─");
    expect(preview.get("6,1")?.character).toBe("┐");
    expect(preview.get("6,2")?.character).toBe("│");
    expect(preview.get("6,4")?.character).toBe("v");

    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(contentCharacter(state, 1, 1)).toBe("─");
    expect(contentCharacter(state, 5, 1)).toBe("─");
    expect(contentCharacter(state, 6, 1)).toBe("┐");
    expect(contentCharacter(state, 6, 2)).toBe("│");
    expect(contentCharacter(state, 6, 4)).toBe("v");
  });

  test("R route toggle makes new elbows vertical-first for horizontal arrowheads", () => {
    const state = new DrawState(24, 16);
    state.setMode("elbow");
    state.toggleElbowOrientation();

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 6, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(contentCharacter(state, 1, 1)).toBe("│");
    expect(contentCharacter(state, 1, 4)).toBe("└");
    expect(contentCharacter(state, 6, 4)).toBe(">");
    const [object] = state.exportDocument().objects;
    expect(object?.type).toBe("elbow");
    expect(object?.type === "elbow" ? object.orientation : null).toBe("vertical-first");
  });

  test("holding Shift routes new elbows vertical-first for horizontal arrowheads", () => {
    const state = new DrawState(24, 16);
    state.setMode("elbow");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 6, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, shift: true, ...end });

    const preview = state.getCanvasProjection().cells;
    expect(preview.get("1,1")?.character).toBe("│");
    expect(preview.get("1,3")?.character).toBe("│");
    expect(preview.get("1,4")?.character).toBe("└");
    expect(preview.get("5,4")?.character).toBe("─");
    expect(preview.get("6,4")?.character).toBe(">");

    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, shift: true, ...end });

    expect(contentCharacter(state, 1, 1)).toBe("│");
    expect(contentCharacter(state, 1, 3)).toBe("│");
    expect(contentCharacter(state, 1, 4)).toBe("└");
    expect(contentCharacter(state, 5, 4)).toBe("─");
    expect(contentCharacter(state, 6, 4)).toBe(">");
    const [object] = state.exportDocument().objects;
    expect(object?.type).toBe("elbow");
    expect(object?.type === "elbow" ? object.orientation : null).toBe("vertical-first");
  });

  test("elbow tool supports dashed connector segments", () => {
    const state = new DrawState(24, 16);
    state.setMode("elbow");
    state.setLineStyle("dashed");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 5, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(contentCharacter(state, 1, 1)).toBe("┄");
    expect(contentCharacter(state, 4, 1)).toBe("┄");
    expect(contentCharacter(state, 5, 1)).toBe("┐");
    expect(contentCharacter(state, 5, 2)).toBe("┆");
    expect(contentCharacter(state, 5, 4)).toBe("v");
  });

  test("elbow tool uses corner glyphs that face the connected segments", () => {
    const state = new DrawState(24, 24);
    state.setMode("elbow");

    const drawElbow = (
      startPoint: { x: number; y: number },
      endPoint: { x: number; y: number },
    ) => {
      const start = canvasPoint(state, startPoint.x, startPoint.y);
      const end = canvasPoint(state, endPoint.x, endPoint.y);
      state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
      state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
      state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });
    };

    drawElbow({ x: 1, y: 1 }, { x: 5, y: 4 });
    drawElbow({ x: 10, y: 4 }, { x: 14, y: 1 });
    drawElbow({ x: 10, y: 6 }, { x: 6, y: 9 });
    drawElbow({ x: 5, y: 14 }, { x: 1, y: 11 });

    expect(contentCharacter(state, 5, 1)).toBe("┐");
    expect(contentCharacter(state, 14, 4)).toBe("┘");
    expect(contentCharacter(state, 6, 6)).toBe("┌");
    expect(contentCharacter(state, 1, 14)).toBe("└");
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
    expect(contentCharacter(state, 10, 4)).toBe(" ");
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

    expect(contentCharacter(state, 1, 1)).toBe("#");
    expect(contentCharacter(state, 2, 1)).toBe("#");
    expect(contentCharacter(state, 3, 1)).toBe("#");
    expect(contentCharacter(state, 4, 1)).toBe("#");
    expect(contentCharacter(state, 4, 2)).toBe("#");
    expect(contentCharacter(state, 4, 3)).toBe("#");
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

    expect(contentCharacter(state, 1, 1)).toBe(" ");
    expect(contentCharacter(state, 4, 3)).toBe("#");
    expect(contentCharacter(state, 6, 3)).toBe("#");
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

    expect(contentCharacter(state, 0, 0)).toBe("┏");
    expect(contentCharacter(state, 2, 1)).toBe("┌");
  });

  test("line styles choose the closest smooth, single, or double stencil by angle", () => {
    const state = new DrawState(40, 16);

    const smoothStart = canvasPoint(state, 0, 0);
    const smoothEnd = canvasPoint(state, 6, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...smoothStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...smoothEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...smoothEnd });
    const smoothChar = contentCharacter(state, 1, 0);
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
    expect(contentCharacter(state, 8, 0)).toBe("─");
    expect(contentCharacter(state, 12, 1)).toBe("─");

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
    expect(contentCharacter(state, 22, 0)).toBe("│");
    expect(contentCharacter(state, 23, 4)).toBe("│");

    const diagonalSingleStart = canvasPoint(state, 28, 0);
    const diagonalSingleEnd = canvasPoint(state, 31, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...diagonalSingleStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...diagonalSingleEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...diagonalSingleEnd });
    expect(contentCharacter(state, 28, 0)).toBe("╲");

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
    expect(contentCharacter(state, 0, 6)).toBe("═");
    expect(contentCharacter(state, 4, 7)).toBe("═");

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
    expect(contentCharacter(state, 14, 6)).toBe("║");
    expect(contentCharacter(state, 15, 10)).toBe("║");
  });

  test("box styles can draw single, double, and dashed borders", () => {
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

    state.setBoxStyle("dashed");
    const dashedStart = canvasPoint(state, 12, 0);
    const dashedEnd = canvasPoint(state, 18, 4);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dashedStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dashedEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dashedEnd });

    expect(contentCharacter(state, 0, 0)).toBe("┌");
    expect(contentCharacter(state, 4, 2)).toBe("┘");
    expect(contentCharacter(state, 6, 0)).toBe("╔");
    expect(contentCharacter(state, 10, 2)).toBe("╝");
    expect(contentCharacter(state, 12, 0)).toBe("┌");
    expect(contentCharacter(state, 13, 0)).toBe("-");
    expect(contentCharacter(state, 14, 0)).toBe("-");
    expect(contentCharacter(state, 12, 1)).toBe("╎");
    expect(contentCharacter(state, 12, 2)).toBe("╎");
    expect(contentCharacter(state, 18, 4)).toBe("┘");
  });

  test("objects use the active color and selected objects can be recolored", () => {
    const state = new DrawState(30, 12);
    state.setInkColor("cyan");

    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 3, 0);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(contentColor(state, 0, 0)).toBe("cyan");

    state.setInkColor("magenta");
    expect(contentColor(state, 0, 0)).toBe("magenta");

    state.setMode("box");
    state.setInkColor("green");
    const boxStart = canvasPoint(state, 6, 0);
    const boxEnd = canvasPoint(state, 10, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...boxStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...boxEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...boxEnd });

    expect(contentColor(state, 6, 0)).toBe("green");
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

    expect(contentCharacter(state, 2, 2)).toBe("┃");
    expect(contentCharacter(state, 4, 3)).toBe("H");
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

    expect(contentCharacter(state, 3, 2)).toBe(" ");
    expect(contentCharacter(state, 4, 3)).toBe("─");
    expect(contentCharacter(state, 6, 3)).toBe("─");
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

    expect(contentCharacter(state, 2, 2)).toBe(" ");
    expect(contentCharacter(state, 5, 3)).toBe("┌");
    expect(contentCharacter(state, 8, 5)).toBe("┘");
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

    expect(contentCharacter(state, 4, 3)).toBe(" ");
    expect(contentCharacter(state, 11, 2)).toBe("H");
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

    expect(contentCharacter(state, 1, 2)).toBe("─");
    expect(contentCharacter(state, 2, 2)).toBe("─");
    expect(contentCharacter(state, 3, 2)).toBe("─");
    expect(contentCharacter(state, 4, 2)).toBe("┃");
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

    expect(contentCharacter(state, 6, 2)).toBe(" ");
    expect(contentCharacter(state, 2, 2)).toBe("H");
    expect(contentCharacter(state, 3, 2)).toBe("i");
  });

  test("selected boxes expose resize handles and can be resized from a corner", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    const handles = state.getCanvasProjection().cells;
    expect(handles.get("1,1")?.character).toBe("●");
    expect(handles.get("4,3")?.character).toBe("●");

    const resizeStart = canvasPoint(state, 1, 1);
    const resizeEnd = canvasPoint(state, 0, 0);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...resizeStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...resizeEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...resizeEnd });

    expect(contentCharacter(state, 0, 0)).toBe("┏");
    expect(contentCharacter(state, 4, 3)).toBe("┛");

    state.undo();
    expect(contentCharacter(state, 1, 1)).toBe("┏");
    expect(contentCharacter(state, 0, 0)).toBe(" ");
  });

  test("line endpoints expose handles and can be dragged without a select mode", () => {
    const state = new DrawState(30, 12);
    state.setMode("line");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 1);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    const handles = state.getCanvasProjection().cells;
    expect(handles.get("1,1")?.character).toBe("●");
    expect(handles.get("4,1")?.character).toBe("●");

    const dragEndStart = canvasPoint(state, 4, 1);
    const dragEndFinish = canvasPoint(state, 6, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragEndStart });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEndFinish });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEndFinish });

    const adjustedStart = contentCharacter(state, 1, 1);
    const adjustedEnd = contentCharacter(state, 6, 2);
    expect((adjustedStart.codePointAt(0) ?? 0) >= 0x2800).toBe(true);
    expect((adjustedEnd.codePointAt(0) ?? 0) >= 0x2800).toBe(true);

    state.undo();
    expect(contentCharacter(state, 4, 1)).toBe("─");
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

    expect(contentCharacter(state, 4, 1)).toBe("─");
    expect(contentCharacter(state, 6, 1)).toBe("─");
    expect(contentCharacter(state, 6, 4)).toBe(" ");
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
    expect(contentCharacter(state, 0, 0)).toBe(" ");
    expect(contentCharacter(state, 3, 2)).toBe("┏");
    expect(contentCharacter(state, 7, 4)).toBe("┛");
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

    const selected = state.getCanvasProjection().cells;
    expect(selected.get("1,1")).toEqual({
      character: " ",
      inkColor: null,
      kind: "selection",
    });
    expect(selected.get("4,3")?.kind).toBe("selection");
    expect(selected.get("2,2")?.kind).toBe("selection");

    const dragFromVirtualBox = canvasPoint(state, 1, 1);
    const dragEnd = canvasPoint(state, 3, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...dragFromVirtualBox });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(contentCharacter(state, 2, 2)).toBe(" ");
    expect(contentCharacter(state, 4, 3)).toBe("H");
    expect(contentCharacter(state, 5, 3)).toBe("i");
  });

  test("text objects keep spaces inside the same virtual textbox", () => {
    const state = new DrawState(30, 14);
    state.setMode("text");

    const start = canvasPoint(state, 2, 2);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.insertCharacter("H");
    state.insertCharacter(" ");
    state.insertCharacter("i");

    const selected = state.getCanvasProjection().cells;
    expect(selected.get("2,2")?.kind).toBe("selection");
    expect(selected.get("3,2")?.kind).toBe("selection");
    expect(selected.get("4,2")?.kind).toBe("selection");
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
    expect(contentCharacter(state, 2, 2)).toBe("H");
    expect(contentCharacter(state, 3, 2)).toBe("i");

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
    expect(contentCharacter(state, 4, 2)).toBe("!");
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

    expect(contentCharacter(state, 0, 0)).toBe("H");
    expect(contentCharacter(state, 1, 0)).toBe("i");
    expect(contentCharacter(state, 2, 0)).toBe("!");

    const dragEnd = canvasPoint(state, 2, 1);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...dragEnd });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...dragEnd });

    expect(contentCharacter(state, 0, 0)).toBe(" ");
    expect(contentCharacter(state, 2, 1)).toBe("H");
    expect(contentCharacter(state, 3, 1)).toBe("i");
    expect(contentCharacter(state, 4, 1)).toBe("!");
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

    const selected = state.getCanvasProjection().cells;
    expect(selected.get("0,0")?.kind).toBe("selection");
    expect(selected.get("9,2")?.kind).toBe("selection");
    expect(projectionKeys(state, "handle").size).toBe(0);

    state.moveSelectedObjectBy(2, 2);

    expect(contentCharacter(state, 0, 0)).toBe(" ");
    expect(contentCharacter(state, 6, 0)).toBe(" ");
    expect(contentCharacter(state, 2, 2)).toBe("┏");
    expect(contentCharacter(state, 11, 4)).toBe("┛");
  });

  test("clearSelection deselects the active object", () => {
    const state = new DrawState(30, 12);
    state.setMode("box");

    const start = canvasPoint(state, 1, 1);
    const end = canvasPoint(state, 4, 3);
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(state.getEditorSnapshot().selectedObjectIds.length).toBeGreaterThan(0);
    expect(state.clearSelection()).toBe(true);
    expect(state.getEditorSnapshot().selectedObjectIds).toEqual([]);
    expect(projectionKeys(state, "selection").size).toBe(0);
    expect(projectionKeys(state, "handle").size).toBe(0);
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

    expect(contentCharacter(state, 4, 2)).toBe("┏");

    state.undo();
    expect(contentCharacter(state, 0, 0)).toBe("┏");

    state.redo();
    expect(contentCharacter(state, 4, 2)).toBe("┏");
  });

  test("exports and reloads a native document without losing object metadata", () => {
    const document = {
      version: DRAW_DOCUMENT_VERSION,
      objects: [
        {
          id: "obj-3",
          type: "box" as const,
          z: 1,
          parentId: null,
          color: "cyan" as const,
          left: 1,
          top: 1,
          right: 6,
          bottom: 4,
          style: "double" as const,
        },
        {
          id: "obj-7",
          type: "text" as const,
          z: 2,
          parentId: null,
          color: "yellow" as const,
          x: 2,
          y: 2,
          content: "Hi",
          border: "none" as const,
        },
      ],
    };

    const state = new DrawState(20, 10);
    state.loadDocument(document);

    expect(state.exportDocument()).toEqual({
      ...document,
      objects: [
        document.objects[0]!,
        {
          ...document.objects[1]!,
          parentId: "obj-3",
        },
      ],
    });
    expect(state.exportArt()).toBe(" ╔════╗\n ║Hi  ║\n ║    ║\n ╚════╝");
    expect(state.currentStatus).toContain("Loaded diagram with 2 objects");
  });

  test("loadDocument preserves stored coordinates for native documents", () => {
    const document = {
      version: DRAW_DOCUMENT_VERSION,
      objects: [
        {
          id: "obj-10",
          type: "box" as const,
          z: 1,
          parentId: null,
          color: "cyan" as const,
          left: 18,
          top: 7,
          right: 23,
          bottom: 11,
          style: "light" as const,
        },
      ],
    };

    const state = new DrawState(20, 10);
    state.loadDocument(document);

    expect(state.exportDocument()).toEqual(document);
    expect(state.currentStatus).toContain("Loaded diagram with 1 object");
  });

  test("parseDrawDocument maps legacy smooth elbows to single line style", () => {
    const document = parseDrawDocument(
      JSON.stringify({
        version: DRAW_DOCUMENT_VERSION,
        objects: [
          {
            id: "obj-1",
            type: "elbow",
            z: 1,
            parentId: null,
            color: "white",
            x1: 0,
            y1: 0,
            x2: 3,
            y2: 2,
            style: "smooth",
          },
        ],
      }),
    );

    const [object] = document.objects;
    expect(object?.type).toBe("elbow");
    expect(object?.type === "elbow" ? object.style : null).toBe("light");
  });

  test("viewport resizing does not mutate document coordinates", () => {
    const state = new DrawState(40, 20, { left: 0, top: 0, right: 0, bottom: 0 });
    state.loadDocument({
      version: DRAW_DOCUMENT_VERSION,
      objects: [
        {
          id: "obj-1",
          type: "box",
          z: 1,
          parentId: null,
          color: "white",
          left: 25,
          top: 10,
          right: 35,
          bottom: 15,
          style: "light",
        },
      ],
    });
    const before = state.exportDocument();

    state.ensureCanvasSize(10, 5, { left: 0, top: 0, right: 0, bottom: 0 });
    state.ensureCanvasSize(40, 20, { left: 0, top: 0, right: 0, bottom: 0 });

    expect(state.exportDocument()).toEqual(before);
  });

  test("mode changes and viewport changes clear transient pointer sessions", () => {
    const state = new DrawState(20, 10, { left: 0, top: 0, right: 0, bottom: 0 });
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, x: 1, y: 1 });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, x: 5, y: 1 });

    expect(state.hasActivePointerInteraction).toBe(true);
    expect(projectionKeys(state, "preview").size).toBeGreaterThan(0);

    state.setMode("box");
    expect(state.hasActivePointerInteraction).toBe(false);
    expect(projectionKeys(state, "preview").size).toBe(0);

    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, x: 2, y: 2 });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, x: 6, y: 4 });
    expect(state.hasActivePointerInteraction).toBe(true);

    state.ensureCanvasSize(15, 8, { left: 0, top: 0, right: 0, bottom: 0 });
    expect(state.hasActivePointerInteraction).toBe(false);
    expect(projectionKeys(state, "preview").size).toBe(0);
  });

  test("compatibility accessors retain independent canvas layers", () => {
    const state = new DrawState(20, 10, { left: 0, top: 0, right: 0, bottom: 0 });
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, x: 1, y: 1 });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, x: 5, y: 1 });

    expect(state.getActivePreviewCharacters().has("3,1")).toBe(true);

    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, x: 5, y: 1 });
    expect(state.getSelectedCellKeys().has("3,1")).toBe(true);
    expect(state.getSelectionHandleCharacters().has("1,1")).toBe(true);

    state.setMode("select");
    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, x: 1, y: 3 });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, x: 5, y: 4 });
    expect(state.getSelectionMarqueeCharacters().get("1,3")).toBe("·");
  });

  test("state and canvas projections are detached from mutable internals", () => {
    const state = new DrawState(20, 10, { left: 0, top: 0, right: 0, bottom: 0 });
    state.loadDocument({
      version: DRAW_DOCUMENT_VERSION,
      objects: [
        {
          id: "obj-1",
          type: "paint",
          z: 1,
          parentId: null,
          color: "cyan",
          points: [{ x: 2, y: 3 }],
          brush: "#",
        },
      ],
    });

    const snapshot = state.getSnapshot();
    const projection = state.getCanvasProjection();
    (snapshot.document.objects[0] as { id: string }).id = "changed";

    expect(state.exportDocument().objects[0]!.id).toBe("obj-1");
    expect(projection.cells.get("2,3")).toEqual({
      character: "#",
      inkColor: "cyan",
      kind: "content",
    });
    expect(projection.cells.get("0,0")?.kind).toBe("cursor");
    expect(projection.viewport).toEqual({ width: 20, height: 10, left: 0, top: 0 });
  });

  test("canvas projections invalidate the cached scene after document changes", () => {
    const state = new DrawState(20, 10, { left: 0, top: 0, right: 0, bottom: 0 });
    state.loadDocument({
      version: DRAW_DOCUMENT_VERSION,
      objects: [
        {
          id: "obj-1",
          type: "paint",
          z: 1,
          parentId: null,
          color: "cyan",
          points: [{ x: 2, y: 3 }],
          brush: "#",
        },
      ],
    });
    expect(state.getCanvasProjection().cells.get("2,3")?.character).toBe("#");

    state.loadDocument({
      version: DRAW_DOCUMENT_VERSION,
      objects: [
        {
          id: "obj-2",
          type: "paint",
          z: 1,
          parentId: null,
          color: "yellow",
          points: [{ x: 5, y: 4 }],
          brush: "@",
        },
      ],
    });
    const projection = state.getCanvasProjection();

    expect(projection.cells.has("2,3")).toBe(false);
    expect(projection.cells.get("5,4")).toEqual({
      character: "@",
      inkColor: "yellow",
      kind: "content",
    });
  });

  test("parseDrawDocument rejects invalid document shapes with clear errors", () => {
    expect(() =>
      parseDrawDocument(
        JSON.stringify({ version: DRAW_DOCUMENT_VERSION, objects: [{ id: "obj-1" }] }),
      ),
    ).toThrow("objects[0].z must be an integer.");

    expect(() => parseDrawDocument(JSON.stringify({ version: 999, objects: [] }))).toThrow(
      `termDRAW document version must be ${DRAW_DOCUMENT_VERSION}`,
    );
  });
});
