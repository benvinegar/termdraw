import React from "react";
import { extend, type ExtendedComponentProps } from "@opentui/react";
import { TermDrawAppRenderable, TermDrawEditorRenderable } from "./app.js";

export const TERM_DRAW_COMPONENT_NAME = "term-draw";
export const TERM_DRAW_APP_COMPONENT_NAME = "term-draw-app";
export const TERM_DRAW_EDITOR_COMPONENT_NAME = "term-draw-editor";

let registered = false;

export function registerTermDrawComponent(): void {
  if (registered) return;

  extend({
    [TERM_DRAW_COMPONENT_NAME]: TermDrawAppRenderable,
    [TERM_DRAW_APP_COMPONENT_NAME]: TermDrawAppRenderable,
    [TERM_DRAW_EDITOR_COMPONENT_NAME]: TermDrawEditorRenderable,
  });

  registered = true;
}

export const registerTermDrawComponents = registerTermDrawComponent;

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "term-draw": typeof TermDrawAppRenderable;
    "term-draw-app": typeof TermDrawAppRenderable;
    "term-draw-editor": typeof TermDrawEditorRenderable;
  }
}

export type TermDrawProps = ExtendedComponentProps<typeof TermDrawAppRenderable>;
export type TermDrawAppProps = ExtendedComponentProps<typeof TermDrawAppRenderable>;
export type TermDrawEditorProps = ExtendedComponentProps<typeof TermDrawEditorRenderable>;

export function TermDraw(props: TermDrawProps): React.ReactElement {
  registerTermDrawComponent();
  return React.createElement(TERM_DRAW_COMPONENT_NAME, props);
}

export function TermDrawApp(props: TermDrawAppProps): React.ReactElement {
  registerTermDrawComponent();
  return React.createElement(TERM_DRAW_APP_COMPONENT_NAME, props);
}

export function TermDrawEditor(props: TermDrawEditorProps): React.ReactElement {
  registerTermDrawComponent();
  return React.createElement(TERM_DRAW_EDITOR_COMPONENT_NAME, props);
}
