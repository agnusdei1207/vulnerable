const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const { DEFAULT_BASE_DOMAIN, NAMESPACE, benchmarkHost, challengeHost } = require('./benchmark-config');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOCAL_INGRESS_PORT = Number.parseInt(process.env.LUXORA_LOCAL_INGRESS_PORT || '9000', 10);

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    env: options.env || process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs || 180_000
  });

  if (result.error && !options.allowFailure) {
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} ${args.map(shellQuote).join(' ')} failed with exit ${result.status}: ${result.stderr || result.stdout}`
    );
  }
  return result;
}

function waitForTcpPort(port, host = '127.0.0.1', timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ port, host });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`timed out waiting for ${host}:${port}`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
    };
    tryConnect();
  });
}

function reserveTcpPort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (preferredPort > 0 && error && error.code === 'EADDRINUSE') {
        reserveTcpPort(0).then(resolve, reject);
        return;
      }
      reject(error);
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferredPort;
      server.close((closeError) => {
        if (closeError) reject(closeError);
        else resolve(port);
      });
    });
  });
}

async function startTraefikPortForward(artifactDir, localPort = LOCAL_INGRESS_PORT) {
  const selectedPort = await reserveTcpPort(localPort);
  const stdoutPath = path.join(artifactDir, `port-forward-traefik-${selectedPort}.stdout.txt`);
  const stderrPath = path.join(artifactDir, `port-forward-traefik-${selectedPort}.stderr.txt`);
  const stdout = fs.openSync(stdoutPath, 'w');
  const stderr = fs.openSync(stderrPath, 'w');
  const child = spawn(
    'kubectl',
    ['-n', 'kube-system', 'port-forward', 'svc/traefik', `${selectedPort}:80`],
    {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: ['ignore', stdout, stderr]
    }
  );

  try {
    await Promise.race([
      waitForTcpPort(selectedPort, '127.0.0.1', 45_000),
      new Promise((_, reject) => {
        child.once('exit', (code, signal) => {
          reject(new Error(`kubectl port-forward exited before becoming ready (code=${code}, signal=${signal || 'none'})`));
        });
      })
    ]);
    return {
      child,
      localPort: selectedPort,
      stdoutPath,
      stderrPath
    };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

function stopChild(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
}

function nodeHostIp() {
  if (process.env.LUXORA_CALLBACK_HOST) {
    return process.env.LUXORA_CALLBACK_HOST;
  }

  const cniGateway = runSync('sh', ['-lc', "ip -4 -o addr show cni0 2>/dev/null | awk '{print $4}' | cut -d/ -f1"], {
    allowFailure: true
  });
  const cniIp = (cniGateway.stdout || '').trim();
  if (cniIp) {
    return cniIp;
  }

  const result = runSync(
    'kubectl',
    ['get', 'nodes', '-o', 'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}']
  );
  const ip = (result.stdout || '').trim();
  if (!ip) {
    throw new Error('failed to resolve Kubernetes node InternalIP');
  }
  return ip;
}

function ensureDeployed(baseDomain = DEFAULT_BASE_DOMAIN) {
  if (process.env.LUXORA_SKIP_DEPLOY === '1') {
    return;
  }
  runSync('bash', ['scripts/deploy-k3s.sh'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      LUXORA_BASE_DOMAIN: baseDomain
    },
    timeoutMs: 900_000
  });
}

function baseUrl(localPort = LOCAL_INGRESS_PORT) {
  return `http://127.0.0.1:${localPort}`;
}

function benchmarkRequestUrl(pathName = '', localPort = LOCAL_INGRESS_PORT) {
  const normalized = pathName.startsWith('/') ? pathName : `/${pathName}`;
  return {
    host: benchmarkHost(process.env.LUXORA_BASE_DOMAIN || DEFAULT_BASE_DOMAIN),
    url: `${baseUrl(localPort)}${normalized}`
  };
}

function challengeRequestUrl(slug, pathName = '/', localPort = LOCAL_INGRESS_PORT) {
  const normalized = pathName.startsWith('/') ? pathName : `/${pathName}`;
  return {
    host: challengeHost(slug, process.env.LUXORA_BASE_DOMAIN || DEFAULT_BASE_DOMAIN),
    url: `${baseUrl(localPort)}${normalized}`
  };
}

module.exports = {
  ROOT_DIR,
  NAMESPACE,
  LOCAL_INGRESS_PORT,
  shellQuote,
  runSync,
  waitForTcpPort,
  startTraefikPortForward,
  stopChild,
  nodeHostIp,
  ensureDeployed,
  baseUrl,
  benchmarkRequestUrl,
  challengeRequestUrl
};
