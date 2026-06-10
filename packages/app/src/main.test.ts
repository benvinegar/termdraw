import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, test } from "bun:test";
import { version as appVersion } from "../package.json";
import { DRAW_DOCUMENT_VERSION } from "../../opentui/src/index";
import {
  buildCliHelpText,
  getInteractiveStdin,
  loadDiagramInput,
  parseArgs,
  readTextFromStdin,
  runTermDrawAppCli,
  shouldUseInteractiveTtyInput,
} from "./main";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseArgs accepts --load alongside existing output options", () => {
  expect(parseArgs(["--load", "drawing.td.json", "--fenced", "--output", "art.txt"])).toEqual({
    clipboard: false,
    diagramPath: "drawing.td.json",
    fenced: true,
    help: false,
    outputPath: "art.txt",
    version: false,
  });
});

test("parseArgs accepts --version and -v", () => {
  expect(parseArgs(["--version"])).toEqual({
    clipboard: false,
    fenced: false,
    help: false,
    version: true,
  });

  expect(parseArgs(["-v"])).toEqual({
    clipboard: false,
    fenced: false,
    help: false,
    version: true,
  });
});

test("parseArgs accepts --clipboard and -c", () => {
  expect(parseArgs(["--clipboard"])).toEqual({
    clipboard: true,
    fenced: false,
    help: false,
    version: false,
  });

  expect(parseArgs(["-c"])).toEqual({
    clipboard: true,
    fenced: false,
    help: false,
    version: false,
  });
});

test("parseArgs keeps the last output formatting flag", () => {
  expect(parseArgs(["--fenced", "--plain"])).toEqual({
    clipboard: false,
    fenced: false,
    help: false,
    version: false,
  });

  expect(parseArgs(["--plain", "--fenced"])).toEqual({
    clipboard: false,
    fenced: true,
    help: false,
    version: false,
  });
});

test("parseArgs rejects missing output values and unknown args", () => {
  expect(() => parseArgs(["--output"])).toThrow("Missing value for --output");
  expect(() => parseArgs(["--wat"])).toThrow("Unknown argument: --wat");
});

test("buildCliHelpText only shows CLI options", () => {
  const help = buildCliHelpText();

  expect(help).toContain("--load");
  expect(help).toContain("--clipboard");
  expect(help).toContain("--version");
  expect(help).toContain("--output");
  expect(help).not.toContain("Controls:");
  expect(help).not.toContain("right palette");
  expect(help).not.toContain("Ctrl+T / Tab");
});

test("runTermDrawAppCli prints help without starting the renderer", async () => {
  const stdoutWrites: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  try {
    await runTermDrawAppCli(["--help"]);
  } finally {
    process.stdout.write = originalWrite;
  }

  expect(stdoutWrites.join("")).toBe(buildCliHelpText("termdraw"));
});

test("runTermDrawAppCli prints the current version", async () => {
  const stdoutWrites: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  try {
    await runTermDrawAppCli(["--version"]);
  } finally {
    process.stdout.write = originalWrite;
  }

  expect(stdoutWrites.join("")).toBe(`${appVersion}\n`);
});

test("loadDiagramInput reads and parses a diagram file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "termdraw-app-test-"));
  tempDirs.push(dir);
  const path = join(dir, "diagram.td.json");
  await Bun.write(
    path,
    JSON.stringify({
      version: DRAW_DOCUMENT_VERSION,
      objects: [],
    }),
  );

  await expect(loadDiagramInput(path)).resolves.toEqual({
    version: DRAW_DOCUMENT_VERSION,
    objects: [],
  });
});

test("loadDiagramInput reads stdin when --load - is used", async () => {
  await expect(
    loadDiagramInput("-", async () =>
      JSON.stringify({
        version: DRAW_DOCUMENT_VERSION,
        objects: [],
      }),
    ),
  ).resolves.toEqual({
    version: DRAW_DOCUMENT_VERSION,
    objects: [],
  });
});

test("readTextFromStdin drains and pauses stdin", async () => {
  const stdin = new PassThrough();
  let paused = false;

  Reflect.set(stdin, "isTTY", false);
  Reflect.set(stdin, "pause", () => {
    paused = true;
    return stdin;
  });

  stdin.end(
    JSON.stringify({
      version: DRAW_DOCUMENT_VERSION,
      objects: [],
    }),
  );

  await expect(readTextFromStdin(stdin)).resolves.toContain('"version"');
  expect(paused).toBe(true);
});

test("shouldUseInteractiveTtyInput only swaps stdin for piped load input", () => {
  expect(shouldUseInteractiveTtyInput("-", { isTTY: false })).toBe(true);
  expect(shouldUseInteractiveTtyInput("-", { isTTY: true })).toBe(false);
  expect(shouldUseInteractiveTtyInput("diagram.td.json", { isTTY: false })).toBe(false);
});

test("getInteractiveStdin surfaces a clear error without a controlling terminal", () => {
  const ttyError = new Error("ENXIO: no such device or address, open '/dev/tty'");

  expect(() =>
    getInteractiveStdin("-", { isTTY: false }, () => {
      throw ttyError;
    }),
  ).toThrow(
    "Interactive editing from stdin requires a controlling terminal. Use --load <file> instead.",
  );
});

test("loadDiagramInput surfaces clear parse errors", async () => {
  await expect(loadDiagramInput("-", async () => '{"version":999,"objects":[]}')).rejects.toThrow(
    `Failed to load diagram from stdin: termDRAW document version must be ${DRAW_DOCUMENT_VERSION}`,
  );
});

test("with --output parseArgs records the destination path", () => {
  expect(parseArgs(["--output", "diagram.txt"])).toEqual({
    clipboard: false,
    outputPath: "diagram.txt",
    fenced: false,
    help: false,
    version: false,
  });
});

test("help text can be written to a file-like destination path via normal parsing", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "termdraw-main-test-"));
  const outputPath = join(tempDir, "diagram.txt");

  try {
    expect(parseArgs(["--output", outputPath])).toEqual({
      clipboard: false,
      outputPath,
      fenced: false,
      help: false,
      version: false,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
