const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { exec, execSync } = require('child_process');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const LAB_ROOT = process.env.LAB_ROOT || '/tmp/rev-pivot-lab';
const EDGE_DIR = path.join(LAB_ROOT, 'edge');
const FLAG_PATH = path.join(EDGE_DIR, 'flag.txt');
const PIVOT_KEY_PATH = path.join(EDGE_DIR, 'pivot.key');
const PIVOT_BRIEF_PATH = path.join(EDGE_DIR, 'pivot-brief.txt');
const FLAG = process.env.FLAG || 'FLAG{EDGE_REVERSE_PIVOT_6EC50A}';
const PIVOT_HOST = process.env.PIVOT_HOST || 'pivot-relay';
const PIVOT_PORT = Number.parseInt(process.env.PIVOT_PORT || '8081', 10);
const PIVOT_KEY = process.env.PIVOT_KEY || 'pivot_local_key';

const SPEC = Object.freeze({
  encodedHex: '48cafc3e364a9e38b6447403f861d566be4f92b0bc27',
  order: Object.freeze([7, 14, 1, 18, 5, 12, 19, 6, 13, 0, 17, 4, 11, 20, 3, 10, 21, 8, 15, 2, 9, 16])
});

let flagLocked = false;

function rol8(value, bits) {
  return ((value << bits) | (value >> (8 - bits))) & 0xff;
}

function ror8(value, bits) {
  return ((value >> bits) | (value << (8 - bits))) & 0xff;
}

function edgeKey(index) {
  return ((index * 17) ^ 0x5d ^ ((index + 5) * 9)) & 0xff;
}

function token() {
  const bytes = new Array(SPEC.order.length);
  SPEC.encodedHex.match(/../g).map((byte) => Number.parseInt(byte, 16)).forEach((encoded, position) => {
    const sourceIndex = SPEC.order[position];
    bytes[sourceIndex] = ror8(encoded, (sourceIndex % 5) + 1) ^ edgeKey(sourceIndex);
  });
  return Buffer.from(bytes).toString('utf8');
}

function artifact() {
  return `/* Dedicated reverse-shell pivot lab artifact. */
(() => {
  const __payload = "${SPEC.encodedHex}";
  const __order = [${SPEC.order.join(',')}];
  const rol8 = (value, bits) => ((value << bits) | (value >> (8 - bits))) & 255;
  const key = (index) => ((index * 17) ^ 0x5d ^ ((index + 5) * 9)) & 255;
  function check(candidate) {
    const input = Array.from(candidate || '', (char) => char.charCodeAt(0));
    if (input.length !== __order.length) return false;
    const encoded = __payload.match(/../g).map((byte) => Number.parseInt(byte, 16));
    return encoded.every((byte, position) => {
      const sourceIndex = __order[position];
      return rol8(input[sourceIndex] ^ key(sourceIndex), (sourceIndex % 5) + 1) === byte;
    });
  }
  globalThis.reversePivotLab = { check };
})();\n`;
}

function html(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Reverse Pivot Lab</title></head><body><h1>Reverse Pivot Lab</h1>${body}</body></html>`;
}

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
      if (body.length > 1024 * 1024) reject(new Error('request body too large'));
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

function lockEdgeArtifacts() {
  if (flagLocked) return;
  flagLocked = true;
  fs.mkdirSync(EDGE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(FLAG_PATH, `${FLAG}\n`, { mode: 0o600 });
  fs.writeFileSync(PIVOT_KEY_PATH, `${PIVOT_KEY}\n`, { mode: 0o600 });
  fs.writeFileSync(
    PIVOT_BRIEF_PATH,
    [
      'Edge foothold confirmed.',
      `Internal-only service: http://${PIVOT_HOST}:${PIVOT_PORT}/`,
      `Auth header: X-Pivot-Key from ${PIVOT_KEY_PATH}`,
      'POST {"host":"host.docker.internal","port":LISTENER_PORT} to /callback to receive a second reverse shell.',
      'Final trophy lives on the pivot host, not on this edge host.'
    ].join('\n') + '\n',
    { mode: 0o600 }
  );
  execSync(
    `sudo find "${FLAG_PATH}" -maxdepth 0 -exec chown root:root {} \\; -exec chmod 400 {} \\;`,
    { stdio: 'ignore' }
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (req.method === 'GET' && url.pathname === '/artifact.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(artifact());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/hints') {
    writeJson(res, 200, {
      hints: [
        'Fetch /artifact.js and reverse the byte permutation, rotate, and xor.',
        'The recovered token unlocks /debug; it is not the flag.',
        'Use /debug to execute a reverse shell back to your authorized listener.',
        'The first shell lands as ctfuser and cannot read the edge flag directly.',
        'Once you have the shell, inspect /tmp/rev-pivot-lab/edge for pivot artifacts.',
        'The pivot service is internal-only and must be reached from the edge host.'
      ]
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/debug') {
    if (req.headers['x-debug-token'] !== token()) {
      writeJson(res, 403, { error: 'debug hook locked' });
      return;
    }

    let payload;
    try {
      payload = await parseBody(req);
    } catch (error) {
      writeJson(res, 400, { error: error.message });
      return;
    }

    if (!payload.cmd || typeof payload.cmd !== 'string') {
      writeJson(res, 400, { error: 'cmd (string) is required' });
      return;
    }

    exec(payload.cmd, { shell: '/bin/bash', timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      writeJson(res, 200, {
        executed: true,
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout,
        stderr: stderr || (error && !stdout ? error.message : '')
      });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    const supplied = url.searchParams.get('payload');
    if (supplied && supplied === token()) {
      lockEdgeArtifacts();
      writeJson(res, 200, {
        success: true,
        unlocked: 'debug-hook',
        message: 'Token accepted. Use POST /debug with X-Debug-Token and a JSON {"cmd":"..."} body. The edge flag is not returned over HTTP.'
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      html(
        '<p>Recover the verifier token from <a href="/artifact.js">/artifact.js</a>, submit it as <code>?payload=...</code>, then use the unlocked debug hook to gain a real shell and complete the pivot chain.</p>' +
        '<p><a href="/hints">/hints</a></p>'
      )
    );
    return;
  }

  writeJson(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[edge] listening on 0.0.0.0:${PORT}`);
});
