import {
  CliRenderEvents,
  FrameBufferRenderable,
  RGBA,
  TextAttributes,
  type CliRenderer,
  type KeyEvent,
  type MouseEvent,
  type OptimizedBuffer,
} from "@opentui/core";
import { DrawState, padToWidth, truncateToCells, visibleCellCount, type PointerEventLike } from "./draw-state";

const MIN_WIDTH = 24;
const MIN_HEIGHT = 7;

const COLORS = {
  background: RGBA.fromHex("#0f172a"),
  panel: RGBA.fromHex("#0f172a"),
  border: RGBA.fromHex("#475569"),
  text: RGBA.fromHex("#e2e8f0"),
  dim: RGBA.fromHex("#94a3b8"),
  accent: RGBA.fromHex("#22d3ee"),
  warning: RGBA.fromHex("#f59e0b"),
  success: RGBA.fromHex("#22c55e"),
  preview: RGBA.fromHex("#64748b"),
  selectionFg: RGBA.fromHex("#f8fafc"),
  selectionBg: RGBA.fromHex("#0ea5e9"),
  handleFg: RGBA.fromHex("#f59e0b"),
  handleBg: RGBA.fromHex("#0f172a"),
  cursorFg: RGBA.fromHex("#0f172a"),
  cursorBg: RGBA.fromHex("#f8fafc"),
};

function isPrintableKey(key: KeyEvent): boolean {
  if (key.ctrl || key.meta || key.option) return false;
  if (!key.raw || key.raw.startsWith("\u001b")) return false;
  if (key.name === "space") return false;
  return visibleCellCount(key.raw) === 1;
}

function drawSegment(
  buffer: OptimizedBuffer,
  x: number,
  y: number,
  text: string,
  fg: RGBA,
  bg: RGBA,
  attributes = TextAttributes.NONE,
): number {
  if (text.length === 0) return x;
  buffer.drawText(text, x, y, fg, bg, attributes);
  return x + visibleCellCount(text);
}

export class OpenTuiDrawApp extends FrameBufferRenderable {
  private readonly state: DrawState;
  private readonly handleKeyPressBound = (key: KeyEvent) => {
    this.handleKeyPressEvent(key);
  };

  constructor(
    private readonly renderer: CliRenderer,
    private readonly onFinish: (art: string | null) => void,
  ) {
    super(renderer, {
      id: "draw-app",
      width: renderer.terminalWidth,
      height: renderer.terminalHeight,
      position: "absolute",
      left: 0,
      top: 0,
      zIndex: 1,
    });

    this.state = new DrawState(renderer.terminalWidth, renderer.terminalHeight);
    this.renderer.keyInput.on("keypress", this.handleKeyPressBound);
  }

  protected override onResize(width: number, height: number): void {
    super.onResize(width, height);
    this.state.ensureCanvasSize(width, height);
  }

  protected override onMouseEvent(event: MouseEvent): void {
    const translated: PointerEventLike = {
      type: event.type,
      button: event.button,
      x: event.x - this.x,
      y: event.y - this.y,
      scrollDirection: event.scroll?.direction,
    };

    this.state.handlePointerEvent(translated);
    this.requestRender();
    event.preventDefault();
    event.stopPropagation();
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    this.state.ensureCanvasSize(this.width, this.height);
    this.frameBuffer.clear(COLORS.panel);

    if (this.width < MIN_WIDTH || this.height < MIN_HEIGHT) {
      this.drawTooSmallMessage();
      super.renderSelf(buffer);
      return;
    }

    this.drawChrome();
    this.drawCanvas();
    super.renderSelf(buffer);
  }

  protected override destroySelf(): void {
    this.renderer.keyInput.off("keypress", this.handleKeyPressBound);
    super.destroySelf();
  }

