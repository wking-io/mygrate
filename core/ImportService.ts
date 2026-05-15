import { Context, Data, Effect, Layer } from "effect";

import { AppConfig } from "./Config";
import { MyMindClient } from "./MyMindClient";
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
  Effect.tryPromise({
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
    catch: (cause) => new ImportError({ message: `Failed to download image ${image.url}`, cause }),
  });

export const ImportServiceLive = Layer.effect(
  ImportService,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const pinterest = yield* PinterestClient;
    const mymind = yield* MyMindClient;

    const importPinImage = (board: Board, pin: Pin, image: PinImage) =>
      Effect.gen(function* () {
        if (config.dryRun) {
          yield* Effect.log(
            `DRY_RUN would upload pin ${pin.id} from "${board.name}": ${image.url}`,
          );
          return {
            pinId: pin.id,
            imageUrl: image.url,
            objectId: undefined,
            dryRun: true,
          };
        }

        const downloaded = yield* downloadImage(image);
        const object = yield* mymind.createImageObject({
          board,
          pin,
          image,
          imageBytes: downloaded.bytes,
          mimeType: downloaded.mimeType,
        });
        yield* mymind.addSourceNote({
          objectId: object.id,
          board,
          pin,
          image,
        });
        yield* Effect.log(
          `Uploaded pin ${pin.id} from "${board.name}" to mymind object ${object.id}`,
        );
        return {
          pinId: pin.id,
          imageUrl: image.url,
          objectId: object.id,
          dryRun: false,
        };
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof ImportError
            ? cause
            : new ImportError({ message: `Failed to import pin ${pin.id}`, cause }),
        ),
      );

    return ImportService.of({
      importPinImage,
      importPins: (board, pins) =>
        Effect.gen(function* () {
          const imported: Array<ImportedImage> = [];
          for (const pin of pins) {
            const images = pinterest.imageCandidates(pin);
            if (images.length === 0) {
              yield* Effect.log(`Skipping pin ${pin.id}: no image media found`);
              continue;
            }
            for (const image of images) {
              imported.push(yield* importPinImage(board, pin, image));
            }
          }
          return imported;
        }).pipe(
          Effect.mapError((cause) =>
            cause instanceof ImportError
              ? cause
              : new ImportError({ message: "Failed to import selected pins", cause }),
          ),
        ),
    });
  }),
);
