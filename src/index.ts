import { createCliRenderer } from "@opentui/core";
import { OpenTuiDrawApp, attachResize, buildHelpText, formatSavedOutput } from "./app";

interface CliOptions {
  outputPath?: string;
  fenced: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
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

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));

  if (options.help) {
    process.stdout.write(buildHelpText("bun run index.ts --"));
    return;
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: true,
    enableMouseMovement: true,
    autoFocus: true,
    screenMode: "alternate-screen",
  });

  let cleanupResize = () => {};
  let finished = false;

  const finish = async (art: string | null): Promise<void> => {
    if (finished) return;
    finished = true;

    cleanupResize();
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

  const app = new OpenTuiDrawApp(renderer, (art) => {
    void finish(art);
  });

  cleanupResize = attachResize(renderer, app);
  renderer.root.add(app);
  renderer.requestRender();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
