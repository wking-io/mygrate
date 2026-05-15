import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Layer, Redacted } from "effect";

import { AppConfig, type AppConfigShape } from "../core/Config.ts";

export const testConfig = (overrides: Partial<AppConfigShape> = {}): AppConfigShape => ({
  pinterestAccessToken: Redacted.make("pinterest-token"),
  pinterestBoardIds: [],
  pinterestBoardPrivacy: undefined,
  pinterestPageSize: 250,
  pinterestMaxPins: undefined,
  mymindAccessKeyId: "mymind-key-id",
  mymindAccessKeySecret: Redacted.make(
    Buffer.from("mymind-secret-for-tests").toString("base64"),
  ),
  mymindSpaceIds: [],
  mymindTags: ["pinterest"],
  mymindUserAgent: "mygrate-test",
  dryRun: false,
  ...overrides,
});

export const testConfigLayer = (overrides: Partial<AppConfigShape> = {}) =>
  Layer.succeed(AppConfig, AppConfig.of(testConfig(overrides)));

export const withTempMigratedPinsPath = async <A>(run: (path: string) => Promise<A>) => {
  const previous = process.env.MIGRATED_PINS_PATH;
  const dir = await mkdtemp(join(tmpdir(), "mygrate-test-"));
  const path = join(dir, "nested", "migrated-pins.json");
  process.env.MIGRATED_PINS_PATH = path;
  try {
    return await run(path);
  } finally {
    if (previous === undefined) {
      delete process.env.MIGRATED_PINS_PATH;
    } else {
      process.env.MIGRATED_PINS_PATH = previous;
    }
    await rm(dir, { force: true, recursive: true });
  }
};
