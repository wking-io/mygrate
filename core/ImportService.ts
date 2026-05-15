import { Context, Data, Effect, Layer } from "effect";

import { AppConfig } from "./Config";
import {
  MyMindClient,
  mymindImageObjectIssues,
  type MyMindRequestIssue,
} from "./MyMindClient";
import { type Board, type Pin, type PinImage, PinterestClient } from "./PinterestClient";

export class ImportError extends Data.TaggedError("ImportError")<{
  message: string;
  cause?: unknown;
}> {}

export type ImportedImage = {
  readonly pinId: string;
  readonly imageUrl: string;
  readonly objectId: string | undefined;
  readonly dryRun: boolean;
  readonly issues: ReadonlyArray<MyMindRequestIssue>;
};

export class ImportService extends Context.Service<
  ImportService,
  {
    readonly importPinImage: (
      board: Board,
      pin: Pin,
      image: PinImage,
    ) => Effect.Effect<ImportedImage, ImportError>;
    readonly importPins: (
      board: Board,
      pins: ReadonlyArray<Pin>,
    ) => Effect.Effect<ReadonlyArray<ImportedImage>, ImportError>;
  }
>()("ImportService") {}

const downloadImage = (image: PinImage) =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Downloading image ${image.url}`);
    const downloaded = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(image.url);
        if (!response.ok) {
          throw new Error(`Image request failed: ${response.status} ${response.statusText}`);
        }
        const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
        if (!mimeType.startsWith("image/")) {
          throw new Error(`Expected image content, received ${mimeType}`);
        }
        return {
          bytes: new Uint8Array(await response.arrayBuffer()),
          mimeType,
        };
      },
      catch: (cause) =>
        new ImportError({ message: `Failed to download image ${image.url}`, cause }),
    });
    yield* Effect.logDebug(
      `Downloaded ${downloaded.bytes.byteLength} byte(s) with content type ${downloaded.mimeType}`,
    );
    return downloaded;
  }).pipe(Effect.withLogSpan("import.downloadImage"), Effect.withSpan("import.downloadImage"));

export const ImportServiceLive = Layer.effect(
  ImportService,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const pinterest = yield* PinterestClient;
    const mymind = yield* MyMindClient;

    const importPinImage = (board: Board, pin: Pin, image: PinImage) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`Starting import for pin ${pin.id} from "${board.name}"`);
        if (config.dryRun) {
          yield* Effect.log(
            `DRY_RUN would upload pin ${pin.id} from "${board.name}": ${image.url}`,
          );
          return {
            pinId: pin.id,
            imageUrl: image.url,
            objectId: undefined,
            dryRun: true,
            issues: [],
          };
        }

        const downloaded = yield* downloadImage(image);
        const issues = mymindImageObjectIssues({
          pin,
          image,
          imageBytes: downloaded.bytes,
          mimeType: downloaded.mimeType,
          spaceIds: config.mymindSpaceIds,
        });
        for (const issue of issues) {
          if (issue.code === "title_truncated") {
            yield* Effect.logInfo(`Mitigated mymind ${issue.field}: ${issue.message}`);
          }
        }
        yield* Effect.logDebug(`Creating mymind object for pin ${pin.id}`);
        const object = yield* mymind.createImageObject({
          board,
          pin,
          image,
          imageBytes: downloaded.bytes,
          mimeType: downloaded.mimeType,
        });
        yield* Effect.logDebug(`Created mymind object ${object.id} for pin ${pin.id}`);
        yield* Effect.logDebug(`Adding source note for mymind object ${object.id}`);
        yield* mymind.addSourceNote({
          objectId: object.id,
          board,
          pin,
          image,
        });
        yield* Effect.logDebug(`Added source note for mymind object ${object.id}`);
        yield* Effect.log(
          `Uploaded pin ${pin.id} from "${board.name}" to mymind object ${object.id}`,
        );
        return {
          pinId: pin.id,
          imageUrl: image.url,
          objectId: object.id,
          dryRun: false,
          issues,
        };
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof ImportError
            ? cause
            : new ImportError({ message: `Failed to import pin ${pin.id}`, cause }),
        ),
        Effect.withLogSpan(`import.pin:${pin.id}`),
        Effect.withSpan("import.pin", {
          attributes: {
            boardId: board.id,
            boardName: board.name,
            pinId: pin.id,
            imageUrl: image.url,
          },
        }),
      );

    return ImportService.of({
      importPinImage,
      importPins: (board, pins) =>
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
              imported.push(yield* importPinImage(board, pin, image));
            }
          }
          yield* Effect.logInfo(`Imported ${imported.length} image(s) from "${board.name}"`);
          return imported;
        }).pipe(
          Effect.mapError((cause) =>
            cause instanceof ImportError
              ? cause
              : new ImportError({ message: "Failed to import selected pins", cause }),
          ),
          Effect.withLogSpan("import.pins"),
          Effect.withSpan("import.pins", {
            attributes: {
              boardId: board.id,
              boardName: board.name,
              pinCount: pins.length,
            },
          }),
        ),
    });
  }),
);
