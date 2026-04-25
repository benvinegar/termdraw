import { describe, expect, test } from "bun:test";
import { buildCompileHelpText, parseArgs } from "./main.js";

describe("app CLI args", () => {
  test("keeps interactive mode as the default", () => {
    expect(parseArgs([])).toEqual({
      command: "draw",
      fenced: false,
      help: false,
    });

    expect(parseArgs(["--fenced", "--output", "diagram.md"])).toEqual({
      command: "draw",
      fenced: true,
      help: false,
      outputPath: "diagram.md",
    });
  });

  test("parses compile mode with file, stdin, output, and fenced options", () => {
    expect(parseArgs(["compile", "diagram.jsonc", "--fenced", "--output", "out.md"])).toEqual({
      command: "compile",
      inputPath: "diagram.jsonc",
      fenced: true,
      help: false,
      outputPath: "out.md",
    });

    expect(parseArgs(["compile", "-"])).toEqual({
      command: "compile",
      inputPath: "-",
      fenced: false,
      help: false,
    });
  });

  test("rejects extra compile input paths", () => {
    expect(() => parseArgs(["compile", "one.jsonc", "two.jsonc"])).toThrow(
      "Unexpected input path: two.jsonc",
    );
  });

  test("documents compile usage", () => {
    expect(buildCompileHelpText()).toContain("termdraw compile [input|-]");
  });
});
