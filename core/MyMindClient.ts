import { Context, Data, Effect, Layer, Redacted, Schema } from "effect";

import { AppConfig } from "./Config";
import type { AppConfigShape } from "./Config";
import type { Board, Pin, PinImage } from "./PinterestClient";

const mymindApiUrl = "https://api.mymind.com";
const maxUploadBytes = 64 * 1024 * 1024;
const maxTitleLength = 100;
const mymindUidPattern = /^[A-Za-z0-9]{22}$/;
const supportedUploadMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heif",
  "image/jxl",
  "image/bmp",
  "image/tiff",
  "image/vnd.adobe.photoshop",
  "image/svg+xml",
]);

const MyMindObject = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
});

type CreatedObject = typeof MyMindObject.Type;

export type MyMindRequestIssue = {
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly original?: string | number;
  readonly adjusted?: string | number;
};

export class MyMindError extends Data.TaggedError("MyMindError")<{
  message: string;
  cause?: unknown;
}> {}

export type MyMindClientShape = {
  readonly createImageObject: (input: {
    readonly board: Board;
    readonly pin: Pin;
    readonly image: PinImage;
    readonly imageBytes: Uint8Array;
    readonly mimeType: string;
  }) => Effect.Effect<CreatedObject, MyMindError>;
  readonly addSourceNote: (input: {
    readonly objectId: string;
    readonly board: Board;
    readonly pin: Pin;
    readonly image: PinImage;
  }) => Effect.Effect<void, MyMindError>;
};

export class MyMindClient extends Context.Service<MyMindClient, MyMindClientShape>()(
  "MyMindClient",
) {}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64ToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

const decodeAccessKeySecret = (secret: Redacted.Redacted<string>) =>
  Effect.try({
    try: () => {
      const value = Redacted.value(secret).trim();
      if (
        value.length === 0 ||
        /\s/.test(value) ||
        !/^[A-Za-z0-9+/_-]*={0,2}$/.test(value) ||
        /=[^=]/.test(value) ||
        value.length % 4 === 1
      ) {
        throw new Error("MYMIND_ACCESS_KEY_SECRET must be valid base64");
      }
      const bytes = base64ToBytes(value);
      if (bytes.byteLength === 0) {
        throw new Error("MYMIND_ACCESS_KEY_SECRET must decode to bytes");
      }
      return bytes;
    },
    catch: (cause) => new MyMindError({ message: "Invalid mymind access key secret", cause }),
  });

const signJwt = (keyId: string, secret: Redacted.Redacted<string>, method: string, path: string) =>
  Effect.gen(function* () {
    const keyBytes = yield* decodeAccessKeySecret(secret);
    return yield* Effect.tryPromise({
      try: async () => {
      const now = Math.floor(Date.now() / 1000);
      const header = stringToBase64Url(JSON.stringify({ alg: "HS256", kid: keyId, typ: "JWT" }));
      const payload = stringToBase64Url(
        JSON.stringify({
          path,
          method: method.toUpperCase(),
          iat: now,
          exp: now + 300,
        }),
      );
      const signingInput = `${header}.${payload}`;
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signingInput),
      );
      return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
    },
    catch: (cause) => new MyMindError({ message: "Failed to sign mymind request", cause }),
    });
  }).pipe(Effect.withLogSpan("mymind.signJwt"), Effect.withSpan("mymind.signJwt"));

const pinUrl = (pin: Pin) => `https://www.pinterest.com/pin/${pin.id}/`;

const filenameForImage = (pin: Pin, mimeType: string) => {
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return `pinterest-${pin.id}.${extension}`;
};

export const mymindObjectTitle = (input: { readonly image: PinImage; readonly pin: Pin }) => {
  const title = input.image.title ?? input.pin.title ?? `Pinterest Pin ${input.pin.id}`;
  const characters = Array.from(title);
  if (characters.length <= maxTitleLength) {
    return title;
  }
  return `${characters.slice(0, maxTitleLength - 3).join("")}...`;
};

export const mymindImageObjectIssues = (input: {
  readonly image: PinImage;
  readonly pin: Pin;
  readonly imageBytes: Uint8Array;
  readonly mimeType: string;
  readonly spaceIds: ReadonlyArray<string>;
}): ReadonlyArray<MyMindRequestIssue> => {
  const issues: MyMindRequestIssue[] = [];
  const title = input.image.title ?? input.pin.title ?? `Pinterest Pin ${input.pin.id}`;
  const adjustedTitle = mymindObjectTitle(input);
  if (title !== adjustedTitle) {
    issues.push({
      code: "title_truncated",
      field: "title",
      message: "Title was shortened to fit mymind's 100 character limit.",
      original: title,
      adjusted: adjustedTitle,
    });
  }
  if (input.imageBytes.byteLength > maxUploadBytes) {
    issues.push({
      code: "upload_too_large",
      field: "blob",
      message: "Image exceeds mymind's 64 MB upload limit.",
      original: input.imageBytes.byteLength,
      adjusted: maxUploadBytes,
    });
  }
  if (!supportedUploadMimeTypes.has(input.mimeType)) {
    issues.push({
      code: "unsupported_mime_type",
      field: "blob",
      message: `mymind does not support ${input.mimeType} uploads.`,
      original: input.mimeType,
    });
  }
  for (const id of input.spaceIds) {
    const trimmed = id.trim();
    if (!mymindUidPattern.test(trimmed)) {
      issues.push({
        code: "invalid_space_id",
        field: "spaces",
        message: "Space IDs must be 22 base62 characters.",
        original: id,
      });
    }
  }
  return issues;
};

