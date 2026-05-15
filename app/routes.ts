import { get, post, route } from "remix/fetch-router/routes";

export const routes = route({
  assets: get("/assets/*path"),
  boards: get("/api/boards"),
  pins: get("/api/boards/:boardId/pins"),
  importPins: post("/api/import"),
  home: "/",
});
