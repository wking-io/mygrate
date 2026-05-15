import { describe, expect, test } from "bun:test";
import { Effect } from "effect";

import { importPinsRecordingSuccesses } from "../app/controllers/api.ts";
import { ImportError } from "../core/ImportService.ts";
import type { Board, Pin, PinImage } from "../core/PinterestClient.ts";

const board = { id: "board-1", name: "Board One" } satisfies Board;
const pinOne = { id: "pin-1", title: "Pin One" } satisfies Pin;
const pinTwo = { id: "pin-2", title: "Pin Two" } satisfies Pin;

const imageFor = (pin: Pin): PinImage => ({
  url: `https://images.example/${pin.id}.jpg`,
  title: pin.title ?? undefined,
  description: undefined,
});

describe("API import recording", () => {
  test("records successful migrations before a later batch failure", async () => {
    const recorded: string[] = [];

    const effect = importPinsRecordingSuccesses({
      board,
      pins: [pinOne, pinTwo],
      pinterest: {
        imageCandidates: (pin) => [imageFor(pin)],
      },
      importer: {
        importPinImage: (_board, pin, image) =>
          pin.id === "pin-2"
            ? Effect.fail(new ImportError({ message: "pin-2 failed" }))
            : Effect.succeed({
                pinId: pin.id,
                imageUrl: image.url,
                objectId: "object-1",
                dryRun: false,
                issues: [],
              }),
      },
      migratedPins: {
        addMany: (pinIds) =>
          Effect.sync(() => {
            recorded.push(...pinIds);
            return new Set(recorded);
          }),
      },
    });

    let error: unknown;
    try {
      await Effect.runPromise(effect);
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(ImportError);
    expect(error).toMatchObject({ message: "pin-2 failed" });
    expect(recorded).toEqual(["pin-1"]);
  });

  test("does not record dry-run imports", async () => {
    const recorded: string[] = [];

    const imported = await Effect.runPromise(
      importPinsRecordingSuccesses({
        board,
        pins: [pinOne],
        pinterest: {
          imageCandidates: (pin) => [imageFor(pin)],
        },
        importer: {
          importPinImage: (_board, pin, image) =>
            Effect.succeed({
              pinId: pin.id,
              imageUrl: image.url,
              objectId: undefined,
              dryRun: true,
              issues: [],
            }),
        },
        migratedPins: {
          addMany: (pinIds) =>
            Effect.sync(() => {
              recorded.push(...pinIds);
              return new Set(recorded);
            }),
        },
      }),
    );

    expect(imported).toHaveLength(1);
    expect(recorded).toEqual([]);
  });
});
