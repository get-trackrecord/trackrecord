import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/card.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  // card render deps are devDependencies (internal until launch) — keep them
  // external so tsup never bundles them into the shipped dist
  external: ["satori", "@resvg/resvg-js"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
