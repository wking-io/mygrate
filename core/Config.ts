import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const optionalCsv = (name: string) =>
  Config.string(name).pipe(
    Config.withDefault(""),
    Config.map((value) => csv(value)),
  );

const positiveInteger = (name: string, fallback: number) =>
  Config.int(name).pipe(
    Config.withDefault(fallback),
    Config.map((value) => Math.max(1, value)),
  );

export type AppConfigShape = {
  readonly pinterestAccessToken: Redacted.Redacted<string>;
  readonly pinterestBoardIds: ReadonlyArray<string>;
  readonly pinterestBoardPrivacy: string | undefined;
  readonly pinterestPageSize: number;
  readonly pinterestMaxPins: number | undefined;
  readonly mymindAccessKeyId: string;
  readonly mymindAccessKeySecret: Redacted.Redacted<string>;
  readonly mymindSpaceIds: ReadonlyArray<string>;
  readonly mymindTags: ReadonlyArray<string>;
  readonly mymindUserAgent: string;
  readonly dryRun: boolean;
};

const AppConfigConfig = Config.all({
  pinterestAccessToken: Config.redacted("PINTEREST_ACCESS_TOKEN"),
  pinterestBoardIds: optionalCsv("PINTEREST_BOARD_IDS"),
  pinterestBoardPrivacy: Config.string("PINTEREST_BOARD_PRIVACY").pipe(
    Config.withDefault(""),
    Config.map((value) => value.trim().toUpperCase() || undefined),
  ),
  pinterestPageSize: positiveInteger("PINTEREST_PAGE_SIZE", 250).pipe(
    Config.map((value) => Math.min(value, 250)),
  ),
  pinterestMaxPins: Config.int("PINTEREST_MAX_PINS").pipe(Config.option),
  mymindAccessKeyId: Config.string("MYMIND_ACCESS_KEY_ID"),
  mymindAccessKeySecret: Config.redacted("MYMIND_ACCESS_KEY_SECRET"),
  mymindSpaceIds: optionalCsv("MYMIND_SPACE_IDS"),
  mymindTags: optionalCsv("MYMIND_TAGS").pipe(
    Config.map((tags) => (tags.length > 0 ? tags : ["pinterest"])),
  ),
  mymindUserAgent: Config.string("MYMIND_USER_AGENT").pipe(
    Config.withDefault("mygrate/0.1"),
  ),
  dryRun: Config.string("DRY_RUN").pipe(
    Config.withDefault(""),
    Config.map((value) => ["1", "true", "yes"].includes(value.toLowerCase())),
  ),
});

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()("AppConfig") {}

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const config = yield* AppConfigConfig;
    return AppConfig.of({
      ...config,
      pinterestMaxPins: Option.getOrUndefined(config.pinterestMaxPins),
    });
  }),
);
