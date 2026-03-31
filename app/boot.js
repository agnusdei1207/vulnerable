const path = require('path');

if (process.env.CHALLENGE_MODE) {
  require(path.join(__dirname, 'isolated-server'));
} else {
  require(path.join(__dirname, 'server'));
}
