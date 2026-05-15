import { serve } from "remix/node-serve";

import { readFileSync } from "node:fs";

loadLocalEnv();

const { router } = await import("./app/router.ts");
const { closePickerRuntime } = await import("./app/services/picker-runtime.ts");

function loadLocalEnv() {
  try {
    let text = readFileSync(".env", "utf8");
    for (let line of text.split(/\r?\n/)) {
      let trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      let index = trimmed.indexOf("=");
      if (index === -1) {
        continue;
      }
      let key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value.replace(/^(['"])(.*)\1$/, "$2");
      }
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

const port = process.env.PORT
  ? Number.parseInt(process.env.PORT, 10)
  : process.env.PICKER_PORT
    ? Number.parseInt(process.env.PICKER_PORT, 10)
    : 3421;

const server = serve(
  async (request) => {
    try {
      return await router.fetch(request);
    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  { port },
);

await server.ready;
console.log(`Pinterest to mymind picker listening on http://localhost:${server.port}`);

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  void closePickerRuntime().finally(() => {
    server.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
