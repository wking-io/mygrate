import { Context, Data, Effect, Layer } from "effect";

import { AppConfig } from "./Config";
import { ImportService } from "./ImportService";
import { type Board, PinterestClient } from "./PinterestClient";

export class SyncError extends Data.TaggedError("SyncError")<{
  message: string;
  cause?: unknown;
}> {}

export class MygrateSync extends Context.Service<
  MygrateSync,
  {
    readonly run: Effect.Effect<void, SyncError>;
  }
>()("MygrateSync") {}

const selectedBoards = (boards: ReadonlyArray<Board>, boardIds: ReadonlyArray<string>) => {
  if (boardIds.length === 0) {
    return boards;
  }
  const byId = new Map(boards.map((board) => [board.id, board]));
  return boardIds.map((id) => byId.get(id) ?? ({ id, name: id } satisfies Board));
};

export const MygrateSyncLive = Layer.effect(
  MygrateSync,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const pinterest = yield* PinterestClient;
    const importer = yield* ImportService;

    return MygrateSync.of({
      run: Effect.gen(function* () {
        const boards = selectedBoards(yield* pinterest.listBoards, config.pinterestBoardIds);
        yield* Effect.log(`Syncing ${boards.length} Pinterest board(s)`);

        let syncedPins = 0;
        let uploadedImages = 0;
        for (const board of boards) {
          if (config.pinterestMaxPins !== undefined && syncedPins >= config.pinterestMaxPins) {
            break;
          }

          const pins = yield* pinterest.listPins(board.id);
          yield* Effect.log(`Found ${pins.length} pin(s) on "${board.name}"`);

          for (const pin of pins) {
            if (config.pinterestMaxPins !== undefined && syncedPins >= config.pinterestMaxPins) {
              break;
            }

            syncedPins++;
            const imported = yield* importer.importPins(board, [pin]);
            uploadedImages += imported.length;
          }
        }

        yield* Effect.log(
          `Finished: visited ${syncedPins} pin(s), processed ${uploadedImages} image(s)`,
        );
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof SyncError
            ? cause
            : new SyncError({ message: "mygrate sync failed", cause }),
        ),
      ),
    });
  }),
);
