const MAX_LOG_LINES = 3000;

function createLogStore() {
  return {
    nextId: 1,
    lines: [],
    clients: new Set(),
    consolePatched: false
  };
}

const state = createLogStore();

function nowIso() {
  return new Date().toISOString();
}

function emit(line) {
  const payload = `event: line\ndata: ${JSON.stringify(line)}\n\n`;
  for (const client of state.clients) {
    client.write(payload);
  }
}

function pushLine(level, message, meta = {}) {
  const line = {
    id: state.nextId++,
    timestamp: nowIso(),
    level,
    message: String(message || ''),
    meta
  };

  state.lines.push(line);
  if (state.lines.length > MAX_LOG_LINES) {
    state.lines.splice(0, state.lines.length - MAX_LOG_LINES);
  }

  emit(line);
  return line;
}

function snapshot() {
  return {
    lines: state.lines,
    maxLines: MAX_LOG_LINES,
    totalLines: state.lines.length
  };
}

function addClient(client) {
  state.clients.add(client);
}

function removeClient(client) {
  state.clients.delete(client);
}

function isConsolePatched() {
  return state.consolePatched;
}

function markConsolePatched() {
  state.consolePatched = true;
}

module.exports = {
  MAX_LOG_LINES,
  addClient,
  createLogStore,
  isConsolePatched,
  markConsolePatched,
  pushLine,
  removeClient,
  snapshot
};
