#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROJECT = process.env.COMPOSE_PROJECT_NAME || 'vuluable_reverse_check';
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
  artifactDir,
  commands: [],
  solved: false
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

function assertJsonFlag(text) {
  const parsed = JSON.parse(text);
  if (parsed.success !== true || !String(parsed.flag || '').startsWith('FLAG{REVERSE_')) {
    throw new Error(`unexpected solve response: ${text}`);
  }
  return parsed.flag;
}

function main() {
  appendCommandLog(`reverse-silver check started ${new Date().toISOString()}\n`);
  appendCommandLog(`logs: ${artifactDir}\n`);

  run('verify-isolated-compose', 'node', ['scripts/verify-isolated-compose.js']);
  compose(['down', '-v', '--remove-orphans'], { label: 'compose-preclean', allowFailure: true, timeoutMs: 120_000 });
  compose(['up', '-d', '--build', 'reverse-silver'], { label: 'compose-up-reverse-silver', timeoutMs: 240_000 });
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
  const flag = assertJsonFlag(solved);
  summary.solved = true;
  summary.recoveredToken = token;
  summary.flag = flag;

  const consoleState = curl('curl-console-state', `${BASE_URL}/__console/state`);
  writeFile('console-state.json', consoleState);
  assertIncludes(consoleState, '/reverse/silver/artifact.js', 'console state');
  assertIncludes(consoleState, '/reverse/silver?payload=', 'console state');

  compose(['exec', '-T', 'reverse-silver', 'sh', '-lc', 'ls -la /tmp/rndsecurity-isolated/reverse-silver && cat /tmp/rndsecurity-isolated/reverse-silver/flag.txt'], {
    label: 'compose-exec-flag-artifact'
  });

  console.log(`PASS reverse-silver compose check`);
  console.log(`Recovered token: ${token}`);
  console.log(`Flag: ${flag}`);
  console.log(`Artifacts: ${artifactDir}`);
}

let failure = null;
try {
  main();
} catch (error) {
  failure = error;
  summary.error = error instanceof Error ? error.message : String(error);
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  compose(['logs', '--no-color', 'reverse-silver', 'postgres', 'seed-reverse-silver'], {
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
}

if (failure) {
  process.exitCode = 1;
}
