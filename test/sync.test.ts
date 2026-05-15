import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";

import { ImportService, type ImportedImage } from "../core/ImportService.ts";
import { type Board, type Pin, PinterestClient } from "../core/PinterestClient.ts";
import { PinterestMyMindSync, PinterestMyMindSyncLive } from "../core/Sync.ts";
import { testConfigLayer } from "./helpers.ts";

const boards: Board[] = [
  { id: "board-1", name: "Board One" },
  { id: "board-2", name: "Board Two" },
];

const pinsByBoard = new Map<string, Pin[]>([
  ["board-1", [{ id: "pin-1" }, { id: "pin-2" }]],
  ["board-2", [{ id: "pin-3" }]],
  ["missing-board", [{ id: "pin-4" }]],
]);

const runSync = async (options: {
  boardIds?: ReadonlyArray<string>;
  maxPins?: number;
}) => {
  const imported: string[] = [];
  const layer = PinterestMyMindSyncLive.pipe(
    Layer.provide(
      Layer.succeed(
        PinterestClient,
        PinterestClient.of({
          listBoards: Effect.succeed(boards),
          listPins: (boardId) => Effect.succeed(pinsByBoard.get(boardId) ?? []),
          imageCandidates: () => [],
        }),
      ),
    ),
    Layer.provide(
      Layer.succeed(
        ImportService,
        ImportService.of({
          importPinImage: () => Effect.die("not used"),
          importPins: (board, pins) =>
            Effect.sync(() => {
              imported.push(...pins.map((pin) => `${board.id}:${pin.id}`));
              return pins.map(
                (pin): ImportedImage => ({
                  pinId: pin.id,
                  imageUrl: `image:${pin.id}`,
                  objectId: `object:${pin.id}`,
                  dryRun: false,
                }),
              );
            }),
        }),
      ),
    ),
    Layer.provide(
      testConfigLayer({
        pinterestBoardIds: options.boardIds ?? [],
        pinterestMaxPins: options.maxPins,
      }),
    ),
  );

  await Effect.runPromise(PinterestMyMindSync.use((sync) => sync.run).pipe(Effect.provide(layer)));
  return imported;
};

describe("PinterestMyMindSync", () => {
  test("syncs all boards when no board filter is configured", async () => {
    await expect(runSync({})).resolves.toEqual([
      "board-1:pin-1",
      "board-1:pin-2",
      "board-2:pin-3",
    ]);
  });

  test("uses configured board ids and creates fallback board names for missing boards", async () => {
    await expect(runSync({ boardIds: ["missing-board"] })).resolves.toEqual([
      "missing-board:pin-4",
    ]);
  });

  test("stops after the configured max pin count", async () => {
    await expect(runSync({ maxPins: 2 })).resolves.toEqual(["board-1:pin-1", "board-1:pin-2"]);
  });
});
