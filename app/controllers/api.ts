import { Effect, Schema } from "effect";
import type { BuildAction } from "remix/fetch-router";

import { ImportService } from "../../core/ImportService.ts";
import { MigratedPinsStore } from "../../core/MigratedPinsStore.ts";
import { type Pin, PinterestClient, type PinterestClientShape } from "../../core/PinterestClient.ts";
import type { routes } from "../routes.ts";
import { pickerRuntime } from "../services/picker-runtime.ts";

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

const pinView = (pin: Pin, pinterest: PinterestClientShape, migratedPinIds: ReadonlySet<string>) => {
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
    migrated: migratedPinIds.has(pin.id),
  };
};

export const boards: BuildAction<"GET", typeof routes.boards> = {
  async handler() {
    try {
      return json(
        await pickerRuntime.runPromise(
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
      );
    } catch (error) {
      return problem(error);
    }
  },
};

export const pins: BuildAction<"GET", typeof routes.pins> = {
  async handler({ params }) {
    try {
      return json(
        await pickerRuntime.runPromise(
          Effect.gen(function* () {
            const pinterest = yield* PinterestClient;
            const migratedPins = yield* MigratedPinsStore;
            const migratedPinIds = yield* migratedPins.list;
            const pins = yield* pinterest.listPins(params.boardId);
            return {
              pins: pins
                .map((pin) => pinView(pin, pinterest, migratedPinIds))
                .filter((pin): pin is NonNullable<typeof pin> => pin !== undefined),
            };
          }),
        ),
      );
    } catch (error) {
      return problem(error);
    }
  },
};

export const importPins: BuildAction<"POST", typeof routes.importPins> = {
  async handler({ request }) {
    try {
      const payload = await pickerRuntime.runPromise(decodeImportPayload(await request.json()));
      return json(
        await pickerRuntime.runPromise(
          Effect.gen(function* () {
            const pinterest = yield* PinterestClient;
            const importer = yield* ImportService;
            const migratedPins = yield* MigratedPinsStore;
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
            const migratedPinIds = new Set(
              imported.filter((image) => !image.dryRun).map((image) => image.pinId),
            );
            if (migratedPinIds.size > 0) {
              yield* migratedPins.addMany(migratedPinIds);
            }
            return { imported };
          }),
        ),
      );
    } catch (error) {
      return problem(error);
    }
  },
};
