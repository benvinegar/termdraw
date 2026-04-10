export * from "./src/index.ts";

if (import.meta.main) {
  await import("./src/cli.tsx");
}
