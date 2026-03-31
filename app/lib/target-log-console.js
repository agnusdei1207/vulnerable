const {
  MAX_LOG_LINES,
  addClient,
  isConsolePatched,
  markConsolePatched,
  pushLine,
  removeClient,
  snapshot
} = require('./target-log-store');
const { createStreamHandler } = require('./target-log-sse');
const {
  installConsoleForwarder: installConsoleForwarderInternal,
  requestLogMiddleware: createRequestLogMiddleware
} = require('./target-log-forwarders');

function installConsoleForwarder() {
  installConsoleForwarderInternal(pushLine, isConsolePatched, markConsolePatched);
}

const requestLogMiddleware = createRequestLogMiddleware(pushLine);
const streamHandler = createStreamHandler({ snapshot, addClient, removeClient });

module.exports = {
  installConsoleForwarder,
  pushLine,
  requestLogMiddleware,
  streamHandler,
  snapshot,
  MAX_LOG_LINES
};
