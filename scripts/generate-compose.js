const fs = require('fs');
const path = require('path');

// Extract categories and tiers from generate-flags.js (or manually define them)
const CATEGORIES = {
  injection: {
    sqli: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    nosqli: ['bronze', 'silver', 'gold'],
    cmdi: ['bronze', 'silver', 'gold', 'platinum'],
    ldap: ['bronze', 'silver'],
    xpath: ['bronze', 'silver'],
    ssti: ['bronze', 'silver', 'gold'],
    'log-inject': ['bronze', 'silver'],
    'email-inject': ['bronze', 'silver'],
    crlf: ['bronze', 'silver'],
    'header-inject': ['bronze', 'silver']
  },
  auth: {
    brute: ['bronze', 'silver', 'gold'],
    jwt: ['bronze', 'silver', 'gold', 'platinum'],
    session: ['bronze', 'silver', 'gold'],
    oauth: ['bronze', 'silver', 'gold'],
    'pass-reset': ['bronze', 'silver'],
    mfa: ['bronze', 'silver', 'gold'],
    ato: ['bronze', 'silver']
  },
  access: {
    idor: ['bronze', 'silver', 'gold', 'platinum'],
    privesc: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    admin: ['bronze', 'silver', 'gold'],
    rbac: ['bronze', 'silver', 'gold', 'platinum']
  },
  client: {
    xss: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    csrf: ['bronze', 'silver', 'gold'],
    clickjack: ['bronze', 'silver'],
    postmsg: ['bronze', 'silver']
  },
  file: {
    lfi: ['bronze', 'silver', 'gold', 'platinum'],
    upload: ['bronze', 'silver', 'gold'],
    xxe: ['bronze', 'silver', 'gold', 'platinum'],
    rfi: ['bronze', 'silver'],
    deser: ['bronze', 'silver', 'gold']
  },
  server: {
    ssrf: ['bronze', 'silver', 'gold', 'platinum'],
    'proto_pollute': ['bronze', 'silver', 'gold'],
    race: ['bronze', 'silver', 'gold'],
    smuggle: ['bronze', 'silver'],
    cache: ['bronze', 'silver']
  },
  logic: {
    'biz_logic': ['bronze', 'silver', 'gold', 'platinum'],
    ratelimit: ['bronze', 'silver'],
    payment: ['bronze', 'silver', 'gold', 'platinum']
  },
  crypto: {
    'weak_crypto': ['bronze', 'silver', 'gold'],
    'info_disc': ['bronze', 'silver', 'gold', 'platinum'],
    secret: ['bronze', 'silver', 'gold'],
    timing: ['bronze', 'silver']
  },
  infra: {
    redirect: ['bronze', 'silver'],
    cors: ['bronze', 'silver', 'gold'],
    host: ['bronze', 'silver'],
    container: ['bronze', 'silver', 'gold']
  },
  advanced: {
    reverse: ['bronze', 'silver', 'gold', 'platinum'],
    webshell: ['bronze', 'silver', 'gold'],
    multistage: ['bronze', 'silver', 'gold', 'platinum'],
    persist: ['bronze', 'silver', 'gold']
  }
};

const TIERS = {
  BRONZE: '🥉', SILVER: '🥈', GOLD: '🥇', PLATINUM: '💎', DIAMOND: '🔱'
};

let composeYaml = `version: "3.8"

services:
  postgres:
    image: postgres:18-alpine
    command: postgres -c max_connections=2000
    environment:
      - POSTGRES_USER=vulnuser
      - POSTGRES_PASSWORD=vulnpass
      - POSTGRES_DB=vulndb
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vulnuser -d vulndb"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - vuln-network

`;

let port = 10000;
let totalFlags = 0;

Object.entries(CATEGORIES).forEach(([category, subcategories]) => {
  Object.entries(subcategories).forEach(([subcategory, tiers]) => {
    tiers.forEach(tier => {
      const serviceName = `${subcategory}-${tier}`.replace(/_/g, '-');
      const challengeMode = `/${subcategory}/${tier}`;
      const emoji = TIERS[tier.toUpperCase()];
      const hash = Math.random().toString(36).substring(2, 8).toUpperCase();
      const flag = `FLAG{${subcategory.toUpperCase()}_${emoji}_${hash}}`;
      
      composeYaml += `  ${serviceName}:
    build: ./app
    ports:
      - "${port}:3000"
    environment:
      - DATABASE_URL=postgresql://vulnuser:vulnpass@postgres:5432/vulndb
      - SECRET_KEY=super_secret_key_12345
      - CHALLENGE_MODE=${challengeMode}
      - FLAG=${flag}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - vuln-network

`;
      port++;
      totalFlags++;
    });
  });
});

composeYaml += `
volumes:
  postgres_data:

networks:
  vuln-network:
    driver: bridge
`;

const outputPath = path.join(__dirname, '..', 'docker-compose-151.yml');
fs.writeFileSync(outputPath, composeYaml);

console.log('==============================================');
console.log('Successfully generated docker-compose-151.yml');
console.log('Total Independent Services Generated: ' + totalFlags);
console.log('Ports allocated: 10000 to ' + (port - 1));
console.log('==============================================');
