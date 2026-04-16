import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { buildHelpText, formatSavedOutput, TermDrawApp } from "@termdraw/opentui";

export interface CliOptions {
  outputPath?: string;
  fenced: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    fenced: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--fenced") {
      options.fenced = true;
      continue;
    }

    if (arg === "--plain") {
      options.fenced = false;
      continue;
    }

    if (arg === "-o" || arg === "--output") {
      const outputPath = argv[i + 1];
      if (!outputPath) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.outputPath = outputPath;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function withTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export async function runTermDrawAppCli(argv = Bun.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(buildHelpText("termdraw"));
    return;
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: true,
    enableMouseMovement: true,
    autoFocus: true,
    screenMode: "alternate-screen",
  });

  const root = createRoot(renderer);
  let finished = false;

  const finish = async (art: string | null): Promise<void> => {
    if (finished) return;
    finished = true;

    renderer.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));

    if (art === null) {
      process.stderr.write("Drawing cancelled.\n");
      process.exit(0);
    }

    const output = withTrailingNewline(formatSavedOutput(art, options.fenced));

    if (options.outputPath) {
      await Bun.write(options.outputPath, output);
      process.stderr.write(`Saved drawing to ${options.outputPath}\n`);
    } else {
      process.stdout.write(output);
    }

    process.exit(0);
  };

  root.render(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      cancelOnCtrlC
      onSave={(art: string) => {
        void finish(art);
      }}
      onCancel={() => {
        void finish(null);
      }}
    />,
  );
}
