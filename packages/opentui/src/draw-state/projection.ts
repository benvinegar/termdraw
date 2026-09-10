import { getElbowRenderCharacters, getLineRenderCharacters, pointFromKey } from "./line.js";
import {
  adjustConnection,
  applyBoxPerimeter,
  createCanvas,
  createColorGrid,
  createConnectionGrid,
  getBoxBorderGlyphs,
  getConnectionGlyph,
  paintConnectionColor,
} from "./scene.js";
import {
  getTextContentOrigin,
  normalizeCellCharacter,
  splitGraphemes,
  visibleCellCount,
} from "../text.js";
import type {
  BoxStyle,
  CanvasGrid,
  ColorGrid,
  ConnectionGrid,
  ConnectionStyle,
  DrawCanvasCellProjection,
  DrawCanvasProjection,
  DrawObject,
  DrawViewportSnapshot,
  InkColor,
  Point,
  Rect,
} from "./types.js";

export type DrawSceneProjection = {
  canvas: CanvasGrid;
  colors: ColorGrid;
  connections: ConnectionGrid;
  connectionColors: ColorGrid;
};

type DrawCanvasProjectionInput = {
  scene: DrawSceneProjection;
  viewport: DrawViewportSnapshot;
  preview: ReadonlyMap<string, string>;
  previewInkColor: InkColor;
  selectedCells: ReadonlySet<string>;
  marquee: ReadonlyMap<string, string>;
  handles: ReadonlyMap<string, string>;
  cursor: Point;
};

