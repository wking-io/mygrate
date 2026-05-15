import { Effect, ManagedRuntime, Schema } from "effect";

import { ImportService } from "./ImportService";
import { pickerPage } from "./pickerPage";
import { type Pin, PinterestClient, type PinterestClientShape } from "./PinterestClient";
import { PickerLive } from "./Runtime";

const runtime = ManagedRuntime.make(PickerLive);

class ImportPayload extends Schema.Class<ImportPayload>("ImportPayload")({
  boardId: Schema.String,
  pinIds: Schema.Array(Schema.String),
}) {}

const decodeImportPayload = Schema.decodeUnknownEffect(ImportPayload);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const problem = (error: unknown, status = 500) =>
  json(
    {
      message: error instanceof Error ? error.message : "Unexpected error",
    },
    status,
  );

const pinView = (pin: Pin, pinterest: PinterestClientShape) => {
  const [image] = pinterest.imageCandidates(pin);
  if (!image) {
    return undefined;
  }
  return {
    id: pin.id,
    title: image.title ?? pin.title ?? undefined,
    description: image.description ?? pin.description ?? pin.alt_text ?? undefined,
    link: pin.link ?? undefined,
    imageUrl: image.url,
  };
};

const routes = {
  boards: () =>
    runtime.runPromise(
      PinterestClient.use((pinterest) =>
        pinterest.listBoards.pipe(
          Effect.map((boards) => ({
            boards: boards.map((board) => ({
              id: board.id,
              name: board.name,
            })),
          })),
        ),
      ),
    ),
  pins: (boardId: string) =>
    runtime.runPromise(
      PinterestClient.use((pinterest) =>
        pinterest.listPins(boardId).pipe(
          Effect.map((pins) => ({
            pins: pins
              .map((pin) => pinView(pin, pinterest))
              .filter((pin): pin is NonNullable<typeof pin> => pin !== undefined),
          })),
        ),
      ),
    ),
  import: (payload: ImportPayload) =>
    runtime.runPromise(
      Effect.gen(function* () {
        const pinterest = yield* PinterestClient;
        const importer = yield* ImportService;
        const boards = yield* pinterest.listBoards;
        const board = boards.find((candidate) => candidate.id === payload.boardId) ?? {
          id: payload.boardId,
          name: payload.boardId,
        };
        const pinIds = new Set(payload.pinIds);
        const pins = (yield* pinterest.listPins(payload.boardId)).filter((pin) =>
          pinIds.has(pin.id),
        );
        const imported = yield* importer.importPins(board, pins);
        return { imported };
      }),
    ),
};

const handleApi = async (request: Request, url: URL) => {
  try {
    if (request.method === "GET" && url.pathname === "/api/boards") {
      return json(await routes.boards());
    }

    const pinsMatch = url.pathname.match(/^\/api\/boards\/([^/]+)\/pins$/);
    if (request.method === "GET" && pinsMatch?.[1]) {
      return json(await routes.pins(decodeURIComponent(pinsMatch[1])));
    }

    if (request.method === "POST" && url.pathname === "/api/import") {
      const payload = await runtime.runPromise(decodeImportPayload(await request.json()));
      return json(await routes.import(payload));
    }

    return problem(new Error("Not found"), 404);
  } catch (error) {
    return problem(error);
  }
};

const port = Number(Bun.env.PICKER_PORT ?? 3421);

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, url);
    }
    return new Response(pickerPage, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`Pinterest to mymind picker listening on http://localhost:${server.port}`);

const shutdown = () => {
  void runtime.dispose();
  server.stop();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
