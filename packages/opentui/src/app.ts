/**
 * Public entry point for the termDRAW renderables.
 *
 * This file keeps the exported renderable classes and user-facing helpers in one place while
 * delegating layout, rendering, startup-logo, and input details to smaller internal modules in
 * `src/app/`.
 */
import {
  FrameBufferRenderable,
  type KeyEvent,
  type MouseEvent,
  type OptimizedBuffer,
  type RenderContext,
  type RenderableOptions,
} from "@opentui/core";
import { DrawState, INK_COLORS, truncateToCells, type DrawDocument } from "./draw-state.js";
import {
  getColorSwatches,
  getContextualStyleButtons,
  getDiagramSavePromptLayout,
  getLayout,
  getToolButtons,
} from "./app/layout.js";
import { handleDiagramSavePromptKey, handleKeyPress, handleMouseEvent } from "./app/input.js";
import {
  drawCanvas,
  drawChrome,
  drawDiagramSavePrompt,
  drawTooSmallMessage,
  drawToolPalette,
} from "./app/render.js";
import { renderStartupLogo } from "./app/startup-logo.js";
import { COLORS, MIN_HEIGHT, MIN_WIDTH, getCanvasInsets } from "./app/theme.js";
import type {
  AppLayout,
  ChromeMode,
  DiagramSavePromptKeyResult,
  DiagramSaveState,
} from "./app/types.js";

function normalizeDiagramPath(path: string): string {
  const trimmedPath = path.trim();
  const lastSeparatorIndex = Math.max(trimmedPath.lastIndexOf("/"), trimmedPath.lastIndexOf("\\"));
  const fileName = trimmedPath.slice(lastSeparatorIndex + 1);
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return `${trimmedPath}.td.json`;
  }

  return trimmedPath;
}

/** Configures the shared termDRAW frame-buffer renderable. */
export interface TermDrawRenderableOptions extends RenderableOptions<FrameBufferRenderable> {
  width?: number | "auto" | `${number}%`;
  height?: number | "auto" | `${number}%`;
  respectAlpha?: boolean;
  onSave?: (art: string) => void;
  onSaveDiagram?: (document: DrawDocument, path: string) => void | Promise<void>;
  onCancel?: () => void;
  initialDocument?: DrawDocument;
  diagramPath?: string;
  autoFocus?: boolean;
  showStartupLogo?: boolean;
  cancelOnCtrlC?: boolean;
  footerText?: string;
  chromeMode?: ChromeMode;
}

/**
 * Coordinates the retained draw state with frame-buffer rendering and input handling.
 *
 * The class owns lifecycle, callbacks, and canvas sizing while delegating chrome layout,
 * rendering, and key/mouse dispatch to smaller helper modules.
 */
export class TermDrawRenderable extends FrameBufferRenderable {
  private readonly state: DrawState;
  private readonly chromeMode: ChromeMode;
  private onSaveCallback: ((art: string) => void) | null = null;
  private onSaveDiagramCallback:
    | ((document: DrawDocument, path: string) => void | Promise<void>)
    | null = null;
  private onCancelCallback: (() => void) | null = null;
  private pendingInitialDocument: DrawDocument | null = null;
  private diagramPath: string | null = null;
  private readonly diagramSaveState: DiagramSaveState = {
    pending: false,
    prompt: null,
  };
  private autoFocusEnabled = false;
  private startupLogoEnabled = true;
  private startupLogoDismissed = false;
  private cancelOnCtrlCEnabled = false;
  private footerTextOverride: string | null = null;

  /** Creates a new termDRAW renderable using either the full chrome or editor-only mode. */
  constructor(ctx: RenderContext, options: TermDrawRenderableOptions = {}) {
    const {
      width,
      height,
      onSave,
      onSaveDiagram,
      onCancel,
      initialDocument,
      diagramPath,
      autoFocus = false,
      showStartupLogo = true,
      cancelOnCtrlC = false,
      footerText,
      chromeMode = "full",
      respectAlpha,
      ...renderableOptions
    } = options;

    super(ctx, {
      id: options.id ?? "term-draw",
      width: typeof width === "number" ? width : 1,
      height: typeof height === "number" ? height : 1,
      respectAlpha,
      ...renderableOptions,
    });

    this.chromeMode = chromeMode;
    this.state = new DrawState(this.width, this.height, getCanvasInsets(this.chromeMode));
    this.focusable = true;
    this.onSave = onSave;
    this.onSaveDiagram = onSaveDiagram;
    this.onCancel = onCancel;
    this.pendingInitialDocument = initialDocument ?? null;
    this.diagramPath = diagramPath?.trim() ? diagramPath : null;
    this.startupLogoDismissed = initialDocument !== undefined;
    this.showStartupLogo = showStartupLogo;
    this.autoFocus = autoFocus;
    this.cancelOnCtrlC = cancelOnCtrlC;
    this.footerText = footerText;

    if (width !== undefined) {
      this.width = width;
    }
    if (height !== undefined) {
      this.height = height;
    }

    this.syncCanvasLayout();
  }

