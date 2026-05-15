# Pinterest to mymind

Pulls Pins from Pinterest boards, downloads their images, and uploads those images to mymind.

## Setup

Copy `.env.example` to `.env`, then fill in your Pinterest trial token and mymind access key values.

## Required environment

- `PINTEREST_ACCESS_TOKEN`: Pinterest API v5 bearer token with `boards:read` and `pins:read`.
- `MYMIND_ACCESS_KEY_ID`: mymind access key `kid`.
- `MYMIND_ACCESS_KEY_SECRET`: mymind base64-encoded access key secret.

## Optional environment

- `PINTEREST_BOARD_IDS`: comma-separated Pinterest board IDs. When omitted, all accessible boards are synced.
- `PINTEREST_BOARD_PRIVACY`: one of `PUBLIC`, `PROTECTED`, or `SECRET` when listing boards.
- `MYMIND_SPACE_IDS`: comma-separated mymind space IDs to add uploaded images to.
- `MYMIND_TAGS`: comma-separated tags added to every uploaded image. Defaults to `pinterest`.
- `MYMIND_USER_AGENT`: user agent sent to mymind. Defaults to `creative-agent-pinterest-mymind/0.1`.
- `PINTEREST_PAGE_SIZE`: page size for Pinterest pagination. Defaults to `250`.
- `PINTEREST_MAX_PINS`: stop after this many Pins across all boards.
- `DRY_RUN`: set to `1` to list work without writing to mymind.

## Run

```sh
bun run sync
```

## Visual picker

```sh
bun run picker
```

Then open `http://localhost:3421`. Set `PICKER_PORT` to use another port.
