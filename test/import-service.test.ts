import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";

import { ImportService, ImportServiceLive } from "../core/ImportService.ts";
import { MyMindClient } from "../core/MyMindClient.ts";
import { type Board, type Pin, PinterestClient, type PinImage } from "../core/PinterestClient.ts";
import { testConfigLayer } from "./helpers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const board = { id: "board-1", name: "Board One" } satisfies Board;
const pin = { id: "pin-1", title: "Pin One" } satisfies Pin;
const image = { url: "https://images.example/pin.jpg", title: "Image title", description: "Image description" } satisfies PinImage;

const pinterestLayer = (images: ReadonlyArray<PinImage>) =>
  Layer.succeed(
    PinterestClient,
    PinterestClient.of({
      listBoards: Effect.succeed([board]),
      listPins: () => Effect.succeed([pin]),
      imageCandidates: () => images,
    }),
  );

const mymindLayer = (calls: string[]) =>
  Layer.succeed(
    MyMindClient,
    MyMindClient.of({
      createImageObject: (input) =>
        Effect.sync(() => {
          calls.push(`create:${input.pin.id}:${input.mimeType}:${input.imageBytes.length}`);
          return { id: "object-1" };
        }),
      addSourceNote: (input) =>
        Effect.sync(() => {
          calls.push(`note:${input.objectId}:${input.pin.id}`);
        }),
    }),
  );

const runImport = <A>(
  effect: Effect.Effect<A, unknown, ImportService>,
  options: {
    dryRun?: boolean;
    images?: ReadonlyArray<PinImage>;
    calls?: string[];
  } = {},
) => {
  const calls = options.calls ?? [];
  const layer = ImportServiceLive.pipe(
    Layer.provide(pinterestLayer(options.images ?? [image])),
    Layer.provide(mymindLayer(calls)),
    Layer.provide(testConfigLayer({ dryRun: options.dryRun ?? false })),
  );
  return Effect.runPromise(effect.pipe(Effect.provide(layer)));
};

describe("ImportService", () => {
  test("dry run reports the import without downloading or writing to mymind", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called during dry run");
    }) as unknown as typeof fetch;

    const imported = await runImport(
      ImportService.use((service) => service.importPinImage(board, pin, image)),
      { calls, dryRun: true },
    );

    expect(imported).toEqual({
      pinId: "pin-1",
      imageUrl: "https://images.example/pin.jpg",
      objectId: undefined,
      dryRun: true,
    });
    expect(calls).toEqual([]);
  });

  test("downloads the image, creates the mymind object, and writes the source note", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/png; charset=utf-8" },
      })) as unknown as typeof fetch;

    const imported = await runImport(
      ImportService.use((service) => service.importPinImage(board, pin, image)),
      { calls },
    );

    expect(imported).toEqual({
      pinId: "pin-1",
      imageUrl: "https://images.example/pin.jpg",
      objectId: "object-1",
      dryRun: false,
    });
    expect(calls).toEqual(["create:pin-1:image/png:3", "note:object-1:pin-1"]);
  });

  test("imports every image candidate for each pin", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([1]), {
        headers: { "Content-Type": "image/jpeg" },
      })) as unknown as typeof fetch;

    const imported = await runImport(
      ImportService.use((service) => service.importPins(board, [pin, { id: "pin-2" } satisfies Pin])),
      {
        calls,
        images: [
          { url: "https://images.example/one.jpg", title: undefined, description: undefined },
          { url: "https://images.example/two.jpg", title: undefined, description: undefined },
        ],
      },
    );

    expect(imported).toHaveLength(4);
    expect(calls).toEqual([
      "create:pin-1:image/jpeg:1",
      "note:object-1:pin-1",
      "create:pin-1:image/jpeg:1",
      "note:object-1:pin-1",
      "create:pin-2:image/jpeg:1",
      "note:object-1:pin-2",
      "create:pin-2:image/jpeg:1",
      "note:object-1:pin-2",
    ]);
  });
});
