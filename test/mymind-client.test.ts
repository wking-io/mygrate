import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";

import { MyMindClient, MyMindClientLive } from "../core/MyMindClient.ts";
import type { Board, Pin, PinImage } from "../core/PinterestClient.ts";
import { testConfigLayer } from "./helpers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const board = { id: "board-1", name: "Board One" } satisfies Board;
const pin = {
  id: "pin-1",
  title: "Pin title",
  link: "https://source.example/article",
} satisfies Pin;
const image = {
  url: "https://images.example/pin.jpg",
  title: "Image title",
  description: "Image description",
} satisfies PinImage;

const runMyMind = <A>(
  effect: Effect.Effect<A, unknown, MyMindClient>,
  overrides: Parameters<typeof testConfigLayer>[0] = {},
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(MyMindClientLive),
      Effect.provide(
        testConfigLayer({
          mymindSpaceIds: ["A1B2c3D4e5F6g7H8i9J0K1"],
          mymindTags: ["pinterest", "archive"],
          ...overrides,
        }),
      ),
    ),
  );

describe("MyMindClient", () => {
  test("creates image objects with metadata, file content, and signed auth", async () => {
    let captured: {
      url: string;
      method: string | undefined;
      authorization: string | null;
      userAgent: string | null;
      metadata: unknown;
      filename: string | undefined;
      blobType: string | undefined;
      blobSize: number | undefined;
    } | undefined;

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = init?.body as FormData;
      const metadata = body.get("metadata");
      const blob = body.get("blob") as File;
      captured = {
        url: input.toString(),
        method: init?.method,
        authorization: new Headers(init?.headers).get("authorization"),
        userAgent: new Headers(init?.headers).get("user-agent"),
        metadata: JSON.parse(await (metadata as Blob).text()),
        filename: blob.name,
        blobType: blob.type,
        blobSize: blob.size,
      };
      return Response.json({ id: "object-1", title: "Created" });
    }) as unknown as typeof fetch;

    const object = await runMyMind(
      MyMindClient.use((client) =>
        client.createImageObject({
          board,
          pin,
          image,
          imageBytes: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
        }),
      ),
    );

    expect(object).toEqual({ id: "object-1", title: "Created" });
    expect(captured).toMatchObject({
      url: "https://api.mymind.com/objects",
      method: "POST",
      userAgent: "mygrate-test",
      filename: "pinterest-pin-1.png",
      blobType: "image/png",
      blobSize: 3,
      metadata: {
        title: "Image title",
        tags: [
          { name: "pinterest" },
          { name: "archive" },
          { name: "pinterest:Board One" },
          { name: "pinterest-pin:pin-1" },
        ],
        spaces: [{ id: "A1B2c3D4e5F6g7H8i9J0K1" }],
      },
    });
    expect(captured?.authorization).toStartWith("Bearer ");
  });

  test("truncates object titles to mymind's 100 character limit", async () => {
    let capturedTitle: string | undefined;
    const longTitle = "A".repeat(120);

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = init?.body as FormData;
      const metadata = body.get("metadata");
      capturedTitle = JSON.parse(await (metadata as Blob).text()).title;
      return Response.json({ id: "object-1", title: "Created" });
    }) as unknown as typeof fetch;

    await runMyMind(
      MyMindClient.use((client) =>
        client.createImageObject({
          board,
          pin,
          image: { ...image, title: longTitle },
          imageBytes: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
        }),
      ),
    );

    expect(capturedTitle).toHaveLength(100);
    expect(capturedTitle).toBe(`${"A".repeat(97)}...`);
  });

  test("rejects unsupported upload content types before calling mymind", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ id: "object-1" });
    }) as unknown as typeof fetch;

    await expect(
      runMyMind(
        MyMindClient.use((client) =>
          client.createImageObject({
            board,
            pin,
            image,
            imageBytes: new Uint8Array([1, 2, 3]),
            mimeType: "image/x-png",
          }),
        ),
      ),
    ).rejects.toThrow("Unsupported mymind upload content type: image/x-png");
    expect(called).toBe(false);
  });

  test("rejects uploads over mymind's 64 MB limit before calling mymind", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ id: "object-1" });
    }) as unknown as typeof fetch;

    await expect(
      runMyMind(
        MyMindClient.use((client) =>
          client.createImageObject({
            board,
            pin,
            image,
            imageBytes: new Uint8Array(64 * 1024 * 1024 + 1),
            mimeType: "image/png",
          }),
        ),
      ),
    ).rejects.toThrow("mymind upload is too large");
    expect(called).toBe(false);
  });

  test("rejects invalid space ids before calling mymind", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ id: "object-1" });
    }) as unknown as typeof fetch;

    await expect(
      runMyMind(
        MyMindClient.use((client) =>
          client.createImageObject({
            board,
            pin,
            image,
            imageBytes: new Uint8Array([1, 2, 3]),
            mimeType: "image/png",
          }),
        ),
        { mymindSpaceIds: ["not-a-mymind-id"] },
      ),
    ).rejects.toThrow('Invalid mymind space id "not-a-mymind-id"');
    expect(called).toBe(false);
  });

  test("adds a markdown source note with board, pin, original link, and description", async () => {
    let captured: {
      url: string;
      method: string | undefined;
      contentType: string | null;
      body: string | undefined;
    } | undefined;

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      captured = {
        url: input.toString(),
        method: init?.method,
        contentType: new Headers(init?.headers).get("content-type"),
        body: init?.body?.toString(),
      };
      return new Response("", { status: 204 });
    }) as unknown as typeof fetch;

    await runMyMind(
      MyMindClient.use((client) =>
        client.addSourceNote({
          objectId: "object-1",
          board,
          pin,
          image,
        }),
      ),
    );

    expect(captured).toEqual({
      url: "https://api.mymind.com/objects/object-1/notes",
      method: "POST",
      contentType: "text/markdown",
      body: [
        "Pinterest board: Board One",
        "Pinterest pin: https://www.pinterest.com/pin/pin-1/",
        "Original link: https://source.example/article",
        "",
        "Image description",
      ].join("\n"),
    });
  });
});
