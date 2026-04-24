const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogMiddleware);

registerTargetConsoleRoutes(app, {
  rootDir: __dirname,
  snapshot: logSnapshot,
  streamHandler
});

const challengeMode = process.env.CHALLENGE_MODE;
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
const SOCKET_PATH = process.env.SOCKET_PATH;

if (SOCKET_PATH) {
  fs.mkdirSync(path.dirname(SOCKET_PATH), { recursive: true });
  try {
    fs.unlinkSync(SOCKET_PATH);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  app.listen(SOCKET_PATH, () => {
    fs.chmodSync(SOCKET_PATH, 0o777);
    pushLine('info', `isolated challenge startup on unix socket ${SOCKET_PATH}`, {
      socketPath: SOCKET_PATH,
      challengeMode,
      maxLines: MAX_LOG_LINES
    });
    console.log(`⚠️  ISOLATED CHALLENGE running on unix socket ${SOCKET_PATH}`);
    console.log(`🎯 Active challenge: ${challengeMode}`);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  pushLine('info', `isolated challenge startup on port ${PORT}`, {
    port: PORT,
    challengeMode,
    maxLines: MAX_LOG_LINES
  });
  console.log(`⚠️  ISOLATED CHALLENGE running on port ${PORT}`);
  console.log(`🎯 Active challenge: ${challengeMode}`);
});
