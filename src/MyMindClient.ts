import { Context, Data, Effect, Layer, Redacted, Schema } from "effect";

import { AppConfig } from "./Config";
import type { AppConfigShape } from "./Config";
import type { Board, Pin, PinImage } from "./PinterestClient";

const mymindApiUrl = "https://api.mymind.com";

const MyMindObject = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
});

type CreatedObject = typeof MyMindObject.Type;

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

const signJwt = (keyId: string, secret: Redacted.Redacted<string>, method: string, path: string) =>
  Effect.tryPromise({
    try: async () => {
      const now = Math.floor(Date.now() / 1000);
      const header = stringToBase64Url(JSON.stringify({ alg: "HS256", kid: keyId, typ: "JWT" }));
      const payload = stringToBase64Url(
        JSON.stringify({
          path,
          method,
          iat: now,
          exp: now + 300,
        }),
      );
      const signingInput = `${header}.${payload}`;
      const key = await crypto.subtle.importKey(
        "raw",
        base64ToBytes(Redacted.value(secret)),
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

const pinUrl = (pin: Pin) => `https://www.pinterest.com/pin/${pin.id}/`;

const filenameForImage = (pin: Pin, mimeType: string) => {
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return `pinterest-${pin.id}.${extension}`;
};

const requestMyMind = (
  config: AppConfigShape,
  method: string,
  path: string,
  init: Omit<RequestInit, "method">,
) =>
  Effect.gen(function* () {
    const token = yield* signJwt(
      config.mymindAccessKeyId,
      config.mymindAccessKeySecret,
      method,
      path,
    );
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
    return response;
  });

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
          const metadata = {
            title: input.image.title ?? input.pin.title ?? `Pinterest Pin ${input.pin.id}`,
            tags: [
              ...config.mymindTags.map((name) => ({ name })),
              { name: `pinterest:${input.board.name}` },
              { name: `pinterest-pin:${input.pin.id}` },
            ],
            spaces: config.mymindSpaceIds.map((id) => ({ id })),
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
          return yield* decodeObject(body).pipe(
            Effect.mapError(
              (cause) =>
                new MyMindError({
                  message: "mymind object response did not match the expected shape",
                  cause,
                }),
            ),
          );
        }),
      addSourceNote: (input) =>
        requestMyMind(config, "POST", `/objects/${encodeURIComponent(input.objectId)}/notes`, {
          headers: { "Content-Type": "text/markdown" },
          body: noteForPin(input.board, input.pin, input.image),
        }).pipe(Effect.asVoid),
    });
  }),
);
