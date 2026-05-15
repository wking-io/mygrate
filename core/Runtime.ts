import { Layer } from "effect";

import { AppConfigLive } from "./Config";
import { ImportServiceLive } from "./ImportService";
import { MigratedPinsStoreLive } from "./MigratedPinsStore";
import { MyMindClientLive } from "./MyMindClient";
import { PinterestClientLive } from "./PinterestClient";
import { MygrateSyncLive } from "./Sync";

const ClientsLive = Layer.mergeAll(PinterestClientLive, MyMindClientLive);

export const ImportLive = ImportServiceLive.pipe(
  Layer.provide(ClientsLive),
  Layer.provide(AppConfigLive),
);

export const PickerLive = Layer.mergeAll(
  ClientsLive,
  MigratedPinsStoreLive,
  ImportServiceLive.pipe(Layer.provide(ClientsLive)),
).pipe(Layer.provide(AppConfigLive));

export const AppLive = MygrateSyncLive.pipe(
  Layer.provide(ImportServiceLive),
  Layer.provide(ClientsLive),
  Layer.provide(AppConfigLive),
);
