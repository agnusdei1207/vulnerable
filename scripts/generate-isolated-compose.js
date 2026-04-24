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
  const items = selected.slice(0, 12).map(([, subdir]) => `      <li><a href="/${routePrefix(subdir)}/silver">/${routePrefix(subdir)}/silver</a></li>`).join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>Vulnerable Benchmark Router</title>',
    '  <style>',
    '    body { font-family: Arial, sans-serif; max-width: 840px; margin: 40px auto; padding: 0 20px; }',
    '    .card { border: 1px solid #ddd; border-radius: 14px; padding: 20px; }',
    '    ul { columns: 2; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="card">',
    '    <h1>40 Silver Challenge Router</h1>',
    '    <p>Each path routes to an isolated challenge container.</p>',
    '    <ul>',
    items,
    '    </ul>',
    '  </div>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

fs.mkdirSync(proxyDir, { recursive: true });
for (const out of composeOutputPaths) {
  fs.writeFileSync(out, compose());
}
fs.writeFileSync(path.join(proxyDir, 'Dockerfile'), 'FROM nginx:1.27-alpine\nRUN mkdir -p /var/run/challenges\nCOPY nginx.conf /etc/nginx/nginx.conf\nCOPY index.html /usr/share/nginx/html/index.html\n');
fs.writeFileSync(path.join(proxyDir, 'nginx.conf'), proxyConfig());
fs.writeFileSync(path.join(proxyDir, 'index.html'), proxyIndex());
console.log('Generated 40 silver challenge compose and proxy assets.');