  private handleKeyPressEvent(key: KeyEvent): void {
    const name = key.name.toLowerCase();

    if (key.ctrl && name === "c") {
      key.preventDefault();
      this.onFinish(null);
      return;
    }

    if (name === "escape") {
      key.preventDefault();
      this.onFinish(null);
      return;
    }

    if (name === "enter" || name === "return" || (key.ctrl && name === "s")) {
      key.preventDefault();
      this.onFinish(this.state.exportArt());
      return;
    }

    if (name === "tab" || (key.ctrl && name === "t")) {
      key.preventDefault();
      this.state.cycleMode();
      this.requestRender();
      return;
    }

    if (key.ctrl && !key.shift && name === "z") {
      key.preventDefault();
      this.state.undo();
      this.requestRender();
      return;
    }

    if ((key.ctrl && name === "y") || (key.ctrl && key.shift && name === "z")) {
      key.preventDefault();
      this.state.redo();
      this.requestRender();
      return;
    }

    if (key.ctrl && name === "x") {
      key.preventDefault();
      this.state.clearCanvas();
      this.requestRender();
      return;
    }

    if (this.state.currentMode === "select" && (name === "backspace" || name === "delete")) {
      key.preventDefault();
      this.state.deleteSelectedObject();
      this.requestRender();
      return;
    }

    if (name === "up") {
      key.preventDefault();
      if (this.state.currentMode === "select" && this.state.hasSelectedObject) {
        this.state.moveSelectedObjectBy(0, -1);
      } else {
        this.state.moveCursor(0, -1);
      }
      this.requestRender();
      return;
    }

    if (name === "down") {
      key.preventDefault();
      if (this.state.currentMode === "select" && this.state.hasSelectedObject) {
        this.state.moveSelectedObjectBy(0, 1);
      } else {
        this.state.moveCursor(0, 1);
      }
      this.requestRender();
      return;
    }

    if (name === "left") {
      key.preventDefault();
      if (this.state.currentMode === "select" && this.state.hasSelectedObject) {
        this.state.moveSelectedObjectBy(-1, 0);
      } else {
        this.state.moveCursor(-1, 0);
      }
      this.requestRender();
      return;
    }

    if (name === "right") {
      key.preventDefault();
      if (this.state.currentMode === "select" && this.state.hasSelectedObject) {
        this.state.moveSelectedObjectBy(1, 0);
      } else {
        this.state.moveCursor(1, 0);
      }
      this.requestRender();
      return;
    }

    if (this.state.currentMode === "line") {
      if (key.raw === "[") {
        key.preventDefault();
        this.state.cycleBrush(-1);
        this.requestRender();
        return;
      }

      if (key.raw === "]") {
        key.preventDefault();
        this.state.cycleBrush(1);
        this.requestRender();
        return;
      }

      if (name === "space") {
        key.preventDefault();
        this.state.stampBrushAtCursor();
        this.requestRender();
        return;
      }

      if (name === "backspace" || name === "delete") {
        key.preventDefault();
        this.state.eraseAtCursor();
        this.requestRender();
        return;
      }

      if (isPrintableKey(key)) {
        key.preventDefault();
        this.state.setBrush(key.raw);
        this.requestRender();
      }
      return;
    }

    if (this.state.currentMode === "text") {
      if (name === "backspace") {
        key.preventDefault();
        this.state.backspace();
        this.requestRender();
        return;
      }

      if (name === "delete") {
        key.preventDefault();
        this.state.deleteAtCursor();
        this.requestRender();
        return;
      }

      if (isPrintableKey(key)) {
        key.preventDefault();
        this.state.insertCharacter(key.raw);
        this.requestRender();
      }
    }
  }