  /** Sets the callback invoked when the user saves the current drawing. */
  public set onSave(handler: ((art: string) => void) | undefined) {
    this.onSaveCallback = handler ?? null;
  }

  /** Sets the callback invoked when the user cancels out of the editor. */
  public set onCancel(handler: (() => void) | undefined) {
    this.onCancelCallback = handler ?? null;
  }

  /** Sets the callback invoked when the user saves the editable diagram document. */
  public set onSaveDiagram(
    handler: ((document: DrawDocument, path: string) => void | Promise<void>) | undefined,
  ) {
    this.onSaveDiagramCallback = handler ?? null;
  }

  /** Enables or disables automatic focus after construction. */
  public set autoFocus(value: boolean | undefined) {
    this.autoFocusEnabled = value ?? false;

    if (!this.autoFocusEnabled) return;

    queueMicrotask(() => {
      if (this.isDestroyed || !this.autoFocusEnabled) return;
      this.focus();
    });
  }

  /** Controls whether the startup logo overlay can be shown. */
  public set showStartupLogo(value: boolean | undefined) {
    this.startupLogoEnabled = value ?? true;
    if (!this.startupLogoEnabled) {
      this.startupLogoDismissed = true;
    }
    this.requestRender();
  }

  /** Controls whether Ctrl+C cancels the editor in addition to Ctrl+Q. */
  public set cancelOnCtrlC(value: boolean | undefined) {
    this.cancelOnCtrlCEnabled = value ?? false;
  }

  /** Overrides the footer help text shown in the full-chrome renderable. */
  public set footerText(value: string | undefined) {
    this.footerTextOverride = value?.trim() ? value : null;
    this.requestRender();
  }

  /** Exports the current drawing as plain text art. */
  public exportArt(): string {
    this.loadPendingInitialDocumentIfNeeded();
    return this.state.exportArt();
  }

  /** Exports the current drawing as a versioned editable document. */
  public exportDocument(): DrawDocument {
    this.loadPendingInitialDocumentIfNeeded();
    return this.state.exportDocument();
  }

  /** Resizes the retained canvas whenever the outer renderable changes size. */
  protected override onResize(width: number, height: number): void {
    super.onResize(width, height);
    this.syncCanvasLayout();
    this.loadPendingInitialDocumentIfNeeded();
  }

  /** Dispatches mouse interaction to chrome hit targets or the draw-state pointer handler. */
  protected override onMouseEvent(event: MouseEvent): void {
    const layout = this.syncCanvasLayout();
    const x = event.x - this.x;
    const y = event.y - this.y;

    handleMouseEvent({
      event,
      x,
      y,
      state: this.state,
      chromeMode: this.chromeMode,
      layout,
      requestRender: () => this.requestRender(),
      dismissStartupLogo: () => this.dismissStartupLogo(),
    });
  }

  /** Draws either the full app chrome or the editor-only surface into the frame buffer. */
  protected override renderSelf(buffer: OptimizedBuffer): void {
    const layout = this.syncCanvasLayout();
    this.loadPendingInitialDocumentIfNeeded();
    this.frameBuffer.clear(COLORS.panel);

    if (this.chromeMode === "full") {
      if (this.width < MIN_WIDTH || this.height < MIN_HEIGHT) {
        drawTooSmallMessage(this.frameBuffer, this.width, this.height);
        super.renderSelf(buffer);
        return;
      }

      const fullLayout = layout!;
      const toolButtons = getToolButtons(fullLayout, this.state.currentMode);
      const styleButtons = getContextualStyleButtons(fullLayout, this.state.currentMode);
      const colorSwatches = getColorSwatches(fullLayout, INK_COLORS);

      drawChrome(
        this.frameBuffer,
        this.width,
        this.height,
        this.state,
        fullLayout,
        this.footerTextOverride,
        this.onSaveDiagramCallback !== null,
      );
      drawToolPalette(
        this.frameBuffer,
        this.state,
        fullLayout,
        toolButtons,
        styleButtons,
        colorSwatches,
      );
    }

    drawCanvas(this.frameBuffer, this.state);
    renderStartupLogo(
      this.frameBuffer,
      this.state,
      this.chromeMode,
      layout,
      this.startupLogoEnabled,
      this.startupLogoDismissed,
    );
    drawDiagramSavePrompt(
      this.frameBuffer,
      getDiagramSavePromptLayout(this.width, this.height, this.getDiagramSavePrompt()),
    );
    super.renderSelf(buffer);
  }

