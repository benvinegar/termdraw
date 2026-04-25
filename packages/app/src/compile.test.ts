import { describe, expect, test } from "bun:test";
import { compileDiagramSource, renderDiagramSource } from "./compile.js";

describe("diagram compiler", () => {
  test("renders boxes, lines, paint, text, markers, and fenced output", () => {
    const source = `{
      // JSONC comments and trailing commas are accepted.
      "version": 1,
      "size": [24, 10],
      "objects": [
        { "type": "box", "id": "outer", "rect": [0, 0, 10, 4], "style": "light", "text": "App" },
        { "type": "line", "from": [11, 2], "to": [17, 2], "style": "light", "marker": ">" },
        { "type": "text", "at": [18, 1], "text": "Core", "border": "single" },
        { "type": "paint", "brush": "*", "points": [[2, 6], [3, 6], [4, 6]] },
      ],
    }`;

    const art = renderDiagramSource(source);

    expect(art).toContain("┌─────────┐");
    expect(art).toContain("│ App");
    expect(art).toContain("──────>");
    expect(art).toContain("┌────┐");
    expect(art).toContain("***");
    expect(compileDiagramSource(source, { fenced: true })).toStartWith("```text\n");
  });

  test("rejects malformed documents with actionable paths", () => {
    expect(() =>
      renderDiagramSource(`{
        "version": 1,
        "size": [4, 4],
        "objects": [
          { "type": "box", "rect": [0, 0, 8, 1], "style": "light" }
        ]
      }`),
    ).toThrow("$.objects[0].rect[2..3]: point 8,1 is outside 4x4");

    expect(() =>
      renderDiagramSource(`{
        "version": 1,
        "size": [4, 4],
        "objects": [
          { "type": "box", "id": "same", "rect": [0, 0, 1, 1] },
          { "type": "text", "id": "same", "at": [0, 2], "text": "x" }
        ]
      }`),
    ).toThrow('$.objects[1].id: duplicate id "same"');
  });
});