  private drawTooSmallMessage(): void {
    const width = this.width;
    const height = this.height;
    const lines = [
      "Terminal too small for /draw.",
      `Need at least ${MIN_WIDTH}x${MIN_HEIGHT}.`,
      "Resize and try again.",
    ];

    const startY = Math.max(0, Math.floor(height / 2) - 1);
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index]!;
      const x = Math.max(0, Math.floor((width - visibleCellCount(text)) / 2));
      this.frameBuffer.drawText(text, x, startY + index, COLORS.warning, COLORS.panel, TextAttributes.BOLD);
    }
  }

  private drawChrome(): void {
    const width = this.width;
    const height = this.height;
    const innerWidth = Math.max(1, width - 2);

    this.drawHorizontalBorder(0, "╭", "╮");
    this.drawHeaderRow(1, innerWidth);
    this.drawStatusRow(2, innerWidth);
    this.drawHorizontalBorder(3, "├", "┤");
    this.drawHorizontalBorder(height - 1, "╰", "╯");
  }

  private drawHeaderRow(y: number, innerWidth: number): void {
    this.drawSideBorders(y);
    this.frameBuffer.drawText(" ".repeat(innerWidth), 1, y, COLORS.text, COLORS.panel);

    let x = 1;
    x = drawSegment(this.frameBuffer, x, y, "/draw", COLORS.accent, COLORS.panel, TextAttributes.BOLD);
    x = drawSegment(this.frameBuffer, x, y, "  mode:", COLORS.dim, COLORS.panel);

    const modeLabel = this.state.getModeLabel();
    const modeColor =
      this.state.currentMode === "line"
        ? COLORS.accent
        : this.state.currentMode === "box"
          ? COLORS.warning
          : this.state.currentMode === "text"
            ? COLORS.success
            : COLORS.selectionBg;
    x = drawSegment(this.frameBuffer, x, y, modeLabel, modeColor, COLORS.panel, TextAttributes.BOLD);
    x = drawSegment(this.frameBuffer, x, y, "  brush:", COLORS.dim, COLORS.panel);
    drawSegment(this.frameBuffer, x, y, `"${this.state.currentBrush}"`, COLORS.accent, COLORS.panel);
  }

  private drawStatusRow(y: number, innerWidth: number): void {
    this.drawSideBorders(y);
    const text =
      "Enter save • Esc cancel • select: move/resize/adjust • draw modes: drag existing objects to move • Delete removes selection • [ ] brush • right-drag delete";
    const combined = `${text}  ${this.state.currentStatus}`;
    const padded = padToWidth(combined, innerWidth);
    this.frameBuffer.drawText(padded, 1, y, COLORS.dim, COLORS.panel);
  }

  private drawCanvas(): void {
    const preview = this.state.getActivePreviewCharacters();
    const selectedCells = this.state.getSelectedCellKeys();
    const handleChars = this.state.getSelectionHandleCharacters();

    for (let y = 0; y < this.state.height; y += 1) {
      const rowY = this.state.canvasTopRow + y;
      this.drawSideBorders(rowY);

      for (let x = 0; x < this.state.width; x += 1) {
        const key = `${x},${y}`;
        const handleChar = handleChars.get(key);
        const previewChar = preview.get(key);
        const cell = handleChar ?? previewChar ?? this.state.getCompositeCell(x, y);
        const isCursor = x === this.state.currentCursorX && y === this.state.currentCursorY;
        const isSelected = selectedCells.has(key);
        const isHandle = handleChar !== undefined;
        const fg = isCursor
          ? COLORS.cursorFg
          : isHandle
            ? COLORS.handleFg
            : isSelected
              ? COLORS.selectionFg
              : previewChar
                ? COLORS.preview
                : COLORS.text;
        const bg = isCursor ? COLORS.cursorBg : isHandle ? COLORS.handleBg : isSelected ? COLORS.selectionBg : COLORS.panel;
        const attributes = isCursor || isSelected || isHandle ? TextAttributes.BOLD : TextAttributes.NONE;
        this.frameBuffer.setCell(x + 1, rowY, cell, fg, bg, attributes);
      }
    }
  }

  private drawSideBorders(y: number): void {
    this.frameBuffer.setCell(0, y, "│", COLORS.border, COLORS.panel);
    this.frameBuffer.setCell(this.width - 1, y, "│", COLORS.border, COLORS.panel);
  }

  private drawHorizontalBorder(y: number, left: string, right: string): void {
    this.frameBuffer.setCell(0, y, left, COLORS.border, COLORS.panel);
    for (let x = 1; x < this.width - 1; x += 1) {
      this.frameBuffer.setCell(x, y, "─", COLORS.border, COLORS.panel);
    }
    this.frameBuffer.setCell(this.width - 1, y, right, COLORS.border, COLORS.panel);
  }
}

export function formatSavedOutput(art: string, fenced: boolean): string {
  if (!fenced) return art;
  const content = art.length > 0 ? art : " ";
  return `\`\`\`text\n${content}\n\`\`\``;
}

export function buildHelpText(binaryName = "tui-draw"): string {
  return truncateToCells(
    `${binaryName} [--output file] [--fenced|--plain]\n\n` +
      `Controls:\n` +
      `  Ctrl+T / Tab   cycle select / box / line / text\n` +
      `  select mode    move objects, resize box corners, drag line endpoints\n` +
      `  draw modes     drag existing objects to move them\n` +
      `  Delete         remove selected object\n` +
      `  Ctrl+Z / Ctrl+Y undo / redo\n` +
      `  Ctrl+X         clear canvas\n` +
      `  [ / ]          cycle brush in line mode\n` +
      `  Enter / Ctrl+S save\n` +
      `  Esc / Ctrl+C   cancel\n\n` +
      `Options:\n` +
      `  -o, --output <file>  write the result to a file\n` +
      `  --fenced            output as a fenced markdown code block\n` +
      `  --plain             output plain text (default)\n` +
      `  -h, --help          show this help\n`,
    4000,
  );
}

export function createResizeHandler(renderer: CliRenderer, app: OpenTuiDrawApp): (width: number, height: number) => void {
  return (width: number, height: number) => {
    app.width = width;
    app.height = height;
    renderer.requestRender();
  };
}

export function attachResize(renderer: CliRenderer, app: OpenTuiDrawApp): () => void {
  const resizeHandler = createResizeHandler(renderer, app);
  renderer.on(CliRenderEvents.RESIZE, resizeHandler);
  return () => {
    renderer.off(CliRenderEvents.RESIZE, resizeHandler);
  };
}
