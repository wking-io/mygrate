import { clientEntry, on, type Handle, type RemixNode } from "remix/ui";

type BoardView = {
  id: string;
  name: string;
};

type PinView = {
  id: string;
  title?: string;
  description?: string;
  link?: string;
  imageUrl: string;
  migrated: boolean;
};

type ImportIssue = {
  code: string;
  field: string;
  message: string;
  original?: string | number;
  adjusted?: string | number;
};

type ImportedPin = {
  pinId: string;
  dryRun: boolean;
  issues?: ImportIssue[];
};

type Filter = "unmigrated" | "migrated" | "all";

const filters: Array<{ value: Filter; label: string }> = [
  { value: "unmigrated", label: "Unmigrated" },
  { value: "migrated", label: "Migrated" },
  { value: "all", label: "All" },
];

export const PickerApp = clientEntry(
  import.meta.url + "#PickerApp",
  function PickerApp(handle: Handle) {
    if (typeof window === "undefined") {
      return () => renderShell(serverState());
    }

    let boards: BoardView[] = [];
    let currentBoard: BoardView | undefined;
    let pins: PinView[] = [];
    let selected = new Set<string>();
    let filter = readStoredFilter();
    let loading = false;
    let status = "Loading";
    let message = "";
    let importIssues: ImportIssue[] = [];

    void loadBoards();

    async function api<T>(path: string, init?: RequestInit): Promise<T> {
      let response = await fetch(path, init);
      let body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message ?? "Request failed");
      }
      return body;
    }

    async function loadBoards() {
      try {
        let body = await api<{ boards: BoardView[] }>("/api/boards");
        boards = body.boards;
        status = "Ready";
        handle.update();
        if (boards[0]) {
          await loadPins(boards[0]);
        } else {
          message = "No boards returned by Pinterest.";
          handle.update();
        }
      } catch (error) {
        status = "Error";
        message = error instanceof Error ? error.message : "Request failed";
        handle.update();
      }
    }

    async function loadPins(board: BoardView) {
      currentBoard = board;
      pins = [];
      selected.clear();
      loading = true;
      status = "Loading";
      message = "";
      importIssues = [];
      handle.update();
      try {
        let body = await api<{ pins: PinView[] }>(
          `/api/boards/${encodeURIComponent(board.id)}/pins`,
        );
        pins = body.pins;
        status = "Ready";
        if (pins.length === 0) {
          message = "No image pins found on this board.";
        } else if (visiblePins().length === 0) {
          message = "No pins match this filter.";
        }
      } catch (error) {
        status = "Error";
        message = error instanceof Error ? error.message : "Request failed";
      } finally {
        loading = false;
        handle.update();
      }
    }

    function visiblePins() {
      return pins.filter((pin) => {
        if (filter === "migrated") {
          return pin.migrated;
        }
        if (filter === "all") {
          return true;
        }
        return !pin.migrated;
      });
    }

    function setFilter(nextFilter: Filter) {
      filter = nextFilter;
      localStorage.setItem("pinFilter", filter);
      selected.clear();
      message = currentBoard && visiblePins().length === 0 ? "No pins match this filter." : "";
      importIssues = [];
      handle.update();
    }

    function togglePin(pinId: string) {
      if (selected.has(pinId)) {
        selected.delete(pinId);
      } else {
        selected.add(pinId);
      }
      handle.update();
    }

    function selectAllVisible() {
      selected = new Set(visiblePins().map((pin) => pin.id));
      handle.update();
    }

    function clearSelection() {
      selected.clear();
      handle.update();
    }

    async function importSelected() {
      if (!currentBoard || selected.size === 0) {
        return;
      }
      loading = true;
      status = "Importing";
      message = "";
      importIssues = [];
      handle.update();
      try {
        let body = await api<{ imported: ImportedPin[] }>(
          "/api/import",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              boardId: currentBoard.id,
              pinIds: Array.from(selected),
            }),
          },
        );
        let importedPinIds = new Set(
          body.imported.filter((image) => !image.dryRun).map((image) => image.pinId),
        );
        pins = pins.map((pin) => (importedPinIds.has(pin.id) ? { ...pin, migrated: true } : pin));
        selected.clear();
        status = "Ready";
        message = `Imported ${body.imported.length} image${body.imported.length === 1 ? "" : "s"}.`;
        importIssues = body.imported.flatMap((image) => image.issues ?? []);
      } catch (error) {
        status = "Error";
        message = error instanceof Error ? error.message : "Request failed";
      } finally {
        loading = false;
        handle.update();
      }
    }

    return () =>
      renderShell({
        boards,
        currentBoard,
        pins,
        visiblePins: visiblePins(),
        selected,
        filter,
        loading,
        status,
        message,
        importIssues,
        loadPins,
        setFilter,
        togglePin,
        selectAllVisible,
        clearSelection,
        importSelected,
      });
  },
);

