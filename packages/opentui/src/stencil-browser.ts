import { DrawState, type CanvasInsets } from "./draw-state.js";
import {
  STENCIL_CATEGORY_OPTIONS,
  STENCIL_DEFINITIONS,
  type StencilCategory,
  type StencilDefinition,
} from "./stencils.js";

const PREVIEW_INSETS: CanvasInsets = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
};

export type StencilBrowserCategory = "all" | StencilCategory;

export const STENCIL_BROWSER_CATEGORY_OPTIONS: {
  id: StencilBrowserCategory;
  label: string;
}[] = [{ id: "all", label: "All" }, ...STENCIL_CATEGORY_OPTIONS];

export type StencilBrowserState = {
  open: boolean;
  query: string;
  category: StencilBrowserCategory;
  selectedIndex: number;
};

export function createStencilBrowserState(): StencilBrowserState {
  return {
    open: false,
    query: "",
    category: "all",
    selectedIndex: 0,
  };
}

export function getFilteredStencils(
  query: string,
  category: StencilBrowserCategory,
): StencilDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();

  return STENCIL_DEFINITIONS.filter((stencil) => {
    if (category !== "all" && stencil.category !== category) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    const haystack = [stencil.name, stencil.description, stencil.category, ...stencil.tags]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function clampStencilBrowserSelection(
  state: StencilBrowserState,
  stencils: StencilDefinition[],
): void {
  if (stencils.length === 0) {
    state.selectedIndex = 0;
    return;
  }

  state.selectedIndex = Math.max(0, Math.min(state.selectedIndex, stencils.length - 1));
}

export function renderStencilPreview(
  stencil: StencilDefinition,
  width: number,
  height: number,
): string[] {
  const previewWidth = Math.max(1, width);
  const previewHeight = Math.max(1, height);
  const state = new DrawState(previewWidth, previewHeight, PREVIEW_INSETS);
  state.insertDraftObjects(stencil.create(), {
    anchor: "center",
    selectInserted: false,
    switchToSelectMode: false,
    statusLabel: null,
  });

  const lines: string[] = [];
  for (let y = 0; y < previewHeight; y += 1) {
    let line = "";
    for (let x = 0; x < previewWidth; x += 1) {
      line += state.getCompositeCell(x, y);
    }
    lines.push(line);
  }

  return lines;
}
