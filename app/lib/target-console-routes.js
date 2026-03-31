const path = require('path');

function registerTargetConsoleRoutes(app, options) {
  const { rootDir, snapshot, streamHandler } = options;

  app.get('/__console', (req, res) => {
    res.sendFile(path.join(rootDir, 'public', 'target-console.html'));
  });

  app.get('/__console/state', (req, res) => {
    res.json(snapshot());
  });

  app.get('/__console/stream', streamHandler);
}

module.exports = {
  registerTargetConsoleRoutes
};
