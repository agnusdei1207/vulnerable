#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  APP_IMAGE,
  DEFAULT_RUNTIME_CLASS,
  WEB_IMAGE,
  DEFAULT_BASE_DOMAIN,
  INGRESS_CLASS_NAME,
  NAMESPACE,
  benchmarkHost,
  challengeHost,
  challengeRoute,
  flagValue,
  hardPivotKeys,
  hasHardPivotRelay,
  relayServiceName,
  routePrefix,
  selected,
  serviceName
} = require('./benchmark-config');

const rootDir = path.resolve(__dirname, '..');
const proxyDir = path.join(rootDir, 'proxy');
const k8sDir = path.join(rootDir, 'k8s');
const manifestOutputPath = path.join(k8sDir, 'luxora-benchmark.yaml');
const proxyOutputPaths = {
  dockerfile: path.join(proxyDir, 'Dockerfile'),
  nginx: path.join(proxyDir, 'nginx.conf'),
  index: path.join(proxyDir, 'index.html')
};
function detectCallbackHostHint() {
  if ((process.env.LUXORA_CALLBACK_HOST_HINT || '').trim()) {
    return process.env.LUXORA_CALLBACK_HOST_HINT.trim();
  }

  const result = spawnSync('sh', ['-lc', "ip -4 -o addr show cni0 2>/dev/null | awk '{print $4}' | cut -d/ -f1"], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  return (result.stdout || '').trim();
}

const CALLBACK_HOST_HINT = detectCallbackHostHint();

function proxyDockerfile() {
  return [
    'FROM nginx:1.27-alpine',
    'COPY nginx.conf /etc/nginx/nginx.conf',
    'COPY index.html /usr/share/nginx/html/index.html',
    ''
  ].join('\n');
}

function browserIsolationScript(marker = 'gateway') {
  return [
    '<script>',
    '(() => {',
    `  const currentChallenge = ${JSON.stringify(marker)};`,
    "  const markerPrefix = 'luxora:last-challenge:';",
    "  const previous = window.name && window.name.startsWith(markerPrefix) ? window.name.slice(markerPrefix.length) : '';",
    '  function expireCookie(name, pathValue, domainValue) {',
    "    const domainPart = domainValue ? ` domain=${domainValue};` : '';",
    "    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${pathValue};${domainPart} SameSite=Lax`;",
    '  }',
    '  async function clearClientState() {',
    '    try { localStorage.clear(); } catch (_) {}',
    '    try { sessionStorage.clear(); } catch (_) {}',
    '    try {',
    "      if ('caches' in window) {",
    '        const cacheKeys = await caches.keys();',
    '        await Promise.all(cacheKeys.map((key) => caches.delete(key)));',
    '      }',
    '    } catch (_) {}',
    '    try {',
    "      if ('indexedDB' in window && typeof indexedDB.databases === 'function') {",
    '        const dbs = await indexedDB.databases();',
    '        await Promise.all((dbs || []).map((db) => new Promise((resolve) => {',
    '          if (!db || !db.name) { resolve(); return; }',
    '          const req = indexedDB.deleteDatabase(db.name);',
    '          req.onsuccess = req.onerror = req.onblocked = () => resolve();',
    '        })));',
    '      }',
    '    } catch (_) {}',
    '    try {',
    "      const hostParts = location.hostname.split('.').filter(Boolean);",
    "      const domains = [''];",
    '      for (let i = 0; i < hostParts.length - 1; i += 1) {',
    "        domains.push(`.${hostParts.slice(i).join('.')}`);",
    '      }',
    "      const pathParts = location.pathname.split('/').filter(Boolean);",
    "      const paths = ['/'];",
    "      let built = '';",
    '      pathParts.forEach((part) => {',
    "        built += `/${part}`;",
    '        paths.push(built);',
    '      });',
    "      document.cookie.split(';').forEach((entry) => {",
    "        const name = entry.split('=')[0].trim();",
    '        if (!name) return;',
    '        domains.forEach((domainValue) => {',
    '          paths.forEach((pathValue) => expireCookie(name, pathValue, domainValue));',
    '        });',
    '      });',
    '    } catch (_) {}',
    '  }',
    '  function routeMarkerFromHref(href) {',
    "    const parsed = new URL(href, window.location.origin);",
    "    const match = parsed.pathname.match(/^\\/[^/]+\\/silver/);",
    "    return match ? match[0] : 'gateway';",
    '  }',
    "  document.addEventListener('click', (event) => {",
    "    const link = event.target.closest('a[href]');",
    '    if (!link) return;',
    "    const nextMarker = routeMarkerFromHref(link.href);",
    '    if (nextMarker === currentChallenge) return;',
    '    event.preventDefault();',
    '    Promise.resolve(clearClientState()).finally(() => {',
    "      window.name = `${markerPrefix}${nextMarker}`;",
    '      window.location.assign(link.href);',
    '    });',
    '  });',
    '  if (previous && previous !== currentChallenge) {',
    '    Promise.resolve(clearClientState()).finally(() => {',
    "      window.name = `${markerPrefix}${currentChallenge}`;",
    '    });',
    '  } else {',
    "    window.name = `${markerPrefix}${currentChallenge}`;",
    '  }',
    '})();',
    '</script>'
  ].join('\n');
}

function proxyConfig() {
  const lines = [
    'worker_processes 1;',
    '',
    'events {',
    '  worker_connections 1024;',
    '}',
    '',
    'http {',
    '  include /etc/nginx/mime.types;',
    '  default_type application/octet-stream;',
    '  sendfile on;',
    ''
  ];

  for (const challenge of selected) {
    const svc = serviceName(challenge.slug);
    lines.push(`  upstream ${svc} {`);
    lines.push(`    server ${svc}:3000;`);
    lines.push('  }');
    lines.push('');
  }

  lines.push('  server {');
  lines.push('    listen 80;');
  lines.push('    server_name _;');
  lines.push('');
  lines.push('    location = /healthz {');
  lines.push('      access_log off;');
  lines.push('      return 200 "ok\\n";');
  lines.push('    }');
  lines.push('');
  lines.push('    location = / {');
  lines.push('      add_header Cache-Control "no-store" always;');
  lines.push('      root /usr/share/nginx/html;');
  lines.push('      try_files /index.html =404;');
  lines.push('    }');
  lines.push('');

  for (const challenge of selected) {
    const route = challengeRoute(challenge.slug);
    const svc = serviceName(challenge.slug);
    lines.push(`    location ^~ ${route} {`);
    lines.push('      add_header Cache-Control "no-store" always;');
    lines.push('      proxy_http_version 1.1;');
    lines.push('      proxy_hide_header Set-Cookie;');
    lines.push('      proxy_set_header Host $host;');
    lines.push('      proxy_set_header X-Real-IP $remote_addr;');
    lines.push('      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    lines.push('      proxy_set_header X-Forwarded-Proto $scheme;');
    lines.push(`      proxy_pass http://${svc};`);
    lines.push('    }');
    lines.push('');
  }

  lines.push('    location / {');
  lines.push('      return 404;');
  lines.push('    }');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function proxyIndex(baseDomain = DEFAULT_BASE_DOMAIN) {
  const items = selected
    .map((challenge) => {
      const route = challengeRoute(challenge.slug);
      const host = challengeHost(challenge.slug, baseDomain);
      return [
        '          <li>',
        `            <a href="${route}">`,
        `              <span class="route-label">${route}</span>`,
        `              <span class="route-meta">HTB ${challenge.difficulty} · ${challenge.points} pts · ${challenge.layer} · core ${challenge.technique} · host ${host} · route ${route}</span>`,
        '            </a>',
        '          </li>'
      ].join('\n');
    })
    .join('\n');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>Luxora k3s Challenge Gateway</title>',
    '  <style>',
    '    :root {',
    '      color-scheme: light;',
    '      --bg: #f6f7fb;',
    '      --panel: #ffffff;',
    '      --text: #122033;',
    '      --muted: #5c6b7f;',
    '      --border: #d9e1ec;',
    '      --accent: #0b63ce;',
    '      --accent-soft: #e8f1ff;',
    '    }',
    '    * { box-sizing: border-box; }',
    '    body {',
    '      margin: 0;',
    '      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '      background: linear-gradient(180deg, #eef3fb 0%, var(--bg) 100%);',
    '      color: var(--text);',
    '    }',
    '    main { max-width: 1100px; margin: 0 auto; padding: 40px 20px 56px; }',
    '    .hero {',
    '      background: var(--panel);',
    '      border: 1px solid var(--border);',
    '      border-radius: 20px;',
    '      padding: 28px;',
    '      box-shadow: 0 14px 30px rgba(18, 32, 51, 0.06);',
    '    }',
    '    .eyebrow {',
    '      margin: 0 0 8px;',
    '      text-transform: uppercase;',
    '      letter-spacing: 0.12em;',
    '      font-size: 0.78rem;',
    '      color: var(--accent);',
    '      font-weight: 700;',
    '    }',
    '    h1 { margin: 0 0 12px; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.05; }',
    '    .summary { margin: 0 0 22px; max-width: 72ch; color: var(--muted); line-height: 1.6; }',
    '    .quick-links {',
    '      display: flex;',
    '      flex-wrap: wrap;',
    '      gap: 12px;',
    '      margin: 0 0 24px;',
    '      padding: 0;',
    '      list-style: none;',
    '    }',
    '    .quick-links a {',
    '      display: inline-flex;',
    '      align-items: center;',
    '      gap: 8px;',
    '      padding: 10px 14px;',
    '      border-radius: 999px;',
    '      border: 1px solid var(--border);',
    '      background: var(--accent-soft);',
    '      color: var(--accent);',
    '      text-decoration: none;',
    '      font-weight: 700;',
    '    }',
    '    .section { margin-top: 24px; }',
    '    .section h2 { margin: 0 0 12px; font-size: 1.1rem; }',
    '    .routes {',
    '      display: grid;',
    '      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));',
    '      gap: 10px;',
    '      margin: 0;',
    '      padding: 0;',
    '      list-style: none;',
    '    }',
    '    .routes a {',
    '      display: flex;',
    '      flex-direction: column;',
    '      gap: 4px;',
    '      padding: 12px 14px;',
    '      border: 1px solid var(--border);',
    '      border-radius: 14px;',
    '      background: #fff;',
    '      color: var(--text);',
    '      text-decoration: none;',
    '      font-weight: 600;',
    '      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;',
    '    }',
    '    .routes a:hover,',
    '    .routes a:focus-visible {',
    '      outline: none;',
    '      transform: translateY(-1px);',
    '      border-color: var(--accent);',
    '      box-shadow: 0 8px 18px rgba(18, 32, 51, 0.08);',
    '    }',
    '    .route-label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }',
    '    .route-meta { color: var(--muted); font-size: 0.92rem; font-weight: 500; word-break: break-word; }',
    '    .note {',
    '      margin-top: 18px;',
    '      padding: 14px 16px;',
    '      border-left: 4px solid var(--accent);',
    '      background: #f1f6ff;',
    '      color: var(--muted);',
    '      line-height: 1.6;',
    '    }',
    '    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 0.95em; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <section class="hero" aria-labelledby="title">',
    '      <p class="eyebrow">k3s ingress gateway</p>',
    '      <h1 id="title">20 Medium-Hard isolated challenges</h1>',
    '      <p class="summary">',
    `        Primary host: <code>${benchmarkHost(baseDomain)}</code>. Choose a route below to open each challenge on the same domain.`,
    '        The set contains 14 Medium and 6 Hard routes for a weighted total of 100 points.',
    '      </p>',
    '      <ul class="quick-links" aria-label="Quick links">',
    '        <li><a href="/healthz">Health <span aria-hidden="true">/healthz</span></a></li>',
    '      </ul>',
    '      <section class="section" aria-labelledby="silver-title">',
    '        <h2 id="silver-title">Challenge routes</h2>',
    '        <ul class="routes">',
    items,
    '        </ul>',
    '      </section>',
    '      <p class="note">',
    '        These proxy and Kubernetes assets are generated from <code>scripts/generate-k8s-manifests.js</code>.',
    '        Browser-side cookies and storage are cleared when you move between challenge routes on this shared host.',
    `        If you change the ingress base domain, regenerate with <code>LUXORA_BASE_DOMAIN=${baseDomain}</code>.`,
    '      </p>',
    '    </section>',
    '  </main>',
    browserIsolationScript('gateway'),
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function indent(lines, size) {
  const pad = ' '.repeat(size);
  return lines.map((line) => (line.length > 0 ? `${pad}${line}` : line));
}

function deploymentDoc(name, containerPort, lines, labels, options = {}) {
  const runtimeClassName = options.runtimeClassName || '';
  const doc = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${name}`,
    `  namespace: ${NAMESPACE}`,
    '  labels:'
  ];
  Object.entries(labels).forEach(([key, value]) => {
    doc.push(`    ${key}: ${value}`);
  });
  doc.push('spec:');
  doc.push('  replicas: 1');
  doc.push('  selector:');
  doc.push('    matchLabels:');
  doc.push(`      app.kubernetes.io/name: ${name}`);
  doc.push('  template:');
  doc.push('    metadata:');
  doc.push('      labels:');
  doc.push(`        app.kubernetes.io/name: ${name}`);
  Object.entries(labels).forEach(([key, value]) => {
    doc.push(`        ${key}: ${value}`);
  });
  doc.push('    spec:');
  if (runtimeClassName) {
    doc.push(`      runtimeClassName: ${runtimeClassName}`);
  }
  doc.push('      containers:');
  doc.push(`        - name: ${name}`);
  doc.push(...indent(lines, 10));
  doc.push('          ports:');
  doc.push(`            - containerPort: ${containerPort}`);
  doc.push('              name: http');
  return doc.join('\n');
}

function serviceDoc(name, targetPort, labels) {
  const doc = [
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    `  name: ${name}`,
    `  namespace: ${NAMESPACE}`,
    '  labels:'
  ];
  Object.entries(labels).forEach(([key, value]) => {
    doc.push(`    ${key}: ${value}`);
  });
  doc.push('spec:');
  doc.push('  type: ClusterIP');
  doc.push('  selector:');
  doc.push(`    app.kubernetes.io/name: ${name}`);
  doc.push('  ports:');
  doc.push('    - name: http');
  doc.push(`      port: ${targetPort}`);
  doc.push(`      targetPort: ${targetPort}`);
  return doc.join('\n');
}

function challengeDeploymentDoc(challenge) {
  const labels = {
    'app.kubernetes.io/part-of': 'luxora-benchmark',
    'app.kubernetes.io/component': 'challenge',
    'luxora.io/challenge': routePrefix(challenge.slug),
    'luxora.io/difficulty': challenge.difficulty.toLowerCase()
  };
  const envLines = [
    `image: ${APP_IMAGE}`,
    'imagePullPolicy: Never',
    'env:',
    '  - name: PORT',
    '    value: "3000"',
    '  - name: PUBLIC_ROOT_ALIAS',
    '    value: "1"',
    '  - name: SECRET_KEY',
    '    value: "super_secret_key_12345"',
    '  - name: DEBUG',
    '    value: "true"'
  ];

  if (CALLBACK_HOST_HINT) {
    envLines.push('  - name: CALLBACK_HOST_HINT');
    envLines.push(`    value: "${CALLBACK_HOST_HINT}"`);
  } else {
    envLines.push('  - name: CALLBACK_HOST_HINT');
    envLines.push('    valueFrom:');
    envLines.push('      fieldRef:');
    envLines.push('        fieldPath: status.hostIP');
  }

  envLines.push(
    '  - name: CHALLENGE_MODE',
    `    value: "${challengeRoute(challenge.slug)}"`,
    '  - name: HTB_DIFFICULTY',
    `    value: "${challenge.difficulty.toUpperCase()}"`,
    '  - name: CHALLENGE_POINTS',
    `    value: "${challenge.points}"`,
    '  - name: FLAG',
    `    value: "${flagValue(challenge.layer, challenge.slug, challenge.difficulty, challenge.points, challenge.technique)}"`
  );

  if (hasHardPivotRelay(challenge.slug)) {
    envLines.push('  - name: PIVOT_HOST');
    envLines.push(`    value: "${relayServiceName(challenge.slug)}"`);
    envLines.push('  - name: PIVOT_PORT');
    envLines.push('    value: "8081"');
    envLines.push('  - name: PIVOT_KEY');
    envLines.push(`    value: "${hardPivotKeys[challenge.slug]}"`);
  }

  return deploymentDoc(serviceName(challenge.slug), 3000, envLines, labels, {
    runtimeClassName: DEFAULT_RUNTIME_CLASS
  });
}

function relayDeploymentDoc(challenge) {
  const labels = {
    'app.kubernetes.io/part-of': 'luxora-benchmark',
    'app.kubernetes.io/component': 'relay',
    'luxora.io/challenge': routePrefix(challenge.slug),
    'luxora.io/difficulty': challenge.difficulty.toLowerCase()
  };
  const envLines = [
    `image: ${APP_IMAGE}`,
    'imagePullPolicy: Never',
    'securityContext:',
    '  runAsUser: 0',
    '  runAsGroup: 0',
    'command:',
    '  - node',
    '  - pivot-relay.js',
    'env:',
    '  - name: PORT',
    '    value: "8081"',
    '  - name: PIVOT_ROOT',
    `    value: "/tmp/rndsecurity-${challenge.slug}"`,
    '  - name: PIVOT_FLAG_PATH',
    `    value: "/tmp/rndsecurity-${challenge.slug}/final-flag.txt"`,
    '  - name: PIVOT_FLAG',
    `    value: "${flagValue(challenge.layer, challenge.slug, challenge.difficulty, challenge.points, challenge.technique)}"`,
    '  - name: PIVOT_KEY',
    `    value: "${hardPivotKeys[challenge.slug]}"`
  ];
  return deploymentDoc(relayServiceName(challenge.slug), 8081, envLines, labels, {
    runtimeClassName: DEFAULT_RUNTIME_CLASS
  });
}

function webDeploymentDoc() {
  const labels = {
    'app.kubernetes.io/part-of': 'luxora-benchmark',
    'app.kubernetes.io/component': 'frontend'
  };
  return deploymentDoc('web', 80, [`image: ${WEB_IMAGE}`, 'imagePullPolicy: Never'], labels);
}

function ingressDocs(baseDomain = DEFAULT_BASE_DOMAIN) {
  const benchmark = [
    'apiVersion: networking.k8s.io/v1',
    'kind: Ingress',
    'metadata:',
    '  name: benchmark-web',
    `  namespace: ${NAMESPACE}`,
    '  labels:',
    '    app.kubernetes.io/part-of: luxora-benchmark',
    '    app.kubernetes.io/component: ingress',
    'spec:',
    `  ingressClassName: ${INGRESS_CLASS_NAME}`,
    '  rules:',
    `    - host: ${benchmarkHost(baseDomain)}`,
    '      http:',
    '        paths:',
    '          - path: /',
    '            pathType: Prefix',
    '            backend:',
    '              service:',
    '                name: web',
    '                port:',
    '                  number: 80'
  ].join('\n');

  const direct = [
    'apiVersion: networking.k8s.io/v1',
    'kind: Ingress',
    'metadata:',
    '  name: direct-challenges',
    `  namespace: ${NAMESPACE}`,
    '  labels:',
    '    app.kubernetes.io/part-of: luxora-benchmark',
    '    app.kubernetes.io/component: ingress',
    'spec:',
    `  ingressClassName: ${INGRESS_CLASS_NAME}`,
    '  rules:',
    `    - host: ${benchmarkHost(baseDomain)}`,
    '      http:',
    '        paths:'
  ];

  for (const challenge of selected) {
    direct.push(`          - path: ${challengeRoute(challenge.slug)}`);
    direct.push('            pathType: Prefix');
    direct.push('            backend:');
    direct.push('              service:');
    direct.push(`                name: ${serviceName(challenge.slug)}`);
    direct.push('                port:');
    direct.push('                  number: 3000');
  }

  return [benchmark, direct.join('\n')];
}

function k8sManifest(baseDomain = DEFAULT_BASE_DOMAIN) {
  const docs = [];

  docs.push([
    'apiVersion: v1',
    'kind: Namespace',
    'metadata:',
    `  name: ${NAMESPACE}`,
    '  labels:',
    '    app.kubernetes.io/part-of: luxora-benchmark'
  ].join('\n'));

  docs.push(webDeploymentDoc());
  docs.push(serviceDoc('web', 80, {
    'app.kubernetes.io/part-of': 'luxora-benchmark',
    'app.kubernetes.io/component': 'frontend'
  }));

  for (const challenge of selected) {
    docs.push(challengeDeploymentDoc(challenge));
    docs.push(serviceDoc(serviceName(challenge.slug), 3000, {
      'app.kubernetes.io/part-of': 'luxora-benchmark',
      'app.kubernetes.io/component': 'challenge',
      'luxora.io/challenge': routePrefix(challenge.slug),
      'luxora.io/difficulty': challenge.difficulty.toLowerCase()
    }));

    if (hasHardPivotRelay(challenge.slug)) {
      docs.push(relayDeploymentDoc(challenge));
      docs.push(serviceDoc(relayServiceName(challenge.slug), 8081, {
        'app.kubernetes.io/part-of': 'luxora-benchmark',
        'app.kubernetes.io/component': 'relay',
        'luxora.io/challenge': routePrefix(challenge.slug),
        'luxora.io/difficulty': challenge.difficulty.toLowerCase()
      }));
    }
  }

  docs.push(...ingressDocs(baseDomain));
  return `${docs.join('\n---\n')}\n`;
}

function writeGeneratedFiles(baseDomain = DEFAULT_BASE_DOMAIN) {
  fs.mkdirSync(proxyDir, { recursive: true });
  fs.mkdirSync(k8sDir, { recursive: true });
  fs.writeFileSync(manifestOutputPath, k8sManifest(baseDomain));
  fs.writeFileSync(proxyOutputPaths.dockerfile, proxyDockerfile());
  fs.writeFileSync(proxyOutputPaths.nginx, proxyConfig());
  fs.writeFileSync(proxyOutputPaths.index, proxyIndex(baseDomain));
}

function main() {
  writeGeneratedFiles(DEFAULT_BASE_DOMAIN);
  console.log(`Generated k3s manifests and proxy assets for 20 challenges on ${DEFAULT_BASE_DOMAIN}.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  k8sManifest,
  manifestOutputPath,
  proxyConfig,
  proxyDockerfile,
  proxyIndex,
  proxyOutputPaths,
  writeGeneratedFiles
};
