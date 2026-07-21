const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  installConsoleForwarder,
  MAX_LOG_LINES,
  pushLine,
  requestLogMiddleware,
  streamHandler,
  snapshot: logSnapshot
} = require('./lib/target-log-console');
const { registerTargetConsoleRoutes } = require('./lib/target-console-routes');
const { registerIsolatedChallenge } = require('./isolated/challenges');

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads') });

installConsoleForwarder();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogMiddleware);

const challengeMode = process.env.CHALLENGE_MODE;
const publicRootAlias = process.env.PUBLIC_ROOT_ALIAS === '1';

if (publicRootAlias && challengeMode) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/__console')) return next();
    if (req.path === challengeMode || req.path.startsWith(`${challengeMode}/`)) {
      const queryIndex = req.url.indexOf('?');
      const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
      const suffix = req.path.slice(challengeMode.length);
      if (suffix === '/__console' || suffix.startsWith('/__console/')) {
        req.url = `${suffix}${query}`;
      }
      return next();
    }

    const queryIndex = req.url.indexOf('?');
    const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
    const aliasedPath = req.path === '/' ? challengeMode : `${challengeMode}${req.path}`;
    req.url = `${aliasedPath}${query}`;
    next();
  });
}

registerTargetConsoleRoutes(app, {
  rootDir: __dirname,
  snapshot: logSnapshot,
  streamHandler
});

if (!registerIsolatedChallenge(app, challengeMode, { upload })) {
  app.use((req, res) => {
    res.status(404).json({
      error: 'Unknown isolated challenge mode',
      challengeMode,
      path: req.path
    });
  });
}

app.use((err, req, res, next) => {
  res.status(500).json({
    error: err.message,
    challengeMode,
    path: req.path
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  pushLine('info', `isolated challenge startup on port ${PORT}`, {
    port: PORT,
    challengeMode,
    maxLines: MAX_LOG_LINES
  });
  console.log(`⚠️  ISOLATED CHALLENGE running on port ${PORT}`);
  console.log(`🎯 Active challenge: ${challengeMode}`);
});
