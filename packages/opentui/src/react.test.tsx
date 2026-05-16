import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { buildHelpText } from "./app";
import { DRAW_DOCUMENT_VERSION } from "./draw-state";
import { TermDraw, TermDrawApp, TermDrawEditor } from "./react";

function expectEmptySave(savedArt: string | null): void {
  if (savedArt === null) {
    throw new Error("Expected save callback to receive art.");
  }

  if (savedArt !== "") {
    throw new Error(`Expected empty export, received ${JSON.stringify(savedArt)}.`);
  }
}

test("TermDrawApp renders the full chrome and can save", async () => {
  let savedArt: string | null = null;

  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={false}
      onSave={(art) => {
        savedArt = art;
      }}
    />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("termDRAW!");
  expect(frame).toContain("Tools");
  expect(frame).toContain("LINE");
  expect(frame).toContain("Brush");

  mockInput.pressEnter();
  await renderOnce();

  expectEmptySave(savedArt);
});

test("TermDrawApp supports common graphics-app tool hotkeys", async () => {
  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDrawApp width="100%" height="100%" autoFocus showStartupLogo={false} />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  mockInput.pressKey("b");
  await renderOnce();
  expect(captureCharFrame()).toContain("BRUSH");

  mockInput.pressKey("a");
  await renderOnce();
  expect(captureCharFrame()).toContain("SELECT");

  mockInput.pressKey("u");
  await renderOnce();
  expect(captureCharFrame()).toContain("BOX");

  mockInput.pressKey("p");
  await renderOnce();
  expect(captureCharFrame()).toContain("LINE");

  mockInput.pressKey("e");
  await renderOnce();
  expect(captureCharFrame()).toContain("ELBOW");

  mockInput.pressKey("t");
  await renderOnce();
  expect(captureCharFrame()).toContain("TEXT");
});

test("TermDrawApp shows line, box, and brush styles contextually", async () => {
  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDrawApp width="100%" height="100%" autoFocus showStartupLogo={false} />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();
  let frame = captureCharFrame();
  expect(frame).toContain("Smooth");
  expect(frame).toContain("Single");
  expect(frame).toContain("Double");
  expect(frame).not.toContain("Dashed");
  expect(frame).not.toContain("Heavy");

  mockInput.pressKey("e");
  await renderOnce();
  frame = captureCharFrame();
  expect(frame).toContain("Single");
  expect(frame).toContain("Double");
  expect(frame).toContain("Dashed");
  expect(frame).not.toContain("Smooth");

  mockInput.pressKey("u");
  await renderOnce();
  frame = captureCharFrame();
  expect(frame).toContain("Single");
  expect(frame).toContain("Double");
  expect(frame).toContain("Heavy");

  mockInput.pressKey("b");
  await renderOnce();
  frame = captureCharFrame();
  expect(frame).toContain("Hash");
  expect(frame).toContain("Bullet");
  expect(frame).toContain("Light");
});

test("help text documents tool hotkeys and automatic line rendering", () => {
  const help = buildHelpText();
  expect(help).toContain("Select / Box / Line / Elbow / Brush / Text");
  expect(help).toContain("B / A / U / P / E / T");
  expect(help).toContain("choose Smooth (Braille-aware), Single, or Double line stencils");
  expect(help).toContain("choose Single, Double, or Dashed connectors; R toggles route");
  expect(help).toContain("choose from preset brush stencils in the palette");
  expect(help).toContain("--load <file>");
  expect(help).toContain("Ctrl+D          save diagram (.td.json)");
  expect(help).toContain("route Elbow mode vertical-first for horizontal arrows");
});

test("TermDrawApp supports custom footer text", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={false}
      footerText="Enter / Ctrl+S inserts into Pi • Ctrl+Q cancels"
    />,
    {
      width: 96,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("Enter / Ctrl+S inserts into Pi");
  expect(frame).toContain("Ctrl+Q cancels");
});

test("TermDrawEditor renders without full chrome and can save", async () => {
  let savedArt: string | null = null;

  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDrawEditor
      width="100%"
      height="100%"
      autoFocus
      onSave={(art) => {
        savedArt = art;
      }}
    />,
    {
      width: 32,
      height: 10,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).not.toContain("termDRAW!");
  expect(frame).not.toContain("Tools");

  mockInput.pressEnter();
  await renderOnce();

  expectEmptySave(savedArt);
});

