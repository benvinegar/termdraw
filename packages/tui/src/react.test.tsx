import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
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

  mockInput.pressEnter();
  await renderOnce();

  expectEmptySave(savedArt);
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
