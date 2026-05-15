import type { BuildAction } from "remix/fetch-router";

import type { routes } from "../routes.ts";
import { Document } from "../ui/document.tsx";
import { PickerApp } from "../ui/picker-app.tsx";
import { render } from "../utils/render.tsx";

export const app: BuildAction<"GET", typeof routes.home> = {
  handler({ request }) {
    return renderApp(request);
  },
};

export const board: BuildAction<"GET", typeof routes.board> = {
  handler({ request, params }) {
    return renderApp(request, params.boardId);
  },
};

function renderApp(request: Request, selectedBoardId?: string) {
    return render(
      <Document title="mygrate">
        <PickerApp selectedBoardId={selectedBoardId} />
      </Document>,
      request,
    );
}