const tagName = (value: string) => value.trim();

const spaceReference = (id: string) =>
  Effect.sync(() => id.trim()).pipe(
    Effect.flatMap((id) =>
      mymindUidPattern.test(id)
        ? Effect.succeed(id)
        : Effect.fail(
            new MyMindError({
              message: `Invalid mymind space id "${id}": expected 22 base62 characters`,
            }),
          ),
    ),
    Effect.map((id) => ({ id })),
  );

const validateUpload = (input: { readonly imageBytes: Uint8Array; readonly mimeType: string }) =>
  input.imageBytes.byteLength > maxUploadBytes
    ? Effect.fail(
        new MyMindError({
          message: `mymind upload is too large: ${input.imageBytes.byteLength} bytes exceeds 64 MB`,
        }),
      )
    : !supportedUploadMimeTypes.has(input.mimeType)
      ? Effect.fail(
          new MyMindError({
            message: `Unsupported mymind upload content type: ${input.mimeType}`,
          }),
        )
      : Effect.void;

const requestMyMind = (
  config: AppConfigShape,
  method: string,
  path: string,
  init: Omit<RequestInit, "method">,
) =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Signing mymind ${method} ${path} request`);
    const token = yield* signJwt(
      config.mymindAccessKeyId,
      config.mymindAccessKeySecret,
      method,
      path,
    );
    yield* Effect.logDebug(`Sending mymind ${method} ${path} request`);
    const response = yield* Effect.tryPromise({
      try: async () => {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${token}`);
        headers.set("User-Agent", config.mymindUserAgent);
        const response = await fetch(`${mymindApiUrl}${path}`, {
          ...init,
          method,
          headers,
        });
        const contentType = response.headers.get("content-type") ?? "";
        const body = contentType.includes("json")
          ? await response.json().catch(() => undefined)
          : await response.text().catch(() => undefined);
        if (!response.ok) {
          throw new MyMindError({
            message: `mymind request failed: ${response.status} ${response.statusText}`,
            cause: body,
          });
        }
        return body;
      },
      catch: (cause) =>
        cause instanceof MyMindError
          ? cause
          : new MyMindError({ message: "mymind request failed", cause }),
    });
    yield* Effect.logDebug(`mymind ${method} ${path} request succeeded`);
    return response;
  }).pipe(
    Effect.withLogSpan(`mymind.request:${method}:${path}`),
    Effect.withSpan("mymind.request", { attributes: { method, path } }),
  );

const decodeObject = Schema.decodeUnknownEffect(MyMindObject);

const noteForPin = (board: Board, pin: Pin, image: PinImage) => {
  const lines = [`Pinterest board: ${board.name}`, `Pinterest pin: ${pinUrl(pin)}`];
  if (pin.link) {
    lines.push(`Original link: ${pin.link}`);
  }
  if (image.description) {
    lines.push("", image.description);
  }
  return lines.join("\n");
};

export const MyMindClientLive = Layer.effect(
  MyMindClient,
  Effect.gen(function* () {
    const config = yield* AppConfig;

    return MyMindClient.of({
      createImageObject: (input) =>
        Effect.gen(function* () {
          yield* validateUpload(input);
          yield* Effect.logDebug(
            `Preparing mymind object metadata for pin ${input.pin.id} in board "${input.board.name}"`,
          );
          const spaces = yield* Effect.all(config.mymindSpaceIds.map(spaceReference));
          const metadata = {
            title: mymindObjectTitle(input),
            tags: [
              ...config.mymindTags
                .map(tagName)
                .filter((name) => name.length > 0)
                .map((name) => ({ name })),
              { name: `pinterest:${input.board.name}` },
              { name: `pinterest-pin:${input.pin.id}` },
            ],
            spaces,
          };
          const form = new FormData();
          form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
          const imageBuffer = input.imageBytes.buffer.slice(
            input.imageBytes.byteOffset,
            input.imageBytes.byteOffset + input.imageBytes.byteLength,
          ) as ArrayBuffer;
          form.set(
            "blob",
            new Blob([imageBuffer], { type: input.mimeType }),
            filenameForImage(input.pin, input.mimeType),
          );
          const body = yield* requestMyMind(config, "POST", "/objects", { body: form });
          const object = yield* decodeObject(body).pipe(
            Effect.mapError(
              (cause) =>
                new MyMindError({
                  message: "mymind object response did not match the expected shape",
                  cause,
                }),
            ),
          );
          yield* Effect.logDebug(`Decoded mymind object ${object.id} for pin ${input.pin.id}`);
          return object;
        }).pipe(
          Effect.withLogSpan("mymind.createImageObject"),
          Effect.withSpan("mymind.createImageObject", {
            attributes: {
              boardId: input.board.id,
              pinId: input.pin.id,
              mimeType: input.mimeType,
            },
          }),
        ),
      addSourceNote: (input) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Preparing source note for mymind object ${input.objectId}`);
          yield* requestMyMind(
            config,
            "POST",
            `/objects/${encodeURIComponent(input.objectId)}/notes`,
            {
              headers: { "Content-Type": "text/markdown" },
              body: noteForPin(input.board, input.pin, input.image),
            },
          );
          yield* Effect.logDebug(`Source note request succeeded for mymind object ${input.objectId}`);
        }).pipe(
          Effect.withLogSpan("mymind.addSourceNote"),
          Effect.withSpan("mymind.addSourceNote", {
            attributes: {
              objectId: input.objectId,
              boardId: input.board.id,
              pinId: input.pin.id,
            },
          }),
        ),
    });
  }),
);
