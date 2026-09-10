import { expect, test } from "bun:test";
import { DRAW_DOCUMENT_VERSION, type DrawDocument } from "../draw-state";
import { getDrawSceneCell, projectDrawCanvas, projectDrawScene } from "./projection";

const document: DrawDocument = {
  version: DRAW_DOCUMENT_VERSION,
  objects: [
    {
      id: "obj-1",
      type: "box",
      z: 1,
      parentId: null,
      color: "cyan",
      left: 1,
      top: 1,
      right: 4,
      bottom: 3,
      style: "light",
    },
    {
      id: "obj-2",
      type: "text",
      z: 2,
      parentId: "obj-1",
      color: "yellow",
      x: 2,
      y: 2,
      content: "A",
      border: "none",
    },
  ],
};

test("projectDrawScene is deterministic and does not mutate its document input", () => {
  const before = JSON.stringify(document);
  const first = projectDrawScene(document.objects, 8, 6);
  const second = projectDrawScene(document.objects, 8, 6);

  expect(first).toEqual(second);
  expect(JSON.stringify(document)).toBe(before);
  expect(getDrawSceneCell(first, 1, 1)).toEqual({ character: "┌", inkColor: "cyan" });
  expect(getDrawSceneCell(first, 2, 2)).toEqual({ character: "A", inkColor: "yellow" });
});

test("projectDrawScene clips presentation without changing object coordinates", () => {
  const scene = projectDrawScene(document.objects, 3, 3);

  expect(getDrawSceneCell(scene, 1, 1).character).toBe("┌");
  expect(document.objects[0]?.type === "box" ? document.objects[0].right : null).toBe(4);
});

test("projectDrawCanvas applies overlay precedence without mutating the scene", () => {
  const scene = projectDrawScene(document.objects, 8, 6);
  const before = JSON.stringify(scene);
  const projection = projectDrawCanvas({
    scene,
    viewport: { width: 8, height: 6, left: 0, top: 0 },
    preview: new Map([["2,2", "P"]]),
    previewInkColor: "magenta",
    selectedCells: new Set(["2,2", "5,5"]),
    marquee: new Map([["2,2", "M"]]),
    handles: new Map([["2,2", "H"]]),
    cursor: { x: 2, y: 2 },
  });

  expect(projection.cells.get("2,2")).toEqual({
    character: "H",
    inkColor: null,
    kind: "cursor",
  });
  expect(projection.cells.get("5,5")).toEqual({
    character: " ",
    inkColor: null,
    kind: "selection",
  });
  expect(JSON.stringify(scene)).toBe(before);
});
