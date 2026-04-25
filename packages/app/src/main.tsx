import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { buildHelpText, formatSavedOutput, TermDrawApp } from "../../opentui/src/index.js";
import { compileDiagramSource } from "./compile.js";

export interface CliOptions {
  command: "draw" | "compile";
  inputPath?: string;
  outputPath?: string;
  fenced: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "draw",
    fenced: false,
    help: false,
  };

  if (argv[0] === "compile") {
    options.command = "compile";
    argv = argv.slice(1);
  }

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

    if (
      options.command === "compile" &&
      (arg === "-" || !arg.startsWith("-")) &&
      options.inputPath === undefined
    ) {
      options.inputPath = arg;
      continue;
    }

    if (options.command === "compile" && (arg === "-" || !arg.startsWith("-"))) {
      throw new Error(`Unexpected input path: ${arg}`);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function withTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function buildTermDrawCliHelp(): string {
  return (
    buildHelpText("termdraw") +
    `\nCommands:\n` +
    `  compile [input|-]     render a JSONC diagram document to terminal text\n`
  );
}

export function buildCompileHelpText(): string {
  return (
    `termdraw compile [input|-] [--output file] [--fenced|--plain]\n\n` +
    `Renders a JSONC diagram document through termDRAW's retained drawing model.\n\n` +
    `Arguments:\n` +
    `  input                 JSONC diagram file. Use - or omit to read stdin.\n\n` +
    `Options:\n` +
    `  -o, --output <file>   write the rendered diagram to a file\n` +
    `  --fenced             output as a fenced markdown code block\n` +
    `  --plain              output plain text (default)\n` +
    `  -h, --help           show this help\n`
  );
}

async function readCompileInput(inputPath: string | undefined): Promise<string> {
  if (inputPath === undefined || inputPath === "-") {
    return Bun.stdin.text();
  }

  return Bun.file(inputPath).text();
}

async function runCompileCli(options: CliOptions): Promise<void> {
  if (options.help) {
    process.stdout.write(buildCompileHelpText());
    return;
  }

  const source = await readCompileInput(options.inputPath);
  const output = withTrailingNewline(compileDiagramSource(source, { fenced: options.fenced }));

  if (options.outputPath) {
    await Bun.write(options.outputPath, output);
    process.stderr.write(`Rendered diagram to ${options.outputPath}\n`);
    return;
  }

  process.stdout.write(output);
}

export async function runTermDrawAppCli(argv = Bun.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);

  if (options.command === "compile") {
    await runCompileCli(options);
    return;
  }

  if (options.help) {
    process.stdout.write(buildTermDrawCliHelp());
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
