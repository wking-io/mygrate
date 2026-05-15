import { Context, Data, Effect, Layer, Redacted, Schema } from "effect";

import { AppConfig } from "./Config";

const pinterestApiUrl = "https://api.pinterest.com/v5";

const ImageDetails = Schema.Struct({
  url: Schema.String,
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
});

const ImageSize = Schema.Struct({
  "1200x": Schema.optional(ImageDetails),
  "600x": Schema.optional(ImageDetails),
  "400x300": Schema.optional(ImageDetails),
  "150x150": Schema.optional(ImageDetails),
});

type ImageSizeShape = typeof ImageSize.Type;

export class Board extends Schema.Class<Board>("Board")({
  id: Schema.String,
  name: Schema.String,
}) {}

const PinMediaWithImage = Schema.Struct({
  media_type: Schema.Literal("image"),
  images: Schema.optional(ImageSize),
});

const ImageMetadata = Schema.Struct({
  title: Schema.NullOr(Schema.String).pipe(Schema.optional),
  description: Schema.NullOr(Schema.String).pipe(Schema.optional),
  link: Schema.NullOr(Schema.String).pipe(Schema.optional),
  images: Schema.optional(ImageSize),
});

const PinMediaWithImages = Schema.Struct({
  media_type: Schema.Literal("multiple_images"),
  items: Schema.optional(Schema.Array(ImageMetadata)),
});

const UnsupportedPinMedia = Schema.Struct({
  media_type: Schema.String,
});

const PinMedia = Schema.Union([PinMediaWithImage, PinMediaWithImages, UnsupportedPinMedia]);

export class Pin extends Schema.Class<Pin>("Pin")({
  id: Schema.String,
  board_id: Schema.optional(Schema.String),
  title: Schema.NullOr(Schema.String).pipe(Schema.optional),
  description: Schema.NullOr(Schema.String).pipe(Schema.optional),
  alt_text: Schema.NullOr(Schema.String).pipe(Schema.optional),
  link: Schema.NullOr(Schema.String).pipe(Schema.optional),
  media: Schema.optional(PinMedia),
}) {}

const BoardsResponse = Schema.Struct({
  bookmark: Schema.NullOr(Schema.String).pipe(Schema.optional),
  items: Schema.Array(Board),
});

const PinsResponse = Schema.Struct({
  bookmark: Schema.NullOr(Schema.String).pipe(Schema.optional),
  items: Schema.Array(Pin),
});

export type PinImage = {
  readonly url: string;
  readonly title: string | undefined;
  readonly description: string | undefined;
};

export class PinterestError extends Data.TaggedError("PinterestError")<{
  message: string;
  cause?: unknown;
}> {}

export type PinterestClientShape = {
  readonly listBoards: Effect.Effect<ReadonlyArray<Board>, PinterestError>;
  readonly listPins: (boardId: string) => Effect.Effect<ReadonlyArray<Pin>, PinterestError>;
  readonly imageCandidates: (pin: Pin) => ReadonlyArray<PinImage>;
};

export class PinterestClient extends Context.Service<PinterestClient, PinterestClientShape>()(
  "PinterestClient",
) {}

const decodeBoardsResponse = Schema.decodeUnknownEffect(BoardsResponse);
const decodePinsResponse = Schema.decodeUnknownEffect(PinsResponse);

const requestJson = <A>(
  token: Redacted.Redacted<string>,
  path: string,
  params: URLSearchParams,
  decode: (value: unknown) => Effect.Effect<A, unknown>,
) =>
  Effect.tryPromise({
    try: async () => {
      const url = new URL(`${pinterestApiUrl}${path}`);
      url.search = params.toString();
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${Redacted.value(token)}`,
          Accept: "application/json",
        },
      });
      const body = await response.json().catch(() => undefined);
      if (!response.ok) {
        throw new PinterestError({
          message: `Pinterest request failed: ${response.status} ${response.statusText}`,
          cause: body,
        });
      }
      return body;
    },
    catch: (cause) =>
      cause instanceof PinterestError
        ? cause
        : new PinterestError({ message: "Pinterest request failed", cause }),
  }).pipe(
    Effect.flatMap((body) => decode(body)),
    Effect.mapError((cause) =>
      cause instanceof PinterestError
        ? cause
        : new PinterestError({
            message: "Pinterest response did not match the expected shape",
            cause,
          }),
    ),
  );

const collectPages = <A>(
  fetchPage: (bookmark: string | undefined) => Effect.Effect<
    {
      readonly bookmark?: string | null;
      readonly items: ReadonlyArray<A>;
    },
    PinterestError
  >,
) =>
  Effect.gen(function* () {
    const items: Array<A> = [];
    let bookmark: string | undefined;
    do {
      const page = yield* fetchPage(bookmark);
      items.push(...page.items);
      bookmark = page.bookmark ?? undefined;
    } while (bookmark !== undefined && bookmark.length > 0);
    return items;
  });

const bestImageUrl = (images: ImageSizeShape | undefined) =>
  images?.["1200x"]?.url ??
  images?.["600x"]?.url ??
  images?.["400x300"]?.url ??
  images?.["150x150"]?.url;

export const PinterestClientLive = Layer.effect(
  PinterestClient,
  Effect.gen(function* () {
    const config = yield* AppConfig;

    const baseParams = () => {
      const params = new URLSearchParams();
      params.set("page_size", String(config.pinterestPageSize));
      return params;
    };

    return PinterestClient.of({
      listBoards: collectPages((bookmark) => {
        const params = baseParams();
        if (bookmark) {
          params.set("bookmark", bookmark);
        }
        if (config.pinterestBoardPrivacy) {
          params.set("privacy", config.pinterestBoardPrivacy);
        }
        return requestJson(config.pinterestAccessToken, "/boards", params, decodeBoardsResponse);
      }),
      listPins: (boardId) =>
        collectPages((bookmark) => {
          const params = baseParams();
          if (bookmark) {
            params.set("bookmark", bookmark);
          }
          return requestJson(
            config.pinterestAccessToken,
            `/boards/${encodeURIComponent(boardId)}/pins`,
            params,
            decodePinsResponse,
          );
        }),
      imageCandidates: (pin) => {
        if (pin.media?.media_type === "image" && "images" in pin.media) {
          const url = bestImageUrl(pin.media.images);
          return url
            ? [
                {
                  url,
                  title: pin.title ?? undefined,
                  description: pin.description ?? pin.alt_text ?? undefined,
                },
              ]
            : [];
        }
        if (pin.media?.media_type === "multiple_images" && "items" in pin.media) {
          return (
            pin.media.items?.flatMap((item: typeof ImageMetadata.Type) => {
              const url = bestImageUrl(item.images);
              return url
                ? [
                    {
                      url,
                      title: item.title ?? pin.title ?? undefined,
                      description: item.description ?? pin.description ?? pin.alt_text ?? undefined,
                    },
                  ]
                : [];
            }) ?? []
          );
        }
        return [];
      },
    });
  }),
);