function readStoredFilter(): Filter {
  let value = localStorage.getItem("pinFilter");
  return value === "migrated" || value === "all" || value === "unmigrated"
    ? value
    : "unmigrated";
}

function serverState(): PickerState {
  return {
    boards: [],
    currentBoard: undefined,
    pins: [],
    visiblePins: [],
    selected: new Set(),
    filter: "unmigrated",
    loading: true,
    status: "Loading",
    message: "",
    importIssues: [],
  };
}

type PickerState = {
  boards: BoardView[];
  currentBoard: BoardView | undefined;
  pins: PinView[];
  visiblePins: PinView[];
  selected: ReadonlySet<string>;
  filter: Filter;
  loading: boolean;
  status: string;
  message: string;
  importIssues: ImportIssue[];
  loadPins?: (board: BoardView) => void;
  setFilter?: (filter: Filter) => void;
  togglePin?: (pinId: string) => void;
  selectAllVisible?: () => void;
  clearSelection?: () => void;
  importSelected?: () => void;
};

function renderShell(state: PickerState): RemixNode {
  let selectedCount = state.selected.size;
  let migratedCount = state.pins.filter((pin) => pin.migrated).length;
  let summary = state.currentBoard
    ? `${state.visiblePins.length} shown · ${migratedCount} migrated · ${selectedCount} selected`
    : "Boards will appear on the left.";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>mygrate</h1>
          <span className="status-pill">{state.status}</span>
        </div>
        <div className="board-list">
          {state.boards.map((board) => (
            <button
              className={`board-button${state.currentBoard?.id === board.id ? " active" : ""}`}
              key={board.id}
              mix={state.loadPins ? on("click", () => state.loadPins?.(board)) : undefined}
              type="button"
            >
              <strong>{board.name}</strong>
              <span className="board-id">{board.id}</span>
            </button>
          ))}
        </div>
      </aside>
      <main className="main">
        <div className="toolbar">
          <div className="title-block">
            <h2>{state.currentBoard?.name ?? "Choose a board"}</h2>
            <div className="muted">{summary}</div>
          </div>
          <div className="actions">
            <div className="filter-tabs">
              {filters.map((item) => (
                <button
                  className={`filter-tab${state.filter === item.value ? " active" : ""}`}
                  key={item.value}
                  mix={
                    state.setFilter ? on("click", () => state.setFilter?.(item.value)) : undefined
                  }
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              className="action-button secondary"
              disabled={state.visiblePins.length === 0 || state.loading}
              mix={state.selectAllVisible ? on("click", state.selectAllVisible) : undefined}
              type="button"
            >
              Select all
            </button>
            <button
              className="action-button secondary"
              disabled={selectedCount === 0 || state.loading}
              mix={state.clearSelection ? on("click", state.clearSelection) : undefined}
              type="button"
            >
              Clear
            </button>
            <button
              className="action-button"
              disabled={selectedCount === 0 || state.loading}
              mix={state.importSelected ? on("click", state.importSelected) : undefined}
              type="button"
            >
              Import selected
            </button>
          </div>
        </div>
        <div className="message">{state.message}</div>
        {state.importIssues.length > 0 ? (
          <div className="issue-panel">
            {state.importIssues.map((issue, index) => (
              <div className="issue-row" key={`${issue.code}-${issue.field}-${index}`}>
                <strong>{issue.field}</strong>
                <span>{issue.message}</span>
                {issue.adjusted !== undefined ? (
                  <code>{String(issue.adjusted)}</code>
                ) : undefined}
              </div>
            ))}
          </div>
        ) : undefined}
        <section className="grid" aria-live="polite">
          {state.visiblePins.map((pin) => renderPinCard(pin, state))}
        </section>
      </main>
    </div>
  );
}

function renderPinCard(pin: PinView, state: PickerState) {
  let isSelected = state.selected.has(pin.id);
  return (
    <button
      className={`pin-card${isSelected ? " selected" : ""}`}
      key={pin.id}
      mix={state.togglePin ? on("click", () => state.togglePin?.(pin.id)) : undefined}
      type="button"
    >
      <img className="pin-image" alt="" loading="lazy" src={pin.imageUrl} />
      {pin.migrated ? <span className="migrated-badge">Migrated</span> : undefined}
      <span className="check">{isSelected ? "✓" : ""}</span>
      <div className="pin-body">
        <p className="pin-title">{pin.title || `Pin ${pin.id}`}</p>
        <p className="pin-meta">{pin.description || pin.link || pin.id}</p>
      </div>
    </button>
  );
}