function isInside(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/** Resolves automatic box styling from document structure rather than mutable editor state. */
export function resolveBoxConnectionStyle(
  objects: readonly DrawObject[],
  rect: Rect,
  style: BoxStyle,
  ignoreId?: string,
): ConnectionStyle {
  if (style !== "auto") return style;

  const depth = objects.filter((object) => {
    if (object.type !== "box" || object.id === ignoreId) return false;
    return (
      rect.left > object.left &&
      rect.right < object.right &&
      rect.top > object.top &&
      rect.bottom < object.bottom
    );
  }).length;
  return depth % 2 === 0 ? "heavy" : "light";
}

/** Purely projects persisted document objects into clipped scene grids. */
export function projectDrawScene(
  objects: readonly DrawObject[],
  width: number,
  height: number,
): DrawSceneProjection {
  const scene: DrawSceneProjection = {
    canvas: createCanvas(width, height),
    colors: createColorGrid(width, height),
    connections: createConnectionGrid(width, height),
    connectionColors: createColorGrid(width, height),
  };
  const paintCell = (x: number, y: number, character: string, color: InkColor): void => {
    if (!isInside(width, height, x, y)) return;
    scene.canvas[y]![x] = normalizeCellCharacter(character);
    scene.colors[y]![x] = color;
  };
  const indexedObjects = objects.map((object, index) => ({ object, index }));
  indexedObjects.sort((a, b) => a.object.z - b.object.z || a.index - b.index);

  for (const { object } of indexedObjects) {
    switch (object.type) {
      case "box": {
        const style = resolveBoxConnectionStyle(objects, object, object.style, object.id);
        if (style === "dashed") {
          const { horizontal, vertical, topLeft, topRight, bottomLeft, bottomRight } =
            getBoxBorderGlyphs(style);
          paintCell(object.left, object.top, topLeft, object.color);
          paintCell(object.right, object.top, topRight, object.color);
          paintCell(object.left, object.bottom, bottomLeft, object.color);
          paintCell(object.right, object.bottom, bottomRight, object.color);
          for (let x = object.left + 1; x < object.right; x += 1) {
            paintCell(x, object.top, horizontal, object.color);
            paintCell(x, object.bottom, horizontal, object.color);
          }
          for (let y = object.top + 1; y < object.bottom; y += 1) {
            paintCell(object.left, y, vertical, object.color);
            paintCell(object.right, y, vertical, object.color);
          }
          break;
        }
        applyBoxPerimeter(object, (x, y, direction) => {
          adjustConnection(scene.connections, width, height, x, y, direction, style, 1);
          paintConnectionColor(
            scene.connectionColors,
            width,
            height,
            x,
            y,
            direction,
            object.color,
          );
        });
        break;
      }
      case "line": {
        const rendered = getLineRenderCharacters(
          { x: object.x1, y: object.y1 },
          { x: object.x2, y: object.y2 },
          object.style,
        );
        for (const [key, character] of rendered) {
          const { x, y } = pointFromKey(key);
          paintCell(x, y, character, object.color);
        }
        break;
      }
      case "elbow": {
        const rendered = getElbowRenderCharacters(
          { x: object.x1, y: object.y1 },
          { x: object.x2, y: object.y2 },
          object.style,
          object.orientation,
        );
        for (const [key, character] of rendered) {
          const { x, y } = pointFromKey(key);
          paintCell(x, y, character, object.color);
        }
        break;
      }
      case "paint":
        for (const point of object.points) paintCell(point.x, point.y, object.brush, object.color);
        break;
      case "text": {
        const contentOrigin = getTextContentOrigin(object);
        if (object.border !== "none") {
          const contentWidth = Math.max(1, visibleCellCount(object.content));
          const left = object.x;
          const top = object.y;
          const right = object.x + contentWidth + 1;
          const bottom = object.y + 2;
          if (object.border === "underline") {
            for (let x = contentOrigin.x; x < contentOrigin.x + contentWidth; x += 1) {
              paintCell(x, bottom, "─", object.color);
            }
          } else {
            const horizontal = object.border === "double" ? "═" : "─";
            const vertical = object.border === "double" ? "║" : "│";
            const topLeft = object.border === "double" ? "╔" : "┌";
            const topRight = object.border === "double" ? "╗" : "┐";
            const bottomLeft = object.border === "double" ? "╚" : "└";
            const bottomRight = object.border === "double" ? "╝" : "┘";
            paintCell(left, top, topLeft, object.color);
            paintCell(right, top, topRight, object.color);
            paintCell(left, bottom, bottomLeft, object.color);
            paintCell(right, bottom, bottomRight, object.color);
            for (let x = left + 1; x < right; x += 1) {
              paintCell(x, top, horizontal, object.color);
              paintCell(x, bottom, horizontal, object.color);
            }
            paintCell(left, top + 1, vertical, object.color);
            paintCell(right, top + 1, vertical, object.color);
          }
        }
        for (const [index, segment] of splitGraphemes(object.content).entries()) {
          paintCell(contentOrigin.x + index, contentOrigin.y, segment, object.color);
        }
        break;
      }
    }
  }

  return scene;
}

/** Returns the composed document character and color for one projected scene cell. */
export function getDrawSceneCell(
  scene: DrawSceneProjection,
  x: number,
  y: number,
): Pick<DrawCanvasCellProjection, "character" | "inkColor"> {
  const character = scene.canvas[y]![x] ?? " ";
  if (character !== " ") {
    return { character, inkColor: scene.colors[y]![x] ?? null };
  }
  const connection = getConnectionGlyph(
    scene.connections,
    x,
    y,
    scene.canvas[0]?.length ?? 0,
    scene.canvas.length,
  );
  return {
    character: connection,
    inkColor: connection === " " ? null : (scene.connectionColors[y]![x] ?? null),
  };
}

/** Purely composes scene content and transient overlays into the public sparse projection. */
export function projectDrawCanvas(input: DrawCanvasProjectionInput): DrawCanvasProjection {
  const { scene, viewport } = input;
  const cells = new Map<string, DrawCanvasCellProjection>();

  for (let y = 0; y < viewport.height; y += 1) {
    for (let x = 0; x < viewport.width; x += 1) {
      const cell = getDrawSceneCell(scene, x, y);
      if (cell.character === " ") continue;
      cells.set(`${x},${y}`, { ...cell, kind: "content" });
    }
  }
  for (const [key, character] of input.preview) {
    cells.set(key, { character, inkColor: input.previewInkColor, kind: "preview" });
  }
  for (const key of input.selectedCells) {
    const { x, y } = pointFromKey(key);
    const cell = cells.get(key) ?? { ...getDrawSceneCell(scene, x, y), kind: "content" as const };
    cells.set(key, { ...cell, kind: "selection" });
  }
  for (const [key, character] of input.marquee) {
    cells.set(key, { character, inkColor: null, kind: "marquee" });
  }
  for (const [key, character] of input.handles) {
    cells.set(key, { character, inkColor: null, kind: "handle" });
  }

  const cursorKey = `${input.cursor.x},${input.cursor.y}`;
  const cursorCell = cells.get(cursorKey);
  cells.set(cursorKey, {
    character: cursorCell?.character ?? " ",
    inkColor: cursorCell?.inkColor ?? null,
    kind: "cursor",
  });
  return { viewport, cells };
}
