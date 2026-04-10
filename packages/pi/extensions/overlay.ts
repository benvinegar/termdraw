import type { ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@mariozechner/pi-tui";
import {
  createPiTuiOpenTuiSurface,
  disablePiTuiMouseMode,
  enablePiTuiMouseMode,
  type PiTuiOpenTuiSurface,
} from "opentui-island/pi-tui";

const TERM_DRAW_ISLAND_MODULE_URL = new URL("../islands/termdraw.island.tsx", import.meta.url);
const READY_STATUS =
  "Prototype embed active. Draw/edit works here; Enter and Ctrl+S are placeholder-only until save bridging lands. Ctrl+Q closes.";
const SAVE_PENDING_STATUS =
  "Save/export result passing is not wired yet. The Pi overlay can host termDRAW now, but returning art to Pi will come in a follow-up bridge.";
const LOADING_STATUS = "Starting termDRAW in a Bun sidecar…";
const CLOSED_MESSAGE = "Closed termDRAW overlay.";
const ERROR_PREFIX = "termDRAW failed to start:";

function padLine(text: string, width: number): string {
  const truncated = truncateToWidth(text, width, "", true);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function formatError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

class TermDrawOverlay implements Component {
  private readonly surfaceHeight: number;
  private readonly width: number;
  private surface: PiTuiOpenTuiSurface | null = null;
  private status = LOADING_STATUS;
  private error: string | null = null;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: (value: "closed") => void,
  ) {
    this.width = Math.max(1, this.tui.terminal.columns);
    this.surfaceHeight = Math.max(1, this.tui.terminal.rows - 1);
    enablePiTuiMouseMode(this.tui.terminal);
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.surface = await createPiTuiOpenTuiSurface({
        height: this.surfaceHeight,
        initialWidth: this.width,
        requestRender: () => this.tui.requestRender(),
        island: {
          module: TERM_DRAW_ISLAND_MODULE_URL,
          props: {
            showStartupLogo: false,
          },
        },
      });
      this.surface.focused = true;
      this.surface.setScreenBounds({
        row: 0,
        col: 0,
        width: this.width,
        height: this.surfaceHeight,
      });
      await this.surface.sync(this.width);
      this.status = READY_STATUS;
    } catch (error) {
      this.error = formatError(error);
      this.status = `${ERROR_PREFIX} ${this.error}`;
    }

    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, "ctrl+q")) {
      void this.close();
      return;
    }

    if (matchesKey(data, "enter") || matchesKey(data, "ctrl+s")) {
      this.status = SAVE_PENDING_STATUS;
      this.tui.requestRender();
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

      return [...body, padLine(this.theme.fg("warning", "Ctrl+Q closes."), normalizedWidth)];
    }

    if (!this.surface) {
      const body = Array.from({ length: Math.max(1, this.surfaceHeight) }, (_, index) =>
        index === 0
          ? padLine(this.theme.fg("accent", LOADING_STATUS), normalizedWidth)
          : " ".repeat(normalizedWidth),
      );

      return [...body, padLine(this.theme.fg("dim", "Ctrl+Q closes."), normalizedWidth)];
    }

    const body = this.surface.render(normalizedWidth).slice(0, this.surfaceHeight);
    const footer = padLine(this.theme.fg("dim", this.status), normalizedWidth);
    return [...body, footer];
  }

  private async close(): Promise<void> {
    try {
      await this.surface?.destroy();
    } finally {
      disablePiTuiMouseMode(this.tui.terminal);
      this.done("closed");
    }
  }
}

export async function runTermDrawCommand(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) {
    return;
  }

  await ctx.ui.custom<"closed">(
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

  ctx.ui.notify(CLOSED_MESSAGE, "info");
}
