/**
 * Keyboard and mouse interaction helpers for the termDRAW app renderable.
 *
 * This file keeps chrome hit testing and keybinding dispatch out of `app.ts` while preserving
 * `TermDrawRenderable` as the coordinator that owns callbacks, focus, and render invalidation.
 */
import { MouseButton, type KeyEvent, type MouseEvent } from "@opentui/core";
import type {
  BoxStyle,
  DrawState,
  LineStyle,
  PointerEventLike,
  TextBorderMode,
} from "../draw-state.js";
import { splitGraphemes, visibleCellCount } from "../text.js";
import {
  getColorSwatches,
  getContextualStyleButtons,
  getToolButtons,
  isCanvasChromeEvent,
  isInsideRect,
} from "./layout.js";
import { INK_COLORS } from "../draw-state.js";
import type {
  AppLayout,
  ChromeMode,
  DiagramSavePromptKeyResult,
  DiagramSavePromptState,
} from "./types.js";
import { TOOL_HOTKEYS } from "./theme.js";

/** Describes the callbacks needed by the extracted input handlers. */
type InputCallbacks = {
  requestRender: () => void;
  dismissStartupLogo: () => void;
};

/** Returns whether a key inserts exactly one printable terminal cell. */
function isPrintableKey(key: KeyEvent): boolean {
  if (key.ctrl || key.meta || key.option) return false;
  if (!key.raw || key.raw.startsWith("\u001b")) return false;
  if (key.name === "space") return false;
  return visibleCellCount(key.raw) === 1;
}

/** Applies the selected contextual style row to the active tool. */
function applyStyleButtonSelection(state: DrawState, style: string): void {
  if (state.currentMode === "box") {
    state.setMode("box");
    state.setBoxStyle(style as BoxStyle);
    return;
  }

  if (state.currentMode === "line" || state.currentMode === "elbow") {
    state.setMode(state.currentMode);
    state.setLineStyle(style as LineStyle);
    return;
  }

  if (state.currentMode === "paint") {
    state.setMode("paint");
    state.setBrush(style);
    return;
  }

  if (state.currentMode === "text") {
    state.setMode("text");
    state.setTextBorderMode(style as TextBorderMode);
  }
}

