# mygrate Agent Guide

This app uses the Remix 3 beta scaffold shape from `remix new`, adapted for mygrate's local picker.

## Commands

```sh
bun install
bun run dev
bun run start
bun run sync
bun run typecheck
```

## Building Remix Features

Refer to `.agents/skills/remix/SKILL.md` for Remix 3 beta conventions.

## App Layout

- `app/routes.ts` defines the route contract.
- `app/router.ts` wires routes to route handlers.
- `app/controllers/app.tsx` owns the picker page render.
- `app/controllers/api.ts` owns the picker JSON API routes.
- `app/services/picker-runtime.ts` owns the Effect runtime used by the web app.
- `app/ui/picker-app.tsx` owns the interactive picker surface.
- `app/ui/document.tsx` owns the HTML document wrapper.
- `app/assets/entry.ts` starts Remix browser hydration.
- `app/assets/styles.css` owns picker styling.
- `app/utils/render.tsx` centralizes HTML response rendering.
- `core/` holds shared import, sync, config, Pinterest, mymind, and local migrated-pin storage logic.

## Route Ownership

- Start from `app/routes.ts` and map each route to the narrowest owner on disk.
- Keep route handlers in `app/controllers/`.
- Move shared UI to `app/ui/`, not `app/controllers/`.
- Keep Pinterest, mymind, sync, and import behavior in `core/` unless it is genuinely web-only.

## Notes

- The web server runs through Node via `tsx` because `remix/node-serve` depends on Node-compatible native serving pieces.
- The package manager is still Bun.
- Migrated pin IDs are local-only and stored in `.data/migrated-pins.json` by default.