  /** Dispatches keyboard shortcuts, cursor movement, and text entry. */
  public override handleKeyPress(key: KeyEvent): boolean {
    const diagramSavePromptResult = handleDiagramSavePromptKey(key, this.getDiagramSavePrompt());
    if (diagramSavePromptResult.handled) {
      this.applyDiagramSavePromptKeyResult(diagramSavePromptResult);
      return true;
    }

    return handleKeyPress({
      key,
      state: this.state,
      cancelOnCtrlCEnabled: this.cancelOnCtrlCEnabled,
      onSave: this.onSaveCallback ? () => this.onSaveCallback?.(this.state.exportArt()) : null,
      onSaveDiagram: this.onSaveDiagramCallback ? () => this.beginDiagramSave() : null,
      onCancel: this.onCancelCallback,
      requestRender: () => this.requestRender(),
      dismissStartupLogo: () => this.dismissStartupLogo(),
    });
  }

  /** Hides the startup logo permanently after the first meaningful interaction. */
  private dismissStartupLogo(): void {
    if (!this.startupLogoEnabled || this.startupLogoDismissed) return;
    this.startupLogoDismissed = true;
    this.requestRender();
  }

  /** Returns the active save prompt state when the save dialog is visible. */
  private getDiagramSavePrompt() {
    return this.diagramSaveState.prompt;
  }

  /** Recomputes the canvas size and returns the full-chrome layout when applicable. */
  private syncCanvasLayout(): AppLayout | null {
    if (this.chromeMode === "editor") {
      this.state.ensureCanvasSize(this.width, this.height, getCanvasInsets(this.chromeMode));
      return null;
    }

    const layout = getLayout(this.width, this.height);
    this.state.ensureCanvasSize(
      layout.canvasViewWidth,
      this.height,
      getCanvasInsets(this.chromeMode),
    );
    return layout;
  }

  /** Applies any deferred initial document once the renderable has a usable canvas size. */
  private loadPendingInitialDocumentIfNeeded(): void {
    if (!this.pendingInitialDocument) return;

    this.state.loadDocument(this.pendingInitialDocument);
    this.pendingInitialDocument = null;
  }

  /** Starts a diagram save, prompting for a path when no diagram path is known yet. */
  private beginDiagramSave(): void {
    if (this.diagramSaveState.pending) return;

    if (this.diagramPath) {
      void this.saveDiagramToPath(this.diagramPath);
      return;
    }

    this.diagramSaveState.prompt = {
      value: "",
      error: null,
      pending: false,
    };
    this.state.setStatusMessage("Enter a path and press Enter to save the diagram.");
    this.requestRender();
  }

  /** Applies the result of the extracted save-prompt key handler to the renderable state. */
  private applyDiagramSavePromptKeyResult(result: DiagramSavePromptKeyResult): void {
    if (!result.handled) return;

    this.diagramSaveState.prompt = result.prompt;

    if (result.statusMessage) {
      this.state.setStatusMessage(result.statusMessage);
    }

    if (result.submitPath) {
      void this.saveDiagramToPath(result.submitPath);
      return;
    }

    this.requestRender();
  }