test("TermDraw remains an alias for the full app component", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <TermDraw width="100%" height="100%" autoFocus showStartupLogo={false} />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("termDRAW!");
  expect(frame).toContain("Tools");
});

test("TermDrawApp renders a provided initial document", async () => {
  const { captureCharFrame, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      initialDocument={{
        version: DRAW_DOCUMENT_VERSION,
        objects: [
          {
            id: "obj-1",
            type: "line",
            z: 1,
            parentId: null,
            color: "white",
            x1: 1,
            y1: 1,
            x2: 4,
            y2: 1,
            style: "light",
          },
        ],
      }}
    />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("────");
  expect(frame).not.toContain("Licensed under MIT");
});

test("TermDrawApp saves the current diagram to the loaded path", async () => {
  let savedPath: string | null = null;
  let savedDocument: unknown = null;

  const { mockInput, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={false}
      diagramPath="loaded.td.json"
      initialDocument={{
        version: DRAW_DOCUMENT_VERSION,
        objects: [],
      }}
      onSaveDiagram={(document, path) => {
        savedDocument = document;
        savedPath = path;
      }}
    />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  mockInput.pressKey("d", { ctrl: true });
  await renderOnce();

  if (savedPath === null) {
    throw new Error("Expected diagram save to capture a path.");
  }
  expect(savedPath === "loaded.td.json").toBe(true);
  expect(savedDocument).toEqual({
    version: DRAW_DOCUMENT_VERSION,
    objects: [],
  });
});

test("TermDrawApp prompts for a diagram path and reuses it on later saves", async () => {
  const savedPaths: string[] = [];

  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={false}
      initialDocument={{
        version: DRAW_DOCUMENT_VERSION,
        objects: [],
      }}
      onSaveDiagram={(_document, path) => {
        savedPaths.push(path);
      }}
    />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  mockInput.pressKey("d", { ctrl: true });
  await renderOnce();
  expect(captureCharFrame()).toContain("Save diagram as");

  for (const char of "diagram") {
    mockInput.pressKey(char);
  }
  mockInput.pressEnter();
  await renderOnce();

  expect(savedPaths).toEqual(["diagram.td.json"]);

  mockInput.pressKey("d", { ctrl: true });
  await renderOnce();

  expect(savedPaths).toEqual(["diagram.td.json", "diagram.td.json"]);
});

test("TermDrawApp validates that a diagram path is provided", async () => {
  let saveCount = 0;

  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={false}
      initialDocument={{
        version: DRAW_DOCUMENT_VERSION,
        objects: [],
      }}
      onSaveDiagram={() => {
        saveCount += 1;
      }}
    />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  mockInput.pressKey("d", { ctrl: true });
  await renderOnce();
  mockInput.pressEnter();
  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("Save diagram as");
  expect(frame).toContain("Path is required.");
  expect(saveCount).toBe(0);
});

test("TermDrawApp shows a pending save state while a diagram save is in flight", async () => {
  const pendingSave = {
    resolve: null as (() => void) | null,
  };

  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={false}
      initialDocument={{
        version: DRAW_DOCUMENT_VERSION,
        objects: [],
      }}
      onSaveDiagram={async () => {
        await new Promise<void>((resolve) => {
          pendingSave.resolve = resolve;
        });
      }}
    />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  mockInput.pressKey("d", { ctrl: true });
  await renderOnce();
  for (const char of "diagram") {
    mockInput.pressKey(char);
  }
  mockInput.pressEnter();
  await renderOnce();

  expect(captureCharFrame()).toContain("Saving...");

  pendingSave.resolve?.();
  await Promise.resolve();
  await renderOnce();

  expect(captureCharFrame()).not.toContain("Save diagram as");
});

test("TermDrawApp appends .td.json when saving a loaded diagram without an extension", async () => {
  let savedPath: string | null = null;

  const { mockInput, renderOnce } = await testRender(
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={false}
      diagramPath="loaded-diagram"
      initialDocument={{
        version: DRAW_DOCUMENT_VERSION,
        objects: [],
      }}
      onSaveDiagram={(_document, path) => {
        savedPath = path;
      }}
    />,
    {
      width: 64,
      height: 29,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  mockInput.pressKey("d", { ctrl: true });
  await renderOnce();

  if (savedPath === null) {
    throw new Error("Expected diagram save to capture a path.");
  }
  expect(savedPath === "loaded-diagram.td.json").toBe(true);
});
