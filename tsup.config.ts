import { defineConfig } from "tsup";
import { writeFileSync, readFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: "esm",
  target: "node22",
  platform: "node",
  splitting: true,
  clean: true,
  dts: true,
  sourcemap: true,
  onSuccess: async () => {
    // Add shebang only to CLI entry
    const cliPath = "dist/cli.js";
    const content = readFileSync(cliPath, "utf-8");
    if (!content.startsWith("#!")) {
      writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
    }

    // Copy storage files (schema.sql) to dist
    const storageSrc = "src/storage";
    const storageDist = "dist/storage";
    if (!existsSync(storageDist)) {
      mkdirSync(storageDist, { recursive: true });
    }
    const files = ["schema.sql"];
    for (const file of files) {
      const src = join(storageSrc, file);
      const dst = join(storageDist, file);
      if (existsSync(src)) {
        copyFileSync(src, dst);
      }
    }
  },
});
