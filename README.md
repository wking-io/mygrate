# mygrate

Pull Pins from Pinterest boards, download their images, and upload those images to mymind.

The visual picker is a local Remix app in `app/`. Shared import, sync, Pinterest, mymind, config, and local storage logic lives in `core/`.

## Prerequisites

- Bun `1.3.8` or newer.
- Node.js `24.3.0` or newer.
- A Pinterest API v5 access token with `boards:read` and `pins:read`.
- A mymind access key ID and secret.

The package manager is Bun, but the Remix web server runs through Node via `tsx` because `remix/node-serve` expects a Node runtime.

## Local Setup

1. Clone the repo and enter it:

```sh
git clone https://github.com/wking-io/mygrate.git
cd mygrate
```

2. Install dependencies:

```sh
bun install
```

3. Create your local environment file:

```sh
cp .env.example .env
```

4. Fill in the required values in `.env`:

```sh
PINTEREST_ACCESS_TOKEN=
MYMIND_ACCESS_KEY_ID=
MYMIND_ACCESS_KEY_SECRET=
```

`MYMIND_ACCESS_KEY_SECRET` should be the base64-encoded mymind access key secret.

5. Optionally limit the import while testing:

```sh
DRY_RUN=1
PINTEREST_MAX_PINS=5
```

`DRY_RUN=1` lets you exercise the flow without writing to mymind.

## Environment Variables

Required:

- `PINTEREST_ACCESS_TOKEN`: Pinterest API v5 bearer token with `boards:read` and `pins:read`.
- `MYMIND_ACCESS_KEY_ID`: mymind access key `kid`.
- `MYMIND_ACCESS_KEY_SECRET`: mymind base64-encoded access key secret.

Optional:

- `DRY_RUN`: set to `1`, `true`, or `yes` to list import work without writing to mymind.
- `LOG_LEVEL`: set to `debug` to show detailed span-tagged import logs. Defaults to `info`.
- `PORT`: local Remix picker port. Defaults to `3421`.

## Run The Visual Picker

Start the local picker:

```sh
bun run picker
```

Then open:

```text
http://localhost:3421
```

Use the picker to choose a board, select Pins, and import them. Imported Pin IDs are stored locally in `.data/migrated-pins.json` by default. The picker hides migrated Pins unless you switch the filter to `Migrated` or `All`.

For UI development, use the watched server:

```sh
bun run dev
```

## Run The CLI Sync

To import from configured boards without using the picker:

```sh
bun run sync
```

When `PINTEREST_BOARD_IDS` is unset, the sync visits every accessible board. Use `PINTEREST_MAX_PINS` and `DRY_RUN=1` when testing against real accounts.

## Test

Run the offline test suite:

```sh
bun run test
```

Run TypeScript checks:

```sh
bun run typecheck
```

Before opening a PR or publishing changes, run both:

```sh
bun run typecheck
bun run test
```

The tests mock external network calls, so they should not write to Pinterest or mymind.

## Debug Import Failures

The import route emits span-tagged logs around the import pipeline. To see detailed logs:

```sh
LOG_LEVEL=debug bun run picker
```

For a no-write smoke test:

```sh
DRY_RUN=1 LOG_LEVEL=debug bun run picker
```

When import fails, look for the shared `requestId` in the server output. The logs show each stage:

- `api.import.decodePayload`: validates the selected board and Pin IDs from the browser.
- `api.import`: resolves the board, fetches Pins from Pinterest, imports images, and writes migrated IDs.
- `import.pins`: loops through selected Pins and image candidates.
- `import.pin:<pinId>`: imports one Pin image.
- `import.downloadImage`: downloads the image from Pinterest's image CDN.
- `mymind.createImageObject`: creates the image object in mymind.
- `mymind.addSourceNote`: adds the Pinterest source note to the mymind object.
- `mymind.request:<method>:<path>`: sends the signed mymind API request.

If the UI only shows a short error, the server log line with the same `requestId` includes the full error object.

## Project Structure

- `app/`: Remix web app, routes, controllers, rendering, browser entrypoint, and picker UI.
- `core/`: shared business logic and integrations used by both the picker and CLI sync.
- `test/`: offline tests for storage, clients, importing, sync behavior, and Remix routing.
- `.data/`: local-only runtime state. This is gitignored.
- `.agents/skills/remix/`: Remix 3 beta guidance from the official scaffold.

## Local Migrated Pin Storage

The picker records successfully imported non-dry-run Pin IDs in:

```text
.data/migrated-pins.json
```

The file shape is:

```json
{
  "migratedPinIds": ["439804719884798227"]
}
```

This file is intentionally local-only and ignored by git. To use a different path, set `MIGRATED_PINS_PATH`.

## Troubleshooting

If the picker fails to start because the port is in use, choose another port:

```sh
PORT=3422 bun run picker
```

If the picker reports an authentication or config error, check that `.env` exists and contains the three required credential values.

If you are testing import behavior for the first time, start with:

```sh
DRY_RUN=1 PINTEREST_MAX_PINS=5 bun run sync
```
