import type { DrawState } from "../draw-state.js";
import type { DrawMode } from "./types.js";

/** Closed vocabulary of editor actions produced by named commands. */
export type DrawIntent =
  | { type: "finish-text-entry" }
  | { type: "clear-selection" }
  | { type: "cycle-mode" }
  | { type: "set-mode"; mode: DrawMode }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear-canvas" }
  | { type: "move"; dx: number; dy: number }
  | { type: "cycle-style"; direction: -1 | 1 }
  | { type: "toggle-elbow-orientation" }
  | { type: "insert-or-stamp" }
  | { type: "backspace-or-erase" }
  | { type: "delete-or-erase" };

export type DrawIntentDispatch = (intent: DrawIntent) => boolean;

/** Applies a command-level intent while keeping contextual policy out of command definitions. */
export function dispatchDrawIntent(state: DrawState, intent: DrawIntent): boolean {
  switch (intent.type) {
    case "finish-text-entry":
      if (state.currentMode !== "text" || !state.isTextEntryArmed) return false;
      state.clearSelection();
      return true;
    case "clear-selection":
      state.clearSelection();
      return true;
    case "cycle-mode":
      state.cycleMode();
      return true;
    case "set-mode":
      state.setMode(intent.mode);
      return true;
    case "undo":
      state.undo();
      return true;
    case "redo":
      state.redo();
      return true;
    case "clear-canvas":
      state.clearCanvas();
      return true;
    case "move":
      if (state.hasSelectedObject && !state.isEditingText) {
        state.moveSelectedObjectBy(intent.dx, intent.dy);
      } else {
        state.moveCursor(intent.dx, intent.dy);
      }
      return true;
    case "cycle-style":
      if (state.currentMode === "box") {
        state.cycleBoxStyle(intent.direction);
        return true;
      }
      if (state.currentMode === "line" || state.currentMode === "elbow") {
        state.cycleLineStyle(intent.direction);
        return true;
      }
      if (state.currentMode === "paint") {
        state.cycleBrush(intent.direction);
        return true;
      }
      if (state.currentMode === "text") {
        state.cycleTextBorderMode(intent.direction);
        return true;
      }
      return false;
    case "toggle-elbow-orientation":
      if (state.currentMode !== "elbow") return false;
      state.toggleElbowOrientation();
      return true;
    case "insert-or-stamp":
      if (state.currentMode === "text") {
        state.insertCharacter(" ");
        return true;
      }
      if (
        state.currentMode === "line" ||
        state.currentMode === "elbow" ||
        state.currentMode === "paint"
      ) {
        state.stampBrushAtCursor();
        return true;
      }
      return false;
    case "backspace-or-erase":
      if (!state.isEditingText && state.hasSelectedObject) {
        state.deleteSelectedObject();
        return true;
      }
      if (state.currentMode === "text") {
        state.backspace();
        return true;
      }
      if (
        state.currentMode === "line" ||
        state.currentMode === "elbow" ||
        state.currentMode === "paint"
      ) {
        state.eraseAtCursor();
        return true;
      }
      return false;
    case "delete-or-erase":
      if (!state.isEditingText && state.hasSelectedObject) {
        state.deleteSelectedObject();
        return true;
      }
      if (state.currentMode === "text") {
        state.deleteAtCursor();
        return true;
      }
      if (
        state.currentMode === "line" ||
        state.currentMode === "elbow" ||
        state.currentMode === "paint"
      ) {
        state.eraseAtCursor();
        return true;
      }
      return false;
  }
}
