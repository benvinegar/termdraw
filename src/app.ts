import {
  FrameBufferRenderable,
  MouseButton,
  RGBA,
  TextAttributes,
  type KeyEvent,
  type MouseEvent,
  type OptimizedBuffer,
  type RenderContext,
  type RenderableOptions,
} from "@opentui/core";
import {
  DrawState,
  INK_COLORS,
  padToWidth,
  truncateToCells,
  visibleCellCount,
  type BoxStyle,
  type DrawMode,
  type InkColor,
  type PointerEventLike,
} from "./draw-state";

const MIN_WIDTH = 45;
const MIN_HEIGHT = 24;
const TOOL_PALETTE_WIDTH = 17;
const TOOL_BUTTON_WIDTH = 13;
const BOX_STYLE_BUTTON_WIDTH = 10;
const TOOL_BUTTON_HEIGHT = 3;
const BOX_STYLE_ROW_COUNT = 4;
const COLOR_SWATCH_WIDTH = 3;
const COLOR_SWATCH_COLUMNS = 4;

const COLORS = {
  background: RGBA.fromHex("#0f172a"),
  panel: RGBA.fromHex("#0f172a"),
  border: RGBA.fromHex("#475569"),
  text: RGBA.fromHex("#e2e8f0"),
  dim: RGBA.fromHex("#94a3b8"),
  accent: RGBA.fromHex("#22d3ee"),
  warning: RGBA.fromHex("#f59e0b"),
  success: RGBA.fromHex("#22c55e"),
  paint: RGBA.fromHex("#a855f7"),
  preview: RGBA.fromHex("#64748b"),
  selectionFg: RGBA.fromHex("#f8fafc"),
  selectionBg: RGBA.fromHex("#0ea5e9"),
  handleFg: RGBA.fromHex("#f59e0b"),
  handleBg: RGBA.fromHex("#0f172a"),
  cursorFg: RGBA.fromHex("#0f172a"),
  cursorBg: RGBA.fromHex("#f8fafc"),
};

const STARTUP_LOGO_LINES = [
  "  `::                              :::::::-.  :::::::..    :::.  .::    .   .:::.:",
  "   ;;                               ;;,   `';,;;;;``;;;;   ;;`;; ';;,  ;;  ;;;';;;",
  "=[[[[[[.,cc[[[cc.=,,[[==[ccc, ,cccc,`[[     [[ [[[,/[[['  ,[[ '[[,'[[, [[, [[' '[[",
  '   $$   $$$___--\'`$$$"``$$$$$$$$"$$$ $$,    $$ $$$$$$c   c$$$cc$$$c Y$c$$$c$P   $$',
  '   88,  88b    ,o,888   888 Y88" 888o888_,o8P\' 888b "88bo,888   888  "88"888    ""',
  '   MMM   "YUMMMMP""MM,  MMM  M\'  "MMMMMMP"`   MMMM   "W" YMM   ""` "M "M"    MM',
] as const;
const STARTUP_LOGO_CAPTION = "(c) 2026 Ben Vinegar  ·  Licensed under MIT";

type AppLayout = {
  dividerX: number;
  paletteLeft: number;
  paletteWidth: number;
  bodyTop: number;
  bodyBottom: number;
  footerY: number;
  canvasViewWidth: number;
};

type ToolButton = {
  mode: DrawMode;
  left: number;
  top: number;
  width: number;
  height: number;
  icon: string;
  label: string;
  color: RGBA;
};

type BoxStyleButton = {
  style: BoxStyle;
  left: number;
  top: number;
  width: number;
  sample: string;
  label: string;
};

type ColorSwatch = {
  color: InkColor;
  left: number;
  top: number;
  width: number;
};

const BOX_STYLE_OPTIONS: { style: BoxStyle; sample: string; label: string }[] = [
  { style: "auto", sample: "▣", label: "Auto" },
  { style: "light", sample: "┌─┐", label: "Single" },
  { style: "heavy", sample: "┏━┓", label: "Heavy" },
  { style: "double", sample: "╔═╗", label: "Double" },
];

