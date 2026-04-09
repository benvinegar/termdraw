import React from "react";
import { extend, type ExtendedComponentProps } from "@opentui/react";
import { TermDrawRenderable } from "./app";

export const TERM_DRAW_COMPONENT_NAME = "term-draw";

let registered = false;

export function registerTermDrawComponent(): void {
  if (registered) return;

  extend({
    [TERM_DRAW_COMPONENT_NAME]: TermDrawRenderable,
  });

  registered = true;
}

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "term-draw": typeof TermDrawRenderable;
  }
}

export type TermDrawProps = ExtendedComponentProps<typeof TermDrawRenderable>;

export function TermDraw(props: TermDrawProps): React.ReactElement {
  registerTermDrawComponent();
  return React.createElement(TERM_DRAW_COMPONENT_NAME, props);
}
