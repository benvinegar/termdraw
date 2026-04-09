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
  test("exports a stamped brush", () => {
    const state = new DrawState(20, 10);
    state.stampBrushAtCursor();

    expect(state.exportArt()).toBe("#");
  });

  test("draws a straight line with pointer events", () => {
    const state = new DrawState(20, 10);
    const start = canvasPoint(state, 0, 0);
    const end = canvasPoint(state, 3, 0);

    state.handlePointerEvent({ type: "down", button: MouseButton.LEFT, ...start });
    state.handlePointerEvent({ type: "drag", button: MouseButton.LEFT, ...end });
    state.handlePointerEvent({ type: "up", button: MouseButton.LEFT, ...end });

    expect(state.exportArt()).toBe("####");
  });

  test("nested boxes alternate heavy and light borders", () => {
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

  test("undo and redo restore state", () => {
    const state = new DrawState(20, 10);
    state.stampBrushAtCursor();
    state.undo();
    expect(state.exportArt()).toBe("");

    state.redo();
    expect(state.exportArt()).toBe("#");
  });
});
