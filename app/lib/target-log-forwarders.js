function formatPart(part) {
  if (typeof part === 'string') return part;
  if (part instanceof Error) return `${part.name}: ${part.message}`;
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

function installConsoleForwarder(pushLine, isConsolePatched, markConsolePatched) {
  if (isConsolePatched()) return;
  markConsolePatched();

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  console.log = (...parts) => {
    original.log(...parts);
    pushLine('info', parts.map(formatPart).join(' '));
  };

  console.info = (...parts) => {
    original.info(...parts);
    pushLine('info', parts.map(formatPart).join(' '));
  };

  console.warn = (...parts) => {
    original.warn(...parts);
    pushLine('warn', parts.map(formatPart).join(' '));
  };

  console.error = (...parts) => {
    original.error(...parts);
    pushLine('error', parts.map(formatPart).join(' '));
  };
}

function requestLogMiddleware(pushLine) {
  return function requestLogger(req, res, next) {
    const startedAt = Date.now();
    res.on('finish', () => {
      const forwardedFor = req.headers['x-forwarded-for'];
      const clientIp = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : String(forwardedFor || req.ip || req.socket?.remoteAddress || '').split(',')[0].trim();
      pushLine('request', `${clientIp || 'unknown'} ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode}`, {
        clientIp,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent'] || '',
        durationMs: Date.now() - startedAt
      });
    });
    next();
  };
}

module.exports = {
  installConsoleForwarder,
  requestLogMiddleware
};
