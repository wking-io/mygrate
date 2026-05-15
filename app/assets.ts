import * as path from "node:path";

import { createAssetServer } from "remix/assets";

export const assets = createAssetServer({
  basePath: "/assets",
  rootDir: path.resolve(import.meta.dirname, ".."),
  fileMap: {
    "app/*path": "app/*path",
    "node_modules/*path": "node_modules/*path",
  },
  allow: ["app/assets/**", "app/ui/**", "app/routes.ts", "node_modules/**"],
  deny: ["app/**/*.server.*"],
  sourceMaps: process.env.NODE_ENV === "development" ? "external" : undefined,
  scripts: {
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
    },
  },
});
