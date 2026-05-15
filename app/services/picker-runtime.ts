import { Effect, ManagedRuntime, References } from "effect";

import { ImportService } from "../../core/ImportService.ts";
import { MigratedPinsStore } from "../../core/MigratedPinsStore.ts";
import { MyMindClient } from "../../core/MyMindClient.ts";
import { PinterestClient } from "../../core/PinterestClient.ts";
import { PickerLive } from "../../core/Runtime.ts";

export const pickerRuntime = ManagedRuntime.make(PickerLive);

export const closePickerRuntime = () => pickerRuntime.dispose();

const logLevelFromEnv = () => {
  switch ((process.env.LOG_LEVEL ?? "").toLowerCase()) {
    case "all":
      return "All";
    case "trace":
      return "Trace";
    case "debug":
      return "Debug";
    case "info":
      return "Info";
    case "warn":
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    case "fatal":
      return "Fatal";
    case "off":
      return "None";
    default:
      return "Info";
  }
};

export const runPickerEffect = <A, E, R>(
  effect: Effect.Effect<
    A,
    E,
    R & (PinterestClient | MyMindClient | ImportService | MigratedPinsStore)
  >,
  annotations: Record<string, unknown> = {},
) =>
  pickerRuntime.runPromise(
    effect.pipe(
      Effect.annotateLogs(annotations),
      Effect.provideService(References.MinimumLogLevel, logLevelFromEnv()),
    ),
  );
