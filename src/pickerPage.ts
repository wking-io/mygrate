export const pickerPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pinterest to mymind</title>
    <style>
      :root {
        color-scheme: light;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f5f2;
        color: #191817;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.85), rgba(247, 245, 242, 0.94)),
          #f7f5f2;
      }

      button {
        font: inherit;
      }

      .app {
        display: grid;
        grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
        min-height: 100vh;
      }

      .sidebar {
        border-right: 1px solid #ded8d0;
        background: rgba(255, 255, 255, 0.72);
        padding: 24px 18px;
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 22px;
      }

      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.1;
        font-weight: 760;
      }

      .status-pill {
        border: 1px solid #d4ccc2;
        border-radius: 999px;
        color: #6b6258;
        font-size: 12px;
        line-height: 1;
        padding: 7px 10px;
        white-space: nowrap;
      }

      .board-list {
        display: grid;
        gap: 8px;
      }

      .board-button {
        width: 100%;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: #312c28;
        cursor: pointer;
        display: grid;
        gap: 4px;
        padding: 11px 12px;
        text-align: left;
      }

      .board-button:hover {
        background: #eee9e3;
      }

      .board-button[aria-pressed="true"] {
        background: #181715;
        color: #fffaf2;
      }

      .board-id {
        color: #7a7167;
        font-size: 12px;
      }

      .board-button[aria-pressed="true"] .board-id {
        color: #c7c0b8;
      }

      .main {
        min-width: 0;
        padding: 22px 28px 36px;
      }

      .toolbar {
        align-items: center;
        border-bottom: 1px solid #ded8d0;
        display: flex;
        gap: 12px;
        justify-content: space-between;
        min-height: 66px;
        padding-bottom: 18px;
      }

      .title-block {
        min-width: 0;
      }

      h2 {
        font-size: 18px;
        line-height: 1.2;
        margin: 0 0 4px;
      }

      .muted {
        color: #6b6258;
        font-size: 13px;
      }

      .actions {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        justify-content: flex-end;
      }

      .action-button {
        border: 1px solid #181715;
        border-radius: 8px;
        background: #181715;
        color: white;
        cursor: pointer;
        min-height: 38px;
        padding: 0 14px;
      }

      .action-button.secondary {
        background: transparent;
        color: #181715;
      }

      .action-button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .message {
        color: #5f574e;
        font-size: 14px;
        margin: 18px 0 0;
      }

      .grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fill, minmax(174px, 1fr));
        padding-top: 20px;
      }

      .pin-card {
        background: #fffdfa;
        border: 1px solid #ded8d0;
        border-radius: 8px;
        cursor: pointer;
        display: grid;
        grid-template-rows: auto minmax(82px, auto);
        min-width: 0;
        overflow: hidden;
        position: relative;
      }

      .pin-card:hover {
        border-color: #a99684;
      }

      .pin-card.selected {
        border-color: #181715;
        box-shadow: 0 0 0 2px #181715 inset;
      }

      .pin-image {
        aspect-ratio: 4 / 5;
        background: #ebe5dd;
        display: block;
        object-fit: cover;
        width: 100%;
      }

      .check {
        align-items: center;
        background: rgba(24, 23, 21, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.7);
        border-radius: 999px;
        color: white;
        display: flex;
        font-size: 13px;
        font-weight: 700;
        height: 28px;
        justify-content: center;
        position: absolute;
        right: 10px;
        top: 10px;
        width: 28px;
      }

      .pin-body {
        display: grid;
        gap: 6px;
        padding: 11px;
      }

      .pin-title {
        font-size: 13px;
        font-weight: 680;
        line-height: 1.25;
        margin: 0;
        overflow-wrap: anywhere;
      }

      .pin-meta {
        color: #746b61;
        font-size: 12px;
        line-height: 1.3;
        margin: 0;
        overflow-wrap: anywhere;
      }

      @media (max-width: 760px) {
        .app {
          grid-template-columns: 1fr;
        }

        .sidebar {
          border-bottom: 1px solid #ded8d0;
          border-right: 0;
        }

        .board-list {
          display: flex;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .board-button {
          min-width: 210px;
        }

        .main {
          padding: 18px;
        }

        .toolbar {
          align-items: flex-start;
          flex-direction: column;
        }

        .actions {
          justify-content: flex-start;
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <div class="brand">
          <h1>Pinterest to mymind</h1>
          <span class="status-pill" id="status">Loading</span>
        </div>
        <div class="board-list" id="boards"></div>
      </aside>
      <main class="main">
        <div class="toolbar">
          <div class="title-block">
            <h2 id="board-title">Choose a board</h2>
            <div class="muted" id="summary">Boards will appear on the left.</div>
          </div>
          <div class="actions">
            <button class="action-button secondary" id="select-all" type="button" disabled>Select all</button>
            <button class="action-button secondary" id="clear" type="button" disabled>Clear</button>
            <button class="action-button" id="import" type="button" disabled>Import selected</button>
          </div>
        </div>
        <div class="message" id="message"></div>
        <section class="grid" id="pins" aria-live="polite"></section>
      </main>
    </div>
    <script type="module">
      const state = {
        boards: [],
        currentBoard: null,
        pins: [],
        selected: new Set(),
        loading: false,
      };

      const boardsEl = document.querySelector("#boards");
      const pinsEl = document.querySelector("#pins");
      const statusEl = document.querySelector("#status");
      const messageEl = document.querySelector("#message");
      const summaryEl = document.querySelector("#summary");
      const titleEl = document.querySelector("#board-title");
      const importButton = document.querySelector("#import");
      const selectAllButton = document.querySelector("#select-all");
      const clearButton = document.querySelector("#clear");

      const setMessage = (message) => {
        messageEl.textContent = message;
      };

      const api = async (path, init) => {
        const response = await fetch(path, init);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.message ?? "Request failed");
        }
        return body;
      };

      const renderBoards = () => {
        boardsEl.replaceChildren(
          ...state.boards.map((board) => {
            const button = document.createElement("button");
            button.className = "board-button";
            button.type = "button";
            button.setAttribute("aria-pressed", String(state.currentBoard?.id === board.id));
            button.dataset.boardId = board.id;
            button.innerHTML = \`<strong></strong><span class="board-id"></span>\`;
            button.querySelector("strong").textContent = board.name;
            button.querySelector(".board-id").textContent = board.id;
            button.addEventListener("click", () => loadPins(board));
            return button;
          }),
        );
      };

      const renderPins = () => {
        const selectedCount = state.selected.size;
        importButton.disabled = selectedCount === 0 || state.loading;
        selectAllButton.disabled = state.pins.length === 0 || state.loading;
        clearButton.disabled = selectedCount === 0 || state.loading;
        summaryEl.textContent = state.currentBoard
          ? \`\${state.pins.length} image pin\${state.pins.length === 1 ? "" : "s"} · \${selectedCount} selected\`
          : "Boards will appear on the left.";

        pinsEl.replaceChildren(
          ...state.pins.map((pin) => {
            const selected = state.selected.has(pin.id);
            const card = document.createElement("article");
            card.className = \`pin-card\${selected ? " selected" : ""}\`;
            card.dataset.pinId = pin.id;
            card.tabIndex = 0;
            card.setAttribute("role", "checkbox");
            card.setAttribute("aria-checked", String(selected));
            card.innerHTML = \`
              <img class="pin-image" alt="" loading="lazy" />
              <span class="check">\${selected ? "✓" : ""}</span>
              <div class="pin-body">
                <p class="pin-title"></p>
                <p class="pin-meta"></p>
              </div>
            \`;
            card.querySelector("img").src = pin.imageUrl;
            card.querySelector(".pin-title").textContent = pin.title || \`Pin \${pin.id}\`;
            card.querySelector(".pin-meta").textContent = pin.description || pin.link || pin.id;
            const toggle = () => {
              if (state.selected.has(pin.id)) {
                state.selected.delete(pin.id);
              } else {
                state.selected.add(pin.id);
              }
              renderPins();
            };
            card.addEventListener("click", toggle);
            card.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
              }
            });
            return card;
          }),
        );
      };

      const loadPins = async (board) => {
        state.currentBoard = board;
        state.pins = [];
        state.selected.clear();
        state.loading = true;
        titleEl.textContent = board.name;
        statusEl.textContent = "Loading";
        setMessage("");
        renderBoards();
        renderPins();
        try {
          const body = await api(\`/api/boards/\${encodeURIComponent(board.id)}/pins\`);
          state.pins = body.pins;
          statusEl.textContent = "Ready";
          if (state.pins.length === 0) {
            setMessage("No image pins found on this board.");
          }
        } catch (error) {
          statusEl.textContent = "Error";
          setMessage(error.message);
        } finally {
          state.loading = false;
          renderPins();
        }
      };

      const loadBoards = async () => {
        try {
          const body = await api("/api/boards");
          state.boards = body.boards;
          statusEl.textContent = "Ready";
          renderBoards();
          if (state.boards[0]) {
            await loadPins(state.boards[0]);
          } else {
            setMessage("No boards returned by Pinterest.");
          }
        } catch (error) {
          statusEl.textContent = "Error";
          setMessage(error.message);
        }
      };

      selectAllButton.addEventListener("click", () => {
        state.selected = new Set(state.pins.map((pin) => pin.id));
        renderPins();
      });

      clearButton.addEventListener("click", () => {
        state.selected.clear();
        renderPins();
      });

      importButton.addEventListener("click", async () => {
        if (!state.currentBoard || state.selected.size === 0) {
          return;
        }
        state.loading = true;
        statusEl.textContent = "Importing";
        setMessage("");
        renderPins();
        try {
          const body = await api("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              boardId: state.currentBoard.id,
              pinIds: Array.from(state.selected),
            }),
          });
          statusEl.textContent = "Ready";
          setMessage(\`Imported \${body.imported.length} image\${body.imported.length === 1 ? "" : "s"}.\`);
          state.selected.clear();
        } catch (error) {
          statusEl.textContent = "Error";
          setMessage(error.message);
        } finally {
          state.loading = false;
          renderPins();
        }
      });

      await loadBoards();
    </script>
  </body>
</html>`;
