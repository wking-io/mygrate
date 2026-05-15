import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Context, Data, Effect, Layer, Schema } from "effect";

class MigratedPinsData extends Schema.Class<MigratedPinsData>("MigratedPinsData")({
  migratedPinIds: Schema.Array(Schema.String),
}) {}

const decodeMigratedPinsData = Schema.decodeUnknownEffect(MigratedPinsData);

export class MigratedPinsStoreError extends Data.TaggedError("MigratedPinsStoreError")<{
  message: string;
  cause?: unknown;
}> {}

export class MigratedPinsStore extends Context.Service<
  MigratedPinsStore,
  {
    readonly list: Effect.Effect<ReadonlySet<string>, MigratedPinsStoreError>;
    readonly addMany: (
      pinIds: Iterable<string>,
    ) => Effect.Effect<ReadonlySet<string>, MigratedPinsStoreError>;
  }
>()("MigratedPinsStore") {}

const storePath = () => resolve(process.env.MIGRATED_PINS_PATH ?? ".data/migrated-pins.json");

const readPinIds = (path: string) =>
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: async () => {
        try {
          return await readFile(path, "utf8");
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return undefined;
          }
          throw error;
        }
      },
      catch: (cause) =>
        new MigratedPinsStoreError({
          message: `Failed to read migrated pins from ${path}`,
          cause,
        }),
    });
    if (text === undefined) {
      return new Set<string>();
    }

    const json = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: (cause) =>
        new MigratedPinsStoreError({
          message: `Failed to parse migrated pins from ${path}`,
          cause,
        }),
    });

    const data = yield* decodeMigratedPinsData(json).pipe(
      Effect.mapError(
        (cause) =>
          new MigratedPinsStoreError({
            message: `Failed to parse migrated pins from ${path}`,
            cause,
          }),
      ),
    );

    return new Set(data.migratedPinIds);
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof MigratedPinsStoreError
        ? cause
        : new MigratedPinsStoreError({
            message: `Failed to load migrated pins from ${path}`,
            cause,
          }),
    ),
  );

const writePinIds = (path: string, pinIds: ReadonlySet<string>) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        `${JSON.stringify({ migratedPinIds: Array.from(pinIds).sort() }, null, 2)}\n`,
      );
    },
    catch: (cause) =>
      new MigratedPinsStoreError({
        message: `Failed to write migrated pins to ${path}`,
        cause,
      }),
  });

export const MigratedPinsStoreLive = Layer.succeed(
  MigratedPinsStore,
  MigratedPinsStore.of({
    list: Effect.suspend(() => readPinIds(storePath())),
    addMany: (pinIds) =>
      Effect.gen(function* () {
        const path = storePath();
        const existing = yield* readPinIds(path);
        const next = new Set(existing);
        for (const pinId of pinIds) {
          next.add(pinId);
        }
        yield* writePinIds(path, next);
        return next;
      }),
  }),
);