const INK_COLOR_VALUES: Record<InkColor, RGBA> = {
  white: RGBA.fromHex("#e2e8f0"),
  red: RGBA.fromHex("#ef4444"),
  orange: RGBA.fromHex("#f97316"),
  yellow: RGBA.fromHex("#eab308"),
  green: RGBA.fromHex("#22c55e"),
  cyan: RGBA.fromHex("#06b6d4"),
  blue: RGBA.fromHex("#3b82f6"),
  magenta: RGBA.fromHex("#d946ef"),
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

function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  const [ar, ag, ab, aa] = a.toInts();
  const [br, bg, bb, ba] = b.toInts();
  const mix = (left: number, right: number) => Math.round(left + (right - left) * t);
  return RGBA.fromInts(mix(ar, br), mix(ag, bg), mix(ab, bb), mix(aa, ba));
}

function getStartupLogoColor(rowIndex: number, colIndex: number, lineWidth: number): RGBA {
  const verticalT = STARTUP_LOGO_LINES.length <= 1 ? 0 : rowIndex / (STARTUP_LOGO_LINES.length - 1);
  const verticalColor =
    verticalT <= 0.55
      ? mixColor(COLORS.dim, COLORS.accent, verticalT / 0.55)
      : mixColor(COLORS.accent, COLORS.warning, (verticalT - 0.55) / 0.45);
  const horizontalT = lineWidth <= 1 ? 0 : colIndex / (lineWidth - 1);
  const highlightStrength = 0.1 + 0.16 * Math.sin(horizontalT * Math.PI);
  return mixColor(verticalColor, COLORS.text, highlightStrength);
}

function getStartupLogoCaptionColor(): RGBA {
  return mixColor(COLORS.border, COLORS.text, 0.3);
}

function getInkColorValue(color: InkColor): RGBA {
  return INK_COLOR_VALUES[color];
}

function getInkColorContrast(color: InkColor): RGBA {
  return color === "white" || color === "yellow" ? COLORS.panel : COLORS.text;
}

function isInsideRect(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  return x >= left && x < left + width && y >= top && y < top + height;
}

export interface TermDrawRenderableOptions extends RenderableOptions<TermDrawRenderable> {
  width?: number | "auto" | `${number}%`;
  height?: number | "auto" | `${number}%`;
  respectAlpha?: boolean;
  onSave?: (art: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  showStartupLogo?: boolean;
  cancelOnCtrlC?: boolean;
}

export class TermDrawRenderable extends FrameBufferRenderable {
  private readonly state: DrawState;
  private onSaveCallback: ((art: string) => void) | null = null;
  private onCancelCallback: (() => void) | null = null;
  private autoFocusEnabled = false;
  private startupLogoEnabled = true;
  private startupLogoDismissed = false;
  private cancelOnCtrlCEnabled = false;

  constructor(ctx: RenderContext, options: TermDrawRenderableOptions = {}) {
    const {
      width,
      height,
      onSave,
      onCancel,
      autoFocus = false,
      showStartupLogo = true,
      cancelOnCtrlC = false,
      respectAlpha,
      ...renderableOptions
    } = options;

    super(ctx, {
      id: options.id ?? "term-draw",
      width: typeof width === "number" ? width : 1,
      height: typeof height === "number" ? height : 1,
      respectAlpha,
      ...renderableOptions,
    } as any);

    this.state = new DrawState(this.width, this.height);
    this.focusable = true;
    this.onSave = onSave;
    this.onCancel = onCancel;
    this.showStartupLogo = showStartupLogo;
    this.autoFocus = autoFocus;
    this.cancelOnCtrlC = cancelOnCtrlC;

    if (width !== undefined) {
      this.width = width;
    }
    if (height !== undefined) {
      this.height = height;
    }

    this.syncCanvasLayout();
  }

  public set onSave(handler: ((art: string) => void) | undefined) {
    this.onSaveCallback = handler ?? null;
  }

  public set onCancel(handler: (() => void) | undefined) {
    this.onCancelCallback = handler ?? null;
  }

  public set autoFocus(value: boolean | undefined) {
    this.autoFocusEnabled = value ?? false;

    if (!this.autoFocusEnabled) return;

    queueMicrotask(() => {
      if (this.isDestroyed || !this.autoFocusEnabled) return;
      this.focus();
    });
  }

