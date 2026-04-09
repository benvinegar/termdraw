import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { TermDraw } from "./react";

test("TermDraw renders as an OpenTUI React component and can save", async () => {
  let savedArt: string | null = null;

  const { captureCharFrame, mockInput, renderOnce } = await testRender(
    <TermDraw
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
      height: 26,
      useMouse: true,
      enableMouseMovement: true,
    },
  );

  await renderOnce();

  const frame = captureCharFrame();
  expect(frame).toContain("termDRAW!");
  expect(frame).toContain("LINE");

  mockInput.pressEnter();
  await renderOnce();

  if (savedArt === null) {
    throw new Error("Expected save callback to receive art.");
  }

  if (savedArt !== "") {
    throw new Error(`Expected empty export, received ${JSON.stringify(savedArt)}.`);
  }
});
