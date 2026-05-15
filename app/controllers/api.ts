import { Effect, Schema } from "effect";
import type { BuildAction } from "remix/fetch-router";

import {
  type ImportedImage,
  type ImportError,
  ImportService,
} from "../../core/ImportService.ts";
import {
  MigratedPinsStore,
  type MigratedPinsStoreError,
} from "../../core/MigratedPinsStore.ts";
import {
  type Board,
  type Pin,
  type PinImage,
  PinterestClient,
  type PinterestClientShape,
} from "../../core/PinterestClient.ts";
import type { routes } from "../routes.ts";
import { runPickerEffect } from "../services/picker-runtime.ts";

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
      message: errorMessage(error),
    },
    status,
  );

const errorMessage = (error: unknown) => {
  const messages: string[] = [];
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ("message" in current && typeof current.message === "string") {
      messages.push(current.message);
    }
    if ("detail" in current && typeof current.detail === "string") {
      messages.push(current.detail);
    }
    if ("errors" in current && Array.isArray(current.errors)) {
      for (const issue of current.errors) {
        if (issue && typeof issue === "object" && "message" in issue) {
          const key = "key" in issue && typeof issue.key === "string" ? `${issue.key}: ` : "";
          if (typeof issue.message === "string") {
            messages.push(`${key}${issue.message}`);
          }
        }
      }
    }
    current = "cause" in current ? current.cause : undefined;
  }
  if (messages.length > 0) {
    return [...new Set(messages)].join(": ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

const logRouteError = (route: string, error: unknown, requestId: string) => {
  console.error(`[${requestId}] ${route} failed`, error);
};

type ImportPinsRecorder = {
  readonly board: Board;
  readonly pins: ReadonlyArray<Pin>;
  readonly pinterest: Pick<PinterestClientShape, "imageCandidates">;
  readonly importer: {
    readonly importPinImage: (
      board: Board,
      pin: Pin,
      image: PinImage,
    ) => Effect.Effect<ImportedImage, ImportError>;
  };
  readonly migratedPins: {
    readonly addMany: (
      pinIds: Iterable<string>,
    ) => Effect.Effect<ReadonlySet<string>, MigratedPinsStoreError>;
  };
};

export const importPinsRecordingSuccesses = ({
  board,
  pins,
  pinterest,
  importer,
  migratedPins,
}: ImportPinsRecorder) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Importing ${pins.length} pin(s) from "${board.name}"`);
    const imported: Array<ImportedImage> = [];
    for (const pin of pins) {
      const images = pinterest.imageCandidates(pin);
      yield* Effect.logDebug(`Pin ${pin.id} produced ${images.length} image candidate(s)`);
      if (images.length === 0) {
        yield* Effect.log(`Skipping pin ${pin.id}: no image media found`);
        continue;
      }
      for (const image of images) {
        const importedImage = yield* importer.importPinImage(board, pin, image);
        imported.push(importedImage);
        if (!importedImage.dryRun) {
          yield* Effect.logDebug(`Recording migrated pin ${importedImage.pinId}`);
          yield* migratedPins.addMany([importedImage.pinId]);
        }
      }
    }
    yield* Effect.logInfo(`Imported ${imported.length} image(s) from "${board.name}"`);
    return imported;
  });

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
    const requestId = crypto.randomUUID();
    try {
      return json(
        await runPickerEffect(
          PinterestClient.use((pinterest) =>
            pinterest.listBoards.pipe(
              Effect.tap(() => Effect.logDebug("Listing Pinterest boards")),
              Effect.map((boards) => ({
                boards: boards.map((board) => ({
                  id: board.id,
                  name: board.name,
                })),
              })),
              Effect.tap((body) => Effect.logInfo(`Listed ${body.boards.length} Pinterest board(s)`)),
              Effect.withLogSpan("api.boards"),
              Effect.withSpan("api.boards"),
            ),
          ),
          { requestId, route: "GET /api/boards" },
        ),
      );
    } catch (error) {
      logRouteError("GET /api/boards", error, requestId);
      return problem(error);
    }
  },
};

export const pins: BuildAction<"GET", typeof routes.pins> = {
  async handler({ params }) {
    const requestId = crypto.randomUUID();
    try {
      return json(
        await runPickerEffect(
          Effect.gen(function* () {
            yield* Effect.logDebug(`Listing pins for board ${params.boardId}`);
            const pinterest = yield* PinterestClient;
            const migratedPins = yield* MigratedPinsStore;
            const migratedPinIds = yield* migratedPins.list;
            const pins = yield* pinterest.listPins(params.boardId);
            yield* Effect.logDebug(
              `Pinterest returned ${pins.length} pin(s); migrated store has ${migratedPinIds.size} id(s)`,
            );
            return {
              pins: pins
                .map((pin) => pinView(pin, pinterest, migratedPinIds))
                .filter((pin): pin is NonNullable<typeof pin> => pin !== undefined),
            };
          }).pipe(
            Effect.tap((body) => Effect.logInfo(`Returned ${body.pins.length} image pin(s)`)),
            Effect.withLogSpan("api.pins"),
            Effect.withSpan("api.pins", { attributes: { boardId: params.boardId } }),
          ),
          { requestId, route: "GET /api/boards/:boardId/pins", boardId: params.boardId },
        ),
      );
    } catch (error) {
      logRouteError("GET /api/boards/:boardId/pins", error, requestId);
      return problem(error);
    }
  },
};

export const importPins: BuildAction<"POST", typeof routes.importPins> = {
  async handler({ request }) {
    const requestId = crypto.randomUUID();
    try {
      const payload = await runPickerEffect(
        decodeImportPayload(await request.json()).pipe(
          Effect.tap((payload) =>
            Effect.logInfo(
              `Decoded import payload for board ${payload.boardId} with ${payload.pinIds.length} selected pin id(s)`,
            ),
          ),
          Effect.withLogSpan("api.import.decodePayload"),
          Effect.withSpan("api.import.decodePayload"),
        ),
        { requestId, route: "POST /api/import" },
      );
      return json(
        await runPickerEffect(
          Effect.gen(function* () {
            const pinterest = yield* PinterestClient;
            const importer = yield* ImportService;
            const migratedPins = yield* MigratedPinsStore;
            yield* Effect.logDebug("Listing boards to resolve selected board");
            const boards = yield* pinterest.listBoards;
            const board = boards.find((candidate) => candidate.id === payload.boardId) ?? {
              id: payload.boardId,
              name: payload.boardId,
            };
            yield* Effect.logDebug(`Resolved selected board as "${board.name}"`);
            const pinIds = new Set(payload.pinIds);
            yield* Effect.logDebug(`Listing pins for board ${payload.boardId}`);
            const pins = (yield* pinterest.listPins(payload.boardId)).filter((pin) =>
              pinIds.has(pin.id),
            );
            yield* Effect.logInfo(`Matched ${pins.length} Pinterest pin(s) from selection`);
            const imported = yield* importPinsRecordingSuccesses({
              board,
              pins,
              pinterest,
              importer,
              migratedPins,
            });
            yield* Effect.logInfo(`Import route completed with ${imported.length} imported image(s)`);
            return { imported };
          }).pipe(
            Effect.withLogSpan("api.import"),
            Effect.withSpan("api.import", {
              attributes: {
                boardId: payload.boardId,
                selectedPins: payload.pinIds.length,
              },
            }),
          ),
          { requestId, route: "POST /api/import", boardId: payload.boardId },
        ),
      );
    } catch (error) {
      logRouteError("POST /api/import", error, requestId);
      return problem(error);
    }
  },
};
