export * from "./packages/tui/index.ts";

if (import.meta.main) {
  await import("./packages/tui/src/cli.tsx");
}
