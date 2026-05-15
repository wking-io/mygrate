import { Effect, Layer } from "effect";

import { AppConfigLive } from "./Config";
import { ImportServiceLive } from "./ImportService";
import { MyMindClientLive } from "./MyMindClient";
import { PinterestClientLive } from "./PinterestClient";
import { MygrateSync, MygrateSyncLive } from "./Sync";

const ClientsLive = Layer.mergeAll(PinterestClientLive, MyMindClientLive);

const AppLive = MygrateSyncLive.pipe(
  Layer.provide(ImportServiceLive),
  Layer.provide(ClientsLive),
  Layer.provide(AppConfigLive),
);

const main = Effect.gen(function* () {
  const sync = yield* MygrateSync;
  yield* sync.run;
});

Effect.runPromise(main.pipe(Effect.provide(AppLive))).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
