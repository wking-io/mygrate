import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, test } from "bun:test";
import { Effect } from "effect";

import { MigratedPinsStore, MigratedPinsStoreLive } from "../core/MigratedPinsStore.ts";
import { withTempMigratedPinsPath } from "./helpers.ts";

const runStore = <A>(effect: Effect.Effect<A, unknown, MigratedPinsStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(MigratedPinsStoreLive)));

describe("MigratedPinsStore", () => {
  test("returns an empty set when the local JSON file does not exist", async () => {
    await withTempMigratedPinsPath(async () => {
      const ids = await runStore(MigratedPinsStore.use((store) => store.list));
      expect(Array.from(ids)).toEqual([]);
    });
  });

  test("deduplicates ids and persists them in stable sorted order", async () => {
    await withTempMigratedPinsPath(async (path) => {
      const ids = await runStore(
        MigratedPinsStore.use((store) => store.addMany(["pin-b", "pin-a", "pin-b"])),
      );

      expect(Array.from(ids).sort()).toEqual(["pin-a", "pin-b"]);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        migratedPinIds: ["pin-a", "pin-b"],
      });
    });
  });

  test("preserves existing ids when adding more ids", async () => {
    await withTempMigratedPinsPath(async (path) => {
      await runStore(MigratedPinsStore.use((store) => store.addMany(["pin-a"])));
      await runStore(MigratedPinsStore.use((store) => store.addMany(["pin-c", "pin-a"])));

      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        migratedPinIds: ["pin-a", "pin-c"],
      });
    });
  });

  test("fails clearly when the JSON file is malformed", async () => {
    await withTempMigratedPinsPath(async (path) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "{not json");

      await expect(
        runStore(MigratedPinsStore.use((store) => store.list)),
      ).rejects.toMatchObject({
        message: expect.stringContaining("Failed to parse migrated pins"),
      });
    });
  });
});
