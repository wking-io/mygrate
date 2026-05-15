import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";

import { PinterestClient, PinterestClientLive, type Pin } from "../core/PinterestClient.ts";
import { testConfigLayer } from "./helpers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const runPinterest = <A>(effect: Effect.Effect<A, unknown, PinterestClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(PinterestClientLive), Effect.provide(testConfigLayer())));

describe("PinterestClient", () => {
  test("collects paginated board responses and sends page size", async () => {
    const seenUrls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      seenUrls.push(url);
      const bookmark = new URL(url).searchParams.get("bookmark");
      return Response.json(
        bookmark
          ? { items: [{ id: "board-2", name: "Board 2" }], bookmark: null }
          : { items: [{ id: "board-1", name: "Board 1" }], bookmark: "next-page" },
      );
    }) as unknown as typeof fetch;

    const boards = await runPinterest(PinterestClient.use((client) => client.listBoards));

    expect(boards.map((board) => board.id)).toEqual(["board-1", "board-2"]);
    expect(seenUrls).toHaveLength(2);
    expect(new URL(seenUrls[0]).searchParams.get("page_size")).toBe("250");
    expect(new URL(seenUrls[1]).searchParams.get("bookmark")).toBe("next-page");
  });

  test("extracts the best image candidate from a single image pin", async () => {
    const images = await runPinterest(
      PinterestClient.use((client) =>
        Effect.succeed(
          client.imageCandidates({
            id: "pin-1",
            title: "Pin title",
            description: null,
            alt_text: "Alt fallback",
            media: {
              media_type: "image",
              images: {
                "150x150": { url: "small.jpg", width: 150, height: 150 },
                "600x": { url: "large.jpg", width: 600, height: 600 },
              },
            },
          } satisfies Pin),
        ),
      ),
    );

    expect(images).toEqual([
      {
        url: "large.jpg",
        title: "Pin title",
        description: "Alt fallback",
      },
    ]);
  });

  test("extracts image candidates from multi-image pins and skips items without images", async () => {
    const images = await runPinterest(
      PinterestClient.use((client) =>
        Effect.succeed(
          client.imageCandidates({
            id: "pin-1",
            title: "Parent title",
            description: "Parent description",
            media: {
              media_type: "multiple_images",
              items: [
                {
                  title: "Child title",
                  description: null,
                  images: { "400x300": { url: "child.jpg", width: 400, height: 300 } },
                },
                { title: "Missing image", description: "Skip me" },
              ],
            },
          } satisfies Pin),
        ),
      ),
    );

    expect(images).toEqual([
      {
        url: "child.jpg",
        title: "Child title",
        description: "Parent description",
      },
    ]);
  });
});
