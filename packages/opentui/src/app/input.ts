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
import {
  dispatchTermDrawCommand,
  type TermDrawCommandEvent,
  type TermDrawCommandId,
} from "./commands.js";

/** Describes the callbacks needed by the extracted input handlers. */
type InputCallbacks = {
  requestRender: () => void;
  dismissStartupLogo: () => void;
};

/** Returns whether a key inserts exactly one printable terminal cell. */
function isPrintableKey(key: KeyEvent): boolean {
  if (key.ctrl || key.meta || key.option) return false;
  if (
    [
      "backspace",
      "delete",
      "enter",
      "return",
      "escape",
      "esc",
      "tab",
      "up",
      "down",
      "left",
      "right",
    ].includes(key.name.toLowerCase())
  ) {
    return false;
  }
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
    executeCommand: (id: TermDrawCommandId) => boolean;
  } & InputCallbacks,
): void {
  const {
    event,
    x,
    y,
    state,
    chromeMode,
    layout,
    executeCommand,
    requestRender,
    dismissStartupLogo,
  } = options;

  if (event.type !== "move" && event.type !== "over" && event.type !== "out") {
    dismissStartupLogo();
  }

  if (chromeMode === "full" && layout && !state.hasActivePointerInteraction) {
    const toolButton = getToolButtons(layout, state.currentMode).find((button) =>
      isInsideRect(x, y, button.left, button.top, button.width, button.height),
    );

    if (toolButton) {
      if (event.type === "down" && event.button === MouseButton.LEFT) {
        executeCommand(toolButton.commandId);
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
    /** Optional: when omitted, Enter keeps its historical meaning of exporting the drawing. */
    onCopy?: (() => void) | null;
    onSaveDiagram: (() => void) | null;
    onCancel: (() => void) | null;
    onCommand?: (event: TermDrawCommandEvent) => void;
  } & InputCallbacks,
): boolean {
  const {
    key,
    state,
    cancelOnCtrlCEnabled,
    onSave,
    onCopy,
    onSaveDiagram,
    onCancel,
    requestRender,
    dismissStartupLogo,
  } = options;
  dismissStartupLogo();
  // Focused text entry owns printable keys before the global command table. Brackets retain their
  // existing role as text-border controls.
  if (
    state.currentMode === "text" &&
    state.isTextEntryArmed &&
    key.raw !== "[" &&
    key.raw !== "]" &&
    isPrintableKey(key)
  ) {
    key.preventDefault();
    state.insertCharacter(key.raw);
    requestRender();
    return true;
  }

  if (
    dispatchTermDrawCommand(key, {
      state,
      cancelOnCtrlCEnabled,
      onSave,
      onCopy: onCopy ?? null,
      onSaveDiagram,
      onCancel,
      requestRender,
      onCommand: options.onCommand,
    })
  ) {
    return true;
  }

  if (state.currentMode === "text" && isPrintableKey(key)) {
    key.preventDefault();
    state.insertCharacter(key.raw);
    requestRender();
    return true;
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
