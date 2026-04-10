import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { runTermDrawCommand } from "./overlay.ts";

export default function piTermDrawExtension(pi: ExtensionAPI) {
  pi.registerCommand("termdraw", {
    description: "Open termDRAW inside a Pi overlay",
    handler: async (_args, ctx) => {
      await runTermDrawCommand(ctx);
    },
  });
}