  /** Persists the editable document and updates the active diagram path on success. */
  private async saveDiagramToPath(path: string): Promise<void> {
    if (!this.onSaveDiagramCallback || this.diagramSaveState.pending) return;

    const normalizedPath = normalizeDiagramPath(path);
    this.diagramSaveState.pending = true;
    if (this.diagramSaveState.prompt) {
      this.diagramSaveState.prompt = {
        ...this.diagramSaveState.prompt,
        error: null,
        pending: true,
      };
    }
    this.state.setStatusMessage(`Saving diagram to ${normalizedPath}...`);
    this.requestRender();

    try {
      await this.onSaveDiagramCallback(this.state.exportDocument(), normalizedPath);
      this.diagramPath = normalizedPath;
      this.diagramSaveState.prompt = null;
      this.state.setStatusMessage(`Saved diagram to ${normalizedPath}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.diagramSaveState.prompt) {
        this.diagramSaveState.prompt = {
          ...this.diagramSaveState.prompt,
          error: message,
          pending: false,
        };
      }
      this.state.setStatusMessage(`Failed to save diagram: ${message}`);
    } finally {
      this.diagramSaveState.pending = false;
      if (this.diagramSaveState.prompt) {
        this.diagramSaveState.prompt = {
          ...this.diagramSaveState.prompt,
          pending: false,
        };
      }
      this.requestRender();
    }
  }
}

/** Options for the full-chrome standalone app renderable. */
export type TermDrawAppRenderableOptions = Omit<TermDrawRenderableOptions, "chromeMode">;

/** Options for the editor-only renderable. */
export type TermDrawEditorRenderableOptions = Omit<TermDrawRenderableOptions, "chromeMode">;

/** Full-chrome renderable wrapper used by the standalone app shell. */
export class TermDrawAppRenderable extends TermDrawRenderable {
  /** Creates a full-chrome termDRAW renderable. */
  constructor(ctx: RenderContext, options: TermDrawAppRenderableOptions = {}) {
    super(ctx, { ...options, chromeMode: "full" });
  }
}

/** Editor-only renderable wrapper used by embedded integrations. */
export class TermDrawEditorRenderable extends TermDrawRenderable {
  /** Creates an editor-only termDRAW renderable. */
  constructor(ctx: RenderContext, options: TermDrawEditorRenderableOptions = {}) {
    super(ctx, {
      ...options,
      chromeMode: "editor",
      showStartupLogo: options.showStartupLogo ?? false,
    });
  }
}

/** Formats saved artwork as either plain text or a fenced markdown block. */
export function formatSavedOutput(art: string, fenced: boolean): string {
  if (!fenced) return art;
  const content = art.length > 0 ? art : " ";
  return `\`\`\`text\n${content}\n\`\`\``;
}

/** Builds the CLI help text shown by the standalone termDRAW app. */
export function buildHelpText(binaryName = "termdraw"): string {
  return truncateToCells(
    `${binaryName} [--load file.td.json|-] [--output file] [--fenced|--plain]\n\n` +
      `Controls:\n` +
      `  right palette   click Select / Box / Line / Elbow / Brush / Text, box styles, and colors\n` +
      `  Ctrl+T / Tab    cycle select / box / line / elbow / brush / text\n` +
      `  B / A / U / P / E / T switch to Brush / Select / Box / Line / Elbow / Text outside text entry\n` +
      `  select tool     click to select, drag empty space to marquee-select multiple objects\n` +
      `  click objects   select and move them\n` +
      `  drag handles    resize boxes / adjust line endpoints\n` +
      `  line tool       choose Smooth (Braille-aware), Single, or Double line stencils\n` +
      `  elbow tool      choose Single, Double, or Dashed connectors; R toggles route\n` +
      `  text tool       choose No border, Single, Double, or Dashed textbox borders\n` +
      `  Shift + drag    constrain Line mode to an axis; route Elbow mode vertical-first for horizontal arrows\n` +
      `  selected text   shows a virtual selection box\n` +
      `  Delete          remove selected object\n` +
      `  Esc             deselect\n` +
      `  Ctrl+Q          quit\n` +
      `  Ctrl+Z / Ctrl+Y undo / redo\n` +
      `  Ctrl+X          clear canvas\n` +
      `  [ / ]           cycle box style in Box mode, line style in Line/Elbow mode, text border in Text mode, or brush in Brush mode\n` +
      `  mouse wheel     cycle box style in Box mode, line style in Line/Elbow mode, or brush in Brush mode\n` +
      `  brush tool      choose from preset brush stencils in the palette\n` +
      `  Space           stamp a line point or current brush / insert space in Text mode\n` +
      `  Enter / Ctrl+S  export art\n` +
      `  Ctrl+D          save diagram (.td.json), prompting for a path when needed\n\n` +
      `Options:\n` +
      `  --load <file>       open a native termDRAW document from a file\n` +
      `  --load -            read a native termDRAW document from stdin\n` +
      `  -o, --output <file>  write the result to a file\n` +
      `  --fenced            output as a fenced markdown code block\n` +
      `  --plain             output plain text (default)\n` +
      `  -h, --help          show this help\n`,
    4000,
  );
}
