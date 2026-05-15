import { ManagedRuntime } from "effect";

import { PickerLive } from "../../core/Runtime.ts";

export const pickerRuntime = ManagedRuntime.make(PickerLive);

export const closePickerRuntime = () => pickerRuntime.dispose();
