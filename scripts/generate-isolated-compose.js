#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const proxyDir = path.join(rootDir, 'proxy');
const composeOutputPaths = [
  path.join(rootDir, 'docker-compose.yml'),
  path.join(rootDir, 'docker-compose-40.yml')
];
const proxyOutputPaths = {
  dockerfile: path.join(proxyDir, 'Dockerfile'),
  nginx: path.join(proxyDir, 'nginx.conf'),
  index: path.join(proxyDir, 'index.html')
};

const selected = [
  ['access', 'admin'],
  ['access', 'idor'],
  ['access', 'privesc'],
  ['access', 'rbac'],
  ['advanced', 'multistage'],
  ['advanced', 'persist'],
  ['advanced', 'reverse'],
  ['advanced', 'webshell'],
  ['auth', 'brute'],
  ['auth', 'jwt'],
  ['auth', 'mfa'],
  ['auth', 'oauth'],
  ['client', 'clickjack'],
  ['client', 'csrf'],
  ['client', 'postmsg'],
  ['client', 'xss'],
  ['crypto', 'info_disc'],
  ['crypto', 'secret'],
  ['crypto', 'timing'],
  ['crypto', 'weak_crypto'],
  ['file', 'deser'],
  ['file', 'lfi'],
  ['file', 'upload'],
  ['file', 'xxe'],
  ['infra', 'container'],
  ['infra', 'cors'],
  ['infra', 'host'],
  ['infra', 'redirect'],
  ['injection', 'cmdi'],
  ['injection', 'ldap'],
  ['injection', 'nosqli'],
  ['injection', 'sqli'],
  ['injection', 'ssti'],
  ['logic', 'biz_logic'],
  ['logic', 'payment'],
  ['logic', 'ratelimit'],
  ['server', 'proto_pollute'],
  ['server', 'race'],
  ['server', 'smuggle'],
  ['server', 'ssrf']
];

const routePrefixMap = {
  biz_logic: 'logic',
  info_disc: 'info-disc',
  proto_pollute: 'proto',
  weak_crypto: 'crypto'
};

const directAccessPortBase = 4100;

function routePrefix(subdir) {
  return routePrefixMap[subdir] || subdir;
}

function serviceName(subdir) {
  return `${routePrefix(subdir)}-silver`;
}

function seedServiceName(subdir) {
  return `seed-${serviceName(subdir)}`;
}

function networkName(subdir) {
  return `net_${routePrefix(subdir).replace(/-/g, '_')}_silver`;
}

function socketVolumeName(subdir) {
  return `sock_${routePrefix(subdir).replace(/-/g, '_')}_silver`;
}

function flagValue(layer, subdir) {
  const digest = crypto.createHash('sha256').update(`${layer}:${subdir}:silver`).digest('hex').slice(0, 6).toUpperCase();
  return `FLAG{${subdir.toUpperCase()}_🥈_${layer.toUpperCase()}_${digest}}`;
}

function subnetFor(index) {
  const third = Math.floor(index / 32);
  const fourth = (index % 32) * 8;
  return `10.240.${third}.${fourth}/29`;
}

function proxyDockerfile() {
  return 'FROM nginx:1.27-alpine\nRUN mkdir -p /var/run/challenges\nCOPY nginx.conf /etc/nginx/nginx.conf\nCOPY index.html /usr/share/nginx/html/index.html\n';
}

