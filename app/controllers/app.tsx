import type { BuildAction } from "remix/fetch-router";

import type { routes } from "../routes.ts";
import { Document } from "../ui/document.tsx";
import { PickerApp } from "../ui/picker-app.tsx";
import { render } from "../utils/render.tsx";

export const app: BuildAction<"GET", typeof routes.home> = {
  handler({ request }) {
    return render(
      <Document title="mygrate">
        <PickerApp />
      </Document>,
      request,
    );
  },
};
