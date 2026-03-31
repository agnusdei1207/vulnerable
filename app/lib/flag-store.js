const fs = require('fs');
const path = require('path');

const FLAGS_ROOT = path.join(__dirname, '..', 'flags');

const resolveFlagPath = (...segments) => path.join(FLAGS_ROOT, ...segments);

const readFlag = (...segments) => {
  const flagPath = resolveFlagPath(...segments);
  const content = fs.readFileSync(flagPath, 'utf8');
  return content.split(/\r?\n/).find(Boolean) || '';
};

const readFlagWithDescription = (segments, description) => {
  const flag = readFlag(...segments);
  return description ? `${flag} - ${description}` : flag;
};

module.exports = {
  resolveFlagPath,
  readFlag,
  readFlagWithDescription
};
