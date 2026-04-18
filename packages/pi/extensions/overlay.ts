import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@mariozechner/pi-tui";
import type { OpenTuiBridgeEvent } from "opentui-island";
import {
  createPiTuiSurface,
  disablePiTuiMouseMode,
  enablePiTuiMouseMode,
  type PiTuiSurface,
} from "opentui-island/pi-tui";

const TERM_DRAW_ISLAND_MODULE_URL = new URL("../islands/termdraw.island.tsx", import.meta.url);
const PI_FOOTER_TEXT =
  "B Brush • A Select • U Box • P Line • T Text • Enter/Ctrl+S Insert • Ctrl+Q Cancel";
const READY_STATUS = "termDRAW ready. Press Enter or Ctrl+S to insert into Pi. Ctrl+Q cancels.";
const LOADING_STATUS = "Starting termDRAW in a Bun sidecar…";
const INSERTED_MESSAGE = "Inserted drawing into editor.";
const CANCELLED_MESSAGE = "Drawing cancelled.";
const ERROR_PREFIX = "termDRAW failed to start:";
const SMOKE_TEXT = process.env.PI_TERMDRAW_SMOKE_TEXT?.trim() ?? "";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type TermDrawSaveEvent = OpenTuiBridgeEvent<"save", { art: string }>;
type TermDrawCancelEvent = OpenTuiBridgeEvent<"cancel", { reason?: string }>;
type TermDrawOverlayResult = { kind: "save"; art: string } | { kind: "cancel" };

function isTermDrawSaveEvent(event: OpenTuiBridgeEvent): event is TermDrawSaveEvent {
  return (
    event.type === "save" &&
    !!event.payload &&
    typeof event.payload === "object" &&
    "art" in event.payload
  );
}

function isTermDrawCancelEvent(event: OpenTuiBridgeEvent): event is TermDrawCancelEvent {
  return event.type === "cancel";
}

function padLine(text: string, width: number): string {
  const truncated = truncateToWidth(text, width, "", true);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function formatError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function formatForEditor(art: string): string {
  const content = art.length > 0 ? art : " ";
  return `\`\`\`text\n${content}\n\`\`\``;
}

class TermDrawOverlay implements Component {
  private readonly surfaceHeight: number;
  private readonly width: number;
  private readonly smokeText: string;
  private surface: PiTuiSurface | null = null;
  private unsubscribeFromEvents: (() => void) | null = null;
  private status = LOADING_STATUS;
  private error: string | null = null;
  private closing = false;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: (value: TermDrawOverlayResult) => void,
  ) {
    this.width = Math.max(1, this.tui.terminal.columns);
    this.surfaceHeight = Math.max(1, this.tui.terminal.rows - 1);
    this.smokeText = SMOKE_TEXT;
    enablePiTuiMouseMode(this.tui.terminal);
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.surface = await createPiTuiSurface({
        height: this.surfaceHeight,
        initialWidth: this.width,
        requestRender: () => this.tui.requestRender(),
        island: {
          module: TERM_DRAW_ISLAND_MODULE_URL,
          props: {
            showStartupLogo: false,
            footerText: PI_FOOTER_TEXT,
          },
        },
      });
      this.unsubscribeFromEvents = this.surface.onEvent((event) => {
        if (isTermDrawSaveEvent(event)) {
          void this.close({ kind: "save", art: event.payload.art });
          return;
        }

        if (isTermDrawCancelEvent(event)) {
          void this.close({ kind: "cancel" });
        }
      });
      this.surface.focused = true;
      this.surface.setScreenBounds({
        row: 0,
        col: 0,
        width: this.width,
        height: this.surfaceHeight,
      });
      await this.surface.sync(this.width);
      await this.surface.waitUntilReady();
      this.status = READY_STATUS;
      if (this.smokeText.length > 0) {
        void this.runSmokeAutomation();
      }
    } catch (error) {
      this.error = formatError(error);
      this.status = `${ERROR_PREFIX} ${this.error}`;
    }

    this.tui.requestRender();
  }

  private async runSmokeAutomation(): Promise<void> {
    if (!this.surface || this.closing) {
      return;
    }

    try {
      await delay(150);
      await this.surface.sendInput("\r");
    } catch (error) {
      this.status = `Smoke automation failed: ${formatError(error)}`;
      this.tui.requestRender();
    }
  }

  handleInput(data: string): void {
    if (
      this.error &&
      (matchesKey(data, "ctrl+q") || matchesKey(data, "escape") || matchesKey(data, "ctrl+c"))
    ) {
      void this.close({ kind: "cancel" });
      return;
    }

    this.surface?.handleInput(data);
    this.tui.requestRender();
  }

  invalidate(): void {
    this.surface?.invalidate();
  }

  render(width: number): string[] {
    const normalizedWidth = Math.max(1, width);

    this.surface?.setScreenBounds({
      row: 0,
      col: 0,
      width: normalizedWidth,
      height: this.surfaceHeight,
    });

    if (this.error) {
      const body = Array.from({ length: Math.max(1, this.surfaceHeight) }, (_, index) => {
        if (index === 0) {
          return padLine(this.theme.fg("error", `${ERROR_PREFIX} ${this.error}`), normalizedWidth);
        }
        if (index === 1) {
          return padLine(
            this.theme.fg("dim", "Make sure Bun 1.3+ is installed and available on PATH."),
            normalizedWidth,
          );
        }
        return " ".repeat(normalizedWidth);
      });

      return [
        ...body,
        padLine(this.theme.fg("warning", "Ctrl+Q, Esc, or Ctrl+C closes."), normalizedWidth),
      ];
    }

    if (!this.surface) {
      const body = Array.from({ length: Math.max(1, this.surfaceHeight) }, (_, index) =>
        index === 0
          ? padLine(this.theme.fg("accent", LOADING_STATUS), normalizedWidth)
          : " ".repeat(normalizedWidth),
      );

      return [...body, padLine(this.theme.fg("dim", "Loading termDRAW…"), normalizedWidth)];
    }

    const body = this.surface.render(normalizedWidth).slice(0, this.surfaceHeight);
    const footer = padLine(this.theme.fg("dim", this.status), normalizedWidth);
    return [...body, footer];
  }

  private async close(result: TermDrawOverlayResult): Promise<void> {
    if (this.closing) {
      return;
    }

    this.closing = true;
    try {
      this.unsubscribeFromEvents?.();
      this.unsubscribeFromEvents = null;
      await this.surface?.destroy();
    } finally {
      disablePiTuiMouseMode(this.tui.terminal);
      this.done(result);
    }
  }
}

export async function runTermDrawCommand(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) {
    return;
  }

  const result = await ctx.ui.custom<TermDrawOverlayResult>(
    (tui, theme, _keybindings, done) => new TermDrawOverlay(tui, theme, done),
    {
      overlay: true,
      overlayOptions: {
        row: 0,
        col: 0,
        width: "100%",
        maxHeight: "100%",
        margin: 0,
      },
    },
  );

  if (!result || result.kind === "cancel") {
    ctx.ui.notify(CANCELLED_MESSAGE, "info");
    return;
  }

  const existing = ctx.ui.getEditorText();
  const prefix = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
  ctx.ui.pasteToEditor(`${prefix}${formatForEditor(result.art)}\n`);
  ctx.ui.notify(INSERTED_MESSAGE, "info");
}