function compose() {
  const lines = [];
  lines.push('services:');
  lines.push('  web:');
  lines.push('    build: ./proxy');
  lines.push('    labels:');
  lines.push('      - "dokploy.enable=true"');
  lines.push('    volumes:');
  for (const [, subdir] of selected) {
    lines.push(`      - ${socketVolumeName(subdir)}:/var/run/challenges/${serviceName(subdir)}:ro`);
  }
  lines.push('    networks:');
  lines.push('      - web-network');
  lines.push('');
  lines.push('  postgres:');
  lines.push('    image: postgres:18-alpine');
  lines.push('    command: postgres -c max_connections=2000');
  lines.push('    environment:');
  lines.push('      - POSTGRES_USER=vulnuser');
  lines.push('      - POSTGRES_PASSWORD=vulnpass');
  lines.push('      - POSTGRES_DB=vulndb');
  lines.push('    volumes:');
  lines.push('      - postgres_data:/var/lib/postgresql/data');
  lines.push('      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro');
  lines.push('    healthcheck:');
  lines.push("      test: ['CMD-SHELL', 'pg_isready -U vulnuser -d vulndb']");
  lines.push('      interval: 5s');
  lines.push('      timeout: 5s');
  lines.push('      retries: 5');
  lines.push('    networks:');
  for (const [, subdir] of selected) {
    lines.push(`      - ${networkName(subdir)}`);
  }
  lines.push('');

  selected.forEach(([layer, subdir], idx) => {
    const svc = serviceName(subdir);
    const seed = seedServiceName(subdir);
    const net = networkName(subdir);
    const sockVol = socketVolumeName(subdir);
    const sockDir = `/var/run/challenges/${svc}`;
    const sockPath = `${sockDir}/${svc}.sock`;
    lines.push(`  ${seed}:`);
    lines.push('    image: alpine:3.20');
    lines.push('    command:');
    lines.push('      - /bin/sh');
    lines.push('      - -lc');
    lines.push(`      - mkdir -p "${sockDir}" && chown 1000:1000 "${sockDir}" && chmod 0777 "${sockDir}"`);
    lines.push('    volumes:');
    lines.push(`      - ${sockVol}:${sockDir}`);
    lines.push('    restart: "no"');
    lines.push('    networks:');
    lines.push(`      - ${net}`);
    lines.push('');
    lines.push(`  ${svc}:`);
    lines.push('    build: ./app');
    lines.push('    environment:');
    lines.push('      - DATABASE_URL=postgresql://vulnuser:vulnpass@postgres:5432/vulndb');
    lines.push('      - SECRET_KEY=super_secret_key_12345');
    lines.push('      - DEBUG=true');
    lines.push(`      - CHALLENGE_MODE=/${routePrefix(subdir)}/silver`);
    lines.push(`      - FLAG=${flagValue(layer, subdir)}`);
    lines.push(`      - SOCKET_PATH=${sockPath}`);
    lines.push('    volumes:');
    lines.push(`      - ${sockVol}:${sockDir}`);
    lines.push('    ports:');
    lines.push(`      - "${directAccessPortBase + idx}:3000"`);
    lines.push('    depends_on:');
    lines.push('      postgres:');
    lines.push('        condition: service_healthy');
    lines.push(`      ${seed}:`);
    lines.push('        condition: service_completed_successfully');
    lines.push('    networks:');
    lines.push(`      - ${net}`);
    lines.push('');
  });

  lines.push('volumes:');
  lines.push('  postgres_data:');
  for (const [, subdir] of selected) {
    lines.push(`  ${socketVolumeName(subdir)}:`);
  }
  lines.push('');
  lines.push('networks:');
  lines.push('  web-network:');
  lines.push('    driver: bridge');
  lines.push('    ipam:');
  lines.push('      config:');
  lines.push('        - subnet: 10.239.255.0/24');
  selected.forEach(([, subdir], idx) => {
    lines.push(`  ${networkName(subdir)}:`);
    lines.push('    driver: bridge');
    lines.push('    ipam:');
    lines.push('      config:');
    lines.push(`        - subnet: ${subnetFor(idx)}`);
  });
  lines.push('');
  return `${lines.join('\n')}\n`;
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

  for (const [, subdir] of selected) {
    const svc = serviceName(subdir);
    lines.push(`  upstream ${svc} {`);
    lines.push(`    server unix:/var/run/challenges/${svc}/${svc}.sock;`);
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
  lines.push('      root /usr/share/nginx/html;');
  lines.push('      try_files /index.html =404;');
  lines.push('    }');
  lines.push('');

  for (const [, subdir] of selected) {
    const svc = serviceName(subdir);
    lines.push(`    location ^~ /${routePrefix(subdir)}/silver {`);
    lines.push('      proxy_http_version 1.1;');
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

function proxyIndex() {
  const items = selected.map(([, subdir], idx) => {
    const route = `/${routePrefix(subdir)}/silver`;
    return [
      '          <li>',
      `            <a href="${route}">`,
      `              <span class="route-label">${route}</span>`,
      `              <span class="route-meta">${serviceName(subdir)} · direct ${directAccessPortBase + idx}</span>`,
      '            </a>',
      '          </li>'
    ].join('\n');
  }).join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>Vulnerable Silver Challenge Router</title>',
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
    '    .quick-links a:hover,',
    '    .quick-links a:focus-visible {',
    '      outline: none;',
    '      border-color: var(--accent);',
    '      box-shadow: 0 0 0 3px rgba(11, 99, 206, 0.16);',
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
    '    @media (max-width: 640px) {',
    '      .hero { padding: 22px; border-radius: 16px; }',
    '      .quick-links { flex-direction: column; }',
    '      .quick-links a { justify-content: center; }',
    '    }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <section class="hero" aria-labelledby="title">',
    '      <p class="eyebrow">Challenge discovery</p>',
    '      <h1 id="title">40 isolated silver challenge routes</h1>',
    '      <p class="summary">',
    '        Each path routes to a dedicated challenge container with its own flag, socket volume, and network.',
    '        Use the generated routes below or the direct host ports 4100-4139 when testing locally.',
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
    '        These proxy and compose assets are generated from <code>scripts/generate-isolated-compose.js</code>.',
    '        Re-run the generator after changing challenge selection or proxy layout.',
    '      </p>',
    '    </section>',
    '  </main>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function writeGeneratedFiles() {
  fs.mkdirSync(proxyDir, { recursive: true });
  const composeText = compose();
  for (const out of composeOutputPaths) {
    fs.writeFileSync(out, composeText);
  }
  fs.writeFileSync(proxyOutputPaths.dockerfile, proxyDockerfile());
  fs.writeFileSync(proxyOutputPaths.nginx, proxyConfig());
  fs.writeFileSync(proxyOutputPaths.index, proxyIndex());
}

function main() {
  writeGeneratedFiles();
  console.log('Generated 40 silver challenge compose and proxy assets.');
}

if (require.main === module) {
  main();
}

module.exports = {
  selected,
  routePrefixMap,
  routePrefix,
  serviceName,
  seedServiceName,
  networkName,
  socketVolumeName,
  flagValue,
  subnetFor,
  compose,
  proxyConfig,
  proxyIndex,
  proxyDockerfile,
  writeGeneratedFiles
};