  public set showStartupLogo(value: boolean | undefined) {
    this.startupLogoEnabled = value ?? true;
    if (!this.startupLogoEnabled) {
      this.startupLogoDismissed = true;
    }
    this.requestRender();
  }

  public set cancelOnCtrlC(value: boolean | undefined) {
    this.cancelOnCtrlCEnabled = value ?? false;
  }

  public exportArt(): string {
    return this.state.exportArt();
  }

  protected override onResize(width: number, height: number): void {
    super.onResize(width, height);
    this.syncCanvasLayout();
  }

  protected override onMouseEvent(event: MouseEvent): void {
    const layout = this.syncCanvasLayout();
    const x = event.x - this.x;
    const y = event.y - this.y;

    if (event.type !== "move" && event.type !== "over" && event.type !== "out") {
      this.dismissStartupLogo();
    }

    if (!this.state.hasActivePointerInteraction) {
      const toolButton = this.getToolButtons(layout).find((button) =>
        isInsideRect(x, y, button.left, button.top, button.width, button.height),
      );

      if (toolButton) {
        if (event.type === "down" && event.button === MouseButton.LEFT) {
          this.state.setMode(toolButton.mode);
          this.requestRender();
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const boxStyleButton = this.getBoxStyleButtons(layout).find((button) =>
        isInsideRect(x, y, button.left, button.top, button.width, 1),
      );

      if (boxStyleButton) {
        if (event.type === "down" && event.button === MouseButton.LEFT) {
          this.state.setMode("box");
          this.state.setBoxStyle(boxStyleButton.style);
          this.requestRender();
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const colorSwatch = this.getColorSwatches(layout).find((swatch) =>
        isInsideRect(x, y, swatch.left, swatch.top, swatch.width, 1),
      );

      if (colorSwatch) {
        if (event.type === "down" && event.button === MouseButton.LEFT) {
          this.state.setInkColor(colorSwatch.color);
          this.requestRender();
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!this.isCanvasChromeEvent(x, y, layout)) {
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
    };

    this.state.handlePointerEvent(translated);
    this.requestRender();
    event.preventDefault();
    event.stopPropagation();
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const layout = this.syncCanvasLayout();
    this.frameBuffer.clear(COLORS.panel);

    if (this.width < MIN_WIDTH || this.height < MIN_HEIGHT) {
      this.drawTooSmallMessage();
      super.renderSelf(buffer);
      return;
    }

    this.drawChrome(layout);
    this.drawToolPalette(layout);
    this.drawCanvas();
    this.drawStartupLogo(layout);
    super.renderSelf(buffer);
  }

  public override handleKeyPress(key: KeyEvent): boolean {
    const name = key.name.toLowerCase();

    this.dismissStartupLogo();

    if ((this.cancelOnCtrlCEnabled && key.ctrl && name === "c") || (key.ctrl && name === "q")) {
      key.preventDefault();
      this.onCancelCallback?.();
      return true;
    }

    if (name === "escape") {
      key.preventDefault();
      this.state.clearSelection();
      this.requestRender();
      return true;
    }

    if (name === "enter" || name === "return" || (key.ctrl && name === "s")) {
      key.preventDefault();
      this.onSaveCallback?.(this.state.exportArt());
      return true;
    }

    if (name === "tab" || (key.ctrl && name === "t")) {
      key.preventDefault();
      this.state.cycleMode();
      this.requestRender();
      return true;
    }

    if (key.ctrl && !key.shift && name === "z") {
      key.preventDefault();
      this.state.undo();
      this.requestRender();
      return true;
    }

    if ((key.ctrl && name === "y") || (key.ctrl && key.shift && name === "z")) {
      key.preventDefault();
      this.state.redo();
      this.requestRender();
      return true;
    }

    if (key.ctrl && name === "x") {
      key.preventDefault();
      this.state.clearCanvas();
      this.requestRender();
      return true;
    }

    if (
      !this.state.isEditingText &&
      this.state.hasSelectedObject &&
      (name === "backspace" || name === "delete")
    ) {
      key.preventDefault();
      this.state.deleteSelectedObject();
      this.requestRender();
      return true;
    }

    if (name === "up") {
      key.preventDefault();
      if (this.state.hasSelectedObject && !this.state.isEditingText) {
        this.state.moveSelectedObjectBy(0, -1);
      } else {
        this.state.moveCursor(0, -1);
      }
      this.requestRender();
      return true;
    }

    if (name === "down") {
      key.preventDefault();
      if (this.state.hasSelectedObject && !this.state.isEditingText) {
        this.state.moveSelectedObjectBy(0, 1);
      } else {
        this.state.moveCursor(0, 1);
      }
      this.requestRender();
      return true;
    }

    if (name === "left") {
      key.preventDefault();
      if (this.state.hasSelectedObject && !this.state.isEditingText) {
        this.state.moveSelectedObjectBy(-1, 0);
      } else {
        this.state.moveCursor(-1, 0);
      }
      this.requestRender();
      return true;
    }

    if (name === "right") {
      key.preventDefault();
      if (this.state.hasSelectedObject && !this.state.isEditingText) {
        this.state.moveSelectedObjectBy(1, 0);
      } else {
        this.state.moveCursor(1, 0);
      }
      this.requestRender();
      return true;
    }

    if (this.state.currentMode === "box") {
      if (key.raw === "[") {
        key.preventDefault();
        this.state.cycleBoxStyle(-1);
        this.requestRender();
        return true;
      }

      if (key.raw === "]") {
        key.preventDefault();
        this.state.cycleBoxStyle(1);
        this.requestRender();
        return true;
      }
    }

    if (this.state.currentMode === "line" || this.state.currentMode === "paint") {
      if (key.raw === "[") {
        key.preventDefault();
        this.state.cycleBrush(-1);
        this.requestRender();
        return true;
      }

      if (key.raw === "]") {
        key.preventDefault();
        this.state.cycleBrush(1);
        this.requestRender();
        return true;
      }

      if (name === "space") {
        key.preventDefault();
        this.state.stampBrushAtCursor();
        this.requestRender();
        return true;
      }

      if (name === "backspace" || name === "delete") {
        key.preventDefault();
        this.state.eraseAtCursor();
        this.requestRender();
        return true;
      }

      if (isPrintableKey(key)) {
        key.preventDefault();
        this.state.setBrush(key.raw);
        this.requestRender();
        return true;
      }

      return false;
    }

    if (this.state.currentMode === "text") {
      if (name === "backspace") {
        key.preventDefault();
        this.state.backspace();
        this.requestRender();
        return true;
      }

      if (name === "delete") {
        key.preventDefault();
        this.state.deleteAtCursor();
        this.requestRender();
        return true;
      }

      if (name === "space") {
        key.preventDefault();
        this.state.insertCharacter(" ");
        this.requestRender();
        return true;
      }

      if (isPrintableKey(key)) {
        key.preventDefault();
        this.state.insertCharacter(key.raw);
        this.requestRender();
        return true;
      }
    }

    return false;
  }

  private dismissStartupLogo(): void {
    if (!this.startupLogoEnabled || this.startupLogoDismissed) return;
    this.startupLogoDismissed = true;
    this.requestRender();
  }

  private syncCanvasLayout(): AppLayout {
    const layout = this.getLayout();
    this.state.ensureCanvasSize(layout.canvasViewWidth, this.height);
    return layout;
  }

  private getLayout(): AppLayout {
    const footerY = this.height - 2;
    const bodyTop = 3;
    const bodyBottom = this.height - 3;
    const dividerX = this.width - TOOL_PALETTE_WIDTH - 2;

    return {
      dividerX,
      paletteLeft: dividerX + 1,
      paletteWidth: this.width - dividerX - 2,
      bodyTop,
      bodyBottom,
      footerY,
      canvasViewWidth: this.width - TOOL_PALETTE_WIDTH - 1,
    };
  }

  private getPaletteButtonLeft(layout: AppLayout): number {
    return layout.paletteLeft + 1;
  }

  private getToolButtons(layout: AppLayout): ToolButton[] {
    const buttonLeft = this.getPaletteButtonLeft(layout);
    const firstTop = layout.bodyTop;
    const lineTop = firstTop + TOOL_BUTTON_HEIGHT + BOX_STYLE_ROW_COUNT;
    const paintTop = lineTop + TOOL_BUTTON_HEIGHT;
    const textTop = paintTop + TOOL_BUTTON_HEIGHT;

    return [
      {
        mode: "box",
        left: buttonLeft,
        top: firstTop,
        width: TOOL_BUTTON_WIDTH,
        height: TOOL_BUTTON_HEIGHT,
        icon: "▣",
        label: "Box",
        color: COLORS.warning,
      },
      {
        mode: "line",
        left: buttonLeft,
        top: lineTop,
        width: TOOL_BUTTON_WIDTH,
        height: TOOL_BUTTON_HEIGHT,
        icon: "╱",
        label: "Line",
        color: COLORS.accent,
      },
      {
        mode: "paint",
        left: buttonLeft,
        top: paintTop,
        width: TOOL_BUTTON_WIDTH,
        height: TOOL_BUTTON_HEIGHT,
        icon: "▒",
        label: "Paint",
        color: COLORS.paint,
      },
      {
        mode: "text",
        left: buttonLeft,
        top: textTop,
        width: TOOL_BUTTON_WIDTH,
        height: TOOL_BUTTON_HEIGHT,
        icon: "T",
        label: "Text",
        color: COLORS.success,
      },
    ];
  }

  private getBoxStyleButtons(layout: AppLayout): BoxStyleButton[] {
    const buttonLeft = this.getPaletteButtonLeft(layout);
    const firstTop = layout.bodyTop;
    const stylesTop = firstTop + TOOL_BUTTON_HEIGHT;

    return BOX_STYLE_OPTIONS.map((option, index) => ({
      style: option.style,
      left: buttonLeft,
      top: stylesTop + index,
      width: BOX_STYLE_BUTTON_WIDTH,
      sample: option.sample,
      label: option.label,
    }));
  }

  private getColorSwatches(layout: AppLayout): ColorSwatch[] {
    const buttonLeft = this.getPaletteButtonLeft(layout);
    const firstTop = layout.bodyTop;
    const lineTop = firstTop + TOOL_BUTTON_HEIGHT + BOX_STYLE_ROW_COUNT;
    const paintTop = lineTop + TOOL_BUTTON_HEIGHT;
    const textTop = paintTop + TOOL_BUTTON_HEIGHT;
    const colorTop = textTop + TOOL_BUTTON_HEIGHT + 1;

    return INK_COLORS.map((color, index) => ({
      color,
      left: buttonLeft + (index % COLOR_SWATCH_COLUMNS) * COLOR_SWATCH_WIDTH,
      top: colorTop + Math.floor(index / COLOR_SWATCH_COLUMNS),
      width: COLOR_SWATCH_WIDTH,
    }));
  }

  private isCanvasChromeEvent(x: number, y: number, layout: AppLayout): boolean {
    return (
      x >= this.state.canvasLeftCol &&
      x <= layout.dividerX - 1 &&
      y >= this.state.canvasTopRow &&
      y <= layout.bodyBottom
    );
  }

  private drawTooSmallMessage(): void {
    const width = this.width;
    const height = this.height;
    const lines = [
      "Terminal too small for termDRAW!.",
      `Need at least ${MIN_WIDTH}x${MIN_HEIGHT}.`,
      "Resize and try again.",
    ];

    const startY = Math.max(0, Math.floor(height / 2) - 1);
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index]!;
      const x = Math.max(0, Math.floor((width - visibleCellCount(text)) / 2));
      this.frameBuffer.drawText(
        text,
        x,
        startY + index,
        COLORS.warning,
        COLORS.panel,
        TextAttributes.BOLD,
      );
    }
  }

  private drawChrome(layout: AppLayout): void {
    this.drawHorizontalBorder(0, "╭", "╮");
    this.drawHorizontalBorder(this.height - 1, "╰", "╯");

    for (let y = 1; y < this.height - 1; y += 1) {
      this.drawOuterSideBorders(y);
    }

    for (let y = 1; y <= layout.bodyBottom; y += 1) {
      this.frameBuffer.setCell(layout.dividerX, y, "│", COLORS.border, COLORS.panel);
    }

    this.drawHeaderRow(layout);
    this.drawHeaderDivider(layout);
    this.drawFooterRow(layout);
  }

  private drawHeaderRow(layout: AppLayout): void {
    const y = 1;
    const canvasHeaderWidth = Math.max(1, layout.dividerX - 1);
    const paletteWidth = Math.max(1, this.width - layout.dividerX - 2);

    this.frameBuffer.drawText(" ".repeat(canvasHeaderWidth), 1, y, COLORS.text, COLORS.panel);
    this.frameBuffer.drawText(
      " ".repeat(paletteWidth),
      layout.dividerX + 1,
      y,
      COLORS.text,
      COLORS.panel,
    );

    let x = 1;
    x = drawSegment(
      this.frameBuffer,
      x,
      y,
      "termDRAW!",
      COLORS.accent,
      COLORS.panel,
      TextAttributes.BOLD,
    );
    x = drawSegment(this.frameBuffer, x, y, "  tool:", COLORS.dim, COLORS.panel);

    const modeLabel = this.state.getModeLabel();
    const modeColor =
      this.state.currentMode === "line"
        ? COLORS.accent
        : this.state.currentMode === "box"
          ? COLORS.warning
          : this.state.currentMode === "paint"
            ? COLORS.paint
            : COLORS.success;
    x = drawSegment(
      this.frameBuffer,
      x,
      y,
      modeLabel,
      modeColor,
      COLORS.panel,
      TextAttributes.BOLD,
    );

    if (this.state.currentMode === "line" || this.state.currentMode === "paint") {
      x = drawSegment(this.frameBuffer, x, y, "  brush:", COLORS.dim, COLORS.panel);
      x = drawSegment(
        this.frameBuffer,
        x,
        y,
        `"${this.state.currentBrush}"`,
        this.state.currentMode === "paint" ? COLORS.paint : COLORS.accent,
        COLORS.panel,
      );
    } else if (this.state.currentMode === "box") {
      const boxStyle =
        BOX_STYLE_OPTIONS.find((option) => option.style === this.state.currentBoxStyle) ??
        BOX_STYLE_OPTIONS[0]!;
      x = drawSegment(this.frameBuffer, x, y, "  style:", COLORS.dim, COLORS.panel);
      x = drawSegment(
        this.frameBuffer,
        x,
        y,
        `${boxStyle.sample} ${boxStyle.label}`,
        COLORS.warning,
        COLORS.panel,
      );
    }

    x = drawSegment(this.frameBuffer, x, y, "  color:", COLORS.dim, COLORS.panel);
    drawSegment(
      this.frameBuffer,
      x,
      y,
      "●",
      getInkColorValue(this.state.currentInkColor),
      COLORS.panel,
      TextAttributes.BOLD,
    );

    const paletteTitle = padToWidth("Tools", paletteWidth);
    this.frameBuffer.drawText(
      paletteTitle,
      layout.dividerX + 1,
      y,
      COLORS.dim,
      COLORS.panel,
      TextAttributes.BOLD,
    );
  }

  private drawHeaderDivider(layout: AppLayout): void {
    const y = 2;
    this.frameBuffer.setCell(0, y, "├", COLORS.border, COLORS.panel);
    for (let x = 1; x < this.width - 1; x += 1) {
      this.frameBuffer.setCell(x, y, "─", COLORS.border, COLORS.panel);
    }
    this.frameBuffer.setCell(layout.dividerX, y, "┼", COLORS.border, COLORS.panel);
    this.frameBuffer.setCell(this.width - 1, y, "┤", COLORS.border, COLORS.panel);
  }

  private drawFooterRow(layout: AppLayout): void {
    const text =
      "Right palette tools/styles/colors • click objects to move • drag box corners / line endpoints to edit • Esc deselect • Ctrl+Q quit";
    const combined = `${text}  ${this.state.currentStatus}`;
    const padded = padToWidth(combined, Math.max(1, this.width - 2));
    this.frameBuffer.drawText(padded, 1, layout.footerY, COLORS.dim, COLORS.panel);
  }

  private drawToolPalette(layout: AppLayout): void {
    const paletteWidth = Math.max(1, this.width - layout.dividerX - 2);
    const paletteX = layout.dividerX + 1;

    for (let y = layout.bodyTop; y <= layout.bodyBottom; y += 1) {
      this.frameBuffer.drawText(" ".repeat(paletteWidth), paletteX, y, COLORS.text, COLORS.panel);
    }

    for (const button of this.getToolButtons(layout)) {
      this.drawToolButton(button);
    }

    for (const button of this.getBoxStyleButtons(layout)) {
      this.drawBoxStyleButton(button);
    }

    this.drawColorPicker(layout);
  }

  private drawToolButton(button: ToolButton): void {
    const isActive = this.state.currentMode === button.mode;
    const fg = isActive ? COLORS.panel : button.color;
    const bg = isActive ? button.color : COLORS.panel;
    const borderColor = isActive ? button.color : COLORS.border;

    this.frameBuffer.drawText(
      `┌${"─".repeat(button.width - 2)}┐`,
      button.left,
      button.top,
      borderColor,
      COLORS.panel,
      TextAttributes.BOLD,
    );

    const label = padToWidth(` ${button.icon} ${button.label} `, button.width - 2);
    this.frameBuffer.drawText(
      "│",
      button.left,
      button.top + 1,
      borderColor,
      COLORS.panel,
      TextAttributes.BOLD,
    );
    this.frameBuffer.drawText(label, button.left + 1, button.top + 1, fg, bg, TextAttributes.BOLD);
    this.frameBuffer.drawText(
      "│",
      button.left + button.width - 1,
      button.top + 1,
      borderColor,
      COLORS.panel,
      TextAttributes.BOLD,
    );

    this.frameBuffer.drawText(
      `└${"─".repeat(button.width - 2)}┘`,
      button.left,
      button.top + 2,
      borderColor,
      COLORS.panel,
      TextAttributes.BOLD,
    );
  }

  private drawBoxStyleButton(button: BoxStyleButton): void {
    const isActive = this.state.currentBoxStyle === button.style;
    const fg = isActive ? COLORS.panel : COLORS.text;
    const bg = isActive ? COLORS.warning : COLORS.panel;
    const text = padToWidth(`${button.sample} ${button.label}`, button.width);
    this.frameBuffer.drawText(
      text,
      button.left,
      button.top,
      fg,
      bg,
      isActive ? TextAttributes.BOLD : TextAttributes.NONE,
    );
  }

  private drawColorPicker(layout: AppLayout): void {
    const buttonLeft = this.getPaletteButtonLeft(layout);
    const firstTop = layout.bodyTop;
    const lineTop = firstTop + TOOL_BUTTON_HEIGHT + BOX_STYLE_ROW_COUNT;
    const paintTop = lineTop + TOOL_BUTTON_HEIGHT;
    const textTop = paintTop + TOOL_BUTTON_HEIGHT;
    const colorLabelTop = textTop + TOOL_BUTTON_HEIGHT;

    this.frameBuffer.drawText("Color", buttonLeft, colorLabelTop, COLORS.dim, COLORS.panel);

    for (const swatch of this.getColorSwatches(layout)) {
      this.drawColorSwatch(swatch);
    }
  }

  private drawColorSwatch(swatch: ColorSwatch): void {
    const isActive = this.state.currentInkColor === swatch.color;
    const bg = getInkColorValue(swatch.color);
    const fg = getInkColorContrast(swatch.color);
    const text = isActive ? " • " : "   ";
    this.frameBuffer.drawText(
      text,
      swatch.left,
      swatch.top,
      fg,
      bg,
      isActive ? TextAttributes.BOLD : TextAttributes.NONE,
    );
  }

  private drawCanvas(): void {
    const preview = this.state.getActivePreviewCharacters();
    const selectedCells = this.state.getSelectedCellKeys();
    const handleChars = this.state.getSelectionHandleCharacters();

    for (let y = 0; y < this.state.height; y += 1) {
      const rowY = this.state.canvasTopRow + y;

      for (let x = 0; x < this.state.width; x += 1) {
        const key = `${x},${y}`;
        const handleChar = handleChars.get(key);
        const previewChar = preview.get(key);
        const cell = handleChar ?? previewChar ?? this.state.getCompositeCell(x, y);
        const cellColor = this.state.getCompositeColor(x, y);
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
                ? getInkColorValue(this.state.currentInkColor)
                : cellColor
                  ? getInkColorValue(cellColor)
                  : COLORS.text;
        const bg = isCursor
          ? COLORS.cursorBg
          : isHandle
            ? COLORS.handleBg
            : isSelected
              ? COLORS.selectionBg
              : COLORS.panel;
        const attributes =
          isCursor || isSelected || isHandle ? TextAttributes.BOLD : TextAttributes.NONE;
        this.frameBuffer.setCell(x + this.state.canvasLeftCol, rowY, cell, fg, bg, attributes);
      }
    }
  }

  private drawStartupLogo(layout: AppLayout): void {
    if (!this.startupLogoEnabled || this.startupLogoDismissed) return;

    const logoWidth = Math.max(...STARTUP_LOGO_LINES.map((line) => visibleCellCount(line)));
    const logoHeight = STARTUP_LOGO_LINES.length;
    const captionWidth = visibleCellCount(STARTUP_LOGO_CAPTION);
    const availableWidth = layout.dividerX - this.state.canvasLeftCol;
    const availableHeight = layout.bodyBottom - this.state.canvasTopRow + 1;
    const showCaption = availableWidth >= captionWidth && availableHeight >= logoHeight + 2;
    const overlayHeight = showCaption ? logoHeight + 2 : logoHeight;

    if (availableWidth < logoWidth || availableHeight < overlayHeight) {
      return;
    }

    const startY = this.state.canvasTopRow + Math.floor((availableHeight - overlayHeight) / 2);

    for (const [rowIndex, line] of STARTUP_LOGO_LINES.entries()) {
      const y = startY + rowIndex;
      const lineWidth = visibleCellCount(line);
      const startX = this.state.canvasLeftCol + Math.floor((availableWidth - lineWidth) / 2);
      for (const [colIndex, char] of Array.from(line).entries()) {
        if (char === " ") continue;
        const x = startX + colIndex;
        const fg = getStartupLogoColor(rowIndex, colIndex, line.length);
        const attributes = rowIndex >= 2 ? TextAttributes.BOLD : TextAttributes.NONE;
        this.frameBuffer.setCell(x, y, char, fg, COLORS.panel, attributes);
      }
    }

    if (showCaption) {
      const captionY = startY + logoHeight + 1;
      const captionX = this.state.canvasLeftCol + Math.floor((availableWidth - captionWidth) / 2);
      this.frameBuffer.drawText(
        STARTUP_LOGO_CAPTION,
        captionX,
        captionY,
        getStartupLogoCaptionColor(),
        COLORS.panel,
        TextAttributes.DIM,
      );
    }
  }

  private drawOuterSideBorders(y: number): void {
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

export function buildHelpText(binaryName = "termdraw"): string {
  return truncateToCells(
    `${binaryName} [--output file] [--fenced|--plain]\n\n` +
      `Controls:\n` +
      `  right palette   click Box / Line / Paint / Text, box styles, and colors\n` +
      `  Ctrl+T / Tab    cycle box / line / paint / text\n` +
      `  click objects   select and move them\n` +
      `  drag handles    resize boxes / adjust line endpoints\n` +
      `  selected text   shows a virtual selection box\n` +
      `  Delete          remove selected object\n` +
      `  Esc             deselect\n` +
      `  Ctrl+Q          quit\n` +
      `  Ctrl+Z / Ctrl+Y undo / redo\n` +
      `  Ctrl+X          clear canvas\n` +
      `  [ / ]           cycle box style or paint/line brush\n` +
      `  mouse wheel     cycle box style or paint/line brush\n` +
      `  Space           stamp brush in paint/line mode / insert space in text mode\n` +
      `  Enter / Ctrl+S  save\n\n` +
      `Options:\n` +
      `  -o, --output <file>  write the result to a file\n` +
      `  --fenced            output as a fenced markdown code block\n` +
      `  --plain             output plain text (default)\n` +
      `  -h, --help          show this help\n`,
    4000,
  );
}
