import { Layer } from "effect";

import { AppConfigLive } from "./Config";
import { ImportServiceLive } from "./ImportService";
import { MyMindClientLive } from "./MyMindClient";
import { PinterestClientLive } from "./PinterestClient";
import { PinterestMyMindSyncLive } from "./Sync";

const ClientsLive = Layer.mergeAll(PinterestClientLive, MyMindClientLive);

export const ImportLive = ImportServiceLive.pipe(
  Layer.provide(ClientsLive),
  Layer.provide(AppConfigLive),
);

export const PickerLive = Layer.mergeAll(
  ClientsLive,
  ImportServiceLive.pipe(Layer.provide(ClientsLive)),
).pipe(Layer.provide(AppConfigLive));

export const AppLive = PinterestMyMindSyncLive.pipe(
  Layer.provide(ImportServiceLive),
  Layer.provide(ClientsLive),
  Layer.provide(AppConfigLive),
);