/** Handles mouse interaction for the renderable and its full-chrome palette. */
export function handleMouseEvent(
  options: {
    event: MouseEvent;
    x: number;
    y: number;
    state: DrawState;
    chromeMode: ChromeMode;
    layout: AppLayout | null;
  } & InputCallbacks,
): void {
  const { event, x, y, state, chromeMode, layout, requestRender, dismissStartupLogo } = options;

  if (event.type !== "move" && event.type !== "over" && event.type !== "out") {
    dismissStartupLogo();
  }

  if (chromeMode === "full" && layout && !state.hasActivePointerInteraction) {
    const toolButton = getToolButtons(layout, state.currentMode).find((button) =>
      isInsideRect(x, y, button.left, button.top, button.width, button.height),
    );

    if (toolButton) {
      if (event.type === "down" && event.button === MouseButton.LEFT) {
        state.setMode(toolButton.mode);
        requestRender();
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const styleButton = getContextualStyleButtons(layout, state.currentMode).find((button) =>
      isInsideRect(x, y, button.left, button.top, button.width, 1),
    );

    if (styleButton) {
      if (event.type === "down" && event.button === MouseButton.LEFT) {
        applyStyleButtonSelection(state, styleButton.style);
        requestRender();
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const colorSwatch = getColorSwatches(layout, INK_COLORS).find((swatch) =>
      isInsideRect(x, y, swatch.left, swatch.top, swatch.width, 1),
    );

    if (colorSwatch) {
      if (event.type === "down" && event.button === MouseButton.LEFT) {
        state.setInkColor(colorSwatch.color);
        requestRender();
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!isCanvasChromeEvent(state.canvasLeftCol, state.canvasTopRow, layout, x, y)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  const translated: PointerEventLike = {
    type: event.type,
    button: event.button,
    x,
    y,
    scrollDirection: event.scroll?.direction,
    shift: event.modifiers.shift,
  };

  state.handlePointerEvent(translated);
  requestRender();
  event.preventDefault();
  event.stopPropagation();
}

/** Handles keyboard shortcuts and text entry for the renderable. */
export function handleKeyPress(
  options: {
    key: KeyEvent;
    state: DrawState;
    cancelOnCtrlCEnabled: boolean;
    onSave: (() => void) | null;
    onSaveDiagram: (() => void) | null;
    onCancel: (() => void) | null;
  } & InputCallbacks,
): boolean {
  const {
    key,
    state,
    cancelOnCtrlCEnabled,
    onSave,
    onSaveDiagram,
    onCancel,
    requestRender,
    dismissStartupLogo,
  } = options;
  const name = key.name.toLowerCase();

  dismissStartupLogo();

  if ((cancelOnCtrlCEnabled && key.ctrl && name === "c") || (key.ctrl && name === "q")) {
    key.preventDefault();
    onCancel?.();
    return true;
  }

  if (name === "escape" || name === "esc") {
    key.preventDefault();
    state.clearSelection();
    requestRender();
    return true;
  }

  if (name === "enter" || name === "return" || (key.ctrl && name === "s")) {
    key.preventDefault();
    onSave?.();
    return true;
  }

  if (key.ctrl && name === "d") {
    if (!onSaveDiagram) return false;
    key.preventDefault();
    onSaveDiagram();
    return true;
  }

  if (name === "tab" || (key.ctrl && name === "t")) {
    key.preventDefault();
    state.cycleMode();
    requestRender();
    return true;
  }

  const toolHotkeyMode =
    (state.currentMode === "text" && state.isTextEntryArmed) || key.ctrl || key.meta || key.option
      ? null
      : (TOOL_HOTKEYS[name] ?? null);
  if (toolHotkeyMode) {
    key.preventDefault();
    state.setMode(toolHotkeyMode);
    requestRender();
    return true;
  }

  if (key.ctrl && !key.shift && name === "z") {
    key.preventDefault();
    state.undo();
    requestRender();
    return true;
  }

  if ((key.ctrl && name === "y") || (key.ctrl && key.shift && name === "z")) {
    key.preventDefault();
    state.redo();
    requestRender();
    return true;
  }

  if (key.ctrl && name === "x") {
    key.preventDefault();
    state.clearCanvas();
    requestRender();
    return true;
  }

  if (
    !state.isEditingText &&
    state.hasSelectedObject &&
    (name === "backspace" || name === "delete")
  ) {
    key.preventDefault();
    state.deleteSelectedObject();
    requestRender();
    return true;
  }

  if (name === "up") {
    key.preventDefault();
    if (state.hasSelectedObject && !state.isEditingText) {
      state.moveSelectedObjectBy(0, -1);
    } else {
      state.moveCursor(0, -1);
    }
    requestRender();
    return true;
  }

  if (name === "down") {
    key.preventDefault();
    if (state.hasSelectedObject && !state.isEditingText) {
      state.moveSelectedObjectBy(0, 1);
    } else {
      state.moveCursor(0, 1);
    }
    requestRender();
    return true;
  }

  if (name === "left") {
    key.preventDefault();
    if (state.hasSelectedObject && !state.isEditingText) {
      state.moveSelectedObjectBy(-1, 0);
    } else {
      state.moveCursor(-1, 0);
    }
    requestRender();
    return true;
  }

  if (name === "right") {
    key.preventDefault();
    if (state.hasSelectedObject && !state.isEditingText) {
      state.moveSelectedObjectBy(1, 0);
    } else {
      state.moveCursor(1, 0);
    }
    requestRender();
    return true;
  }

  if (state.currentMode === "box") {
    if (key.raw === "[") {
      key.preventDefault();
      state.cycleBoxStyle(-1);
      requestRender();
      return true;
    }

    if (key.raw === "]") {
      key.preventDefault();
      state.cycleBoxStyle(1);
      requestRender();
      return true;
    }
  }

  if (state.currentMode === "line" || state.currentMode === "elbow") {
    if (key.raw === "[") {
      key.preventDefault();
      state.cycleLineStyle(-1);
      requestRender();
      return true;
    }

    if (key.raw === "]") {
      key.preventDefault();
      state.cycleLineStyle(1);
      requestRender();
      return true;
    }

    if (state.currentMode === "elbow" && name === "r") {
      key.preventDefault();
      state.toggleElbowOrientation();
      requestRender();
      return true;
    }

    if (name === "space") {
      key.preventDefault();
      state.stampBrushAtCursor();
      requestRender();
      return true;
    }

    if (name === "backspace" || name === "delete") {
      key.preventDefault();
      state.eraseAtCursor();
      requestRender();
      return true;
    }

    return false;
  }

  if (state.currentMode === "paint") {
    if (key.raw === "[") {
      key.preventDefault();
      state.cycleBrush(-1);
      requestRender();
      return true;
    }

    if (key.raw === "]") {
      key.preventDefault();
      state.cycleBrush(1);
      requestRender();
      return true;
    }

    if (name === "space") {
      key.preventDefault();
      state.stampBrushAtCursor();
      requestRender();
      return true;
    }

    if (name === "backspace" || name === "delete") {
      key.preventDefault();
      state.eraseAtCursor();
      requestRender();
      return true;
    }

    return false;
  }

  if (state.currentMode === "text") {
    if (key.raw === "[") {
      key.preventDefault();
      state.cycleTextBorderMode(-1);
      requestRender();
      return true;
    }

    if (key.raw === "]") {
      key.preventDefault();
      state.cycleTextBorderMode(1);
      requestRender();
      return true;
    }

    if (name === "backspace") {
      key.preventDefault();
      state.backspace();
      requestRender();
      return true;
    }

    if (name === "delete") {
      key.preventDefault();
      state.deleteAtCursor();
      requestRender();
      return true;
    }

    if (name === "space") {
      key.preventDefault();
      state.insertCharacter(" ");
      requestRender();
      return true;
    }

    if (isPrintableKey(key)) {
      key.preventDefault();
      state.insertCharacter(key.raw);
      requestRender();
      return true;
    }
  }

  return false;
}

/** Handles keyboard input while the diagram save prompt is visible. */
export function handleDiagramSavePromptKey(
  key: KeyEvent,
  prompt: DiagramSavePromptState | null,
): DiagramSavePromptKeyResult {
  if (!prompt) {
    return {
      handled: false,
      prompt: null,
    };
  }

  const name = key.name.toLowerCase();
  if (name === "escape" || name === "esc") {
    key.preventDefault();
    return {
      handled: true,
      prompt: null,
      statusMessage: "Save diagram cancelled.",
    };
  }

  if (name === "enter" || name === "return") {
    key.preventDefault();
    const path = prompt.value.trim();
    if (!path) {
      return {
        handled: true,
        prompt: {
          ...prompt,
          error: "Path is required.",
        },
        statusMessage: "Diagram path is required.",
      };
    }

    return {
      handled: true,
      prompt: {
        ...prompt,
        error: null,
      },
      submitPath: path,
    };
  }

  if (name === "backspace") {
    key.preventDefault();
    const graphemes = splitGraphemes(prompt.value);
    graphemes.pop();
    return {
      handled: true,
      prompt: {
        ...prompt,
        value: graphemes.join(""),
        error: null,
      },
    };
  }

  if (
    !key.ctrl &&
    !key.meta &&
    !key.option &&
    key.raw &&
    !key.raw.startsWith("\u001b") &&
    name !== "tab"
  ) {
    key.preventDefault();
    return {
      handled: true,
      prompt: {
        ...prompt,
        value: prompt.value + key.raw,
        error: null,
      },
    };
  }

  return {
    handled: true,
    prompt,
  };
}
