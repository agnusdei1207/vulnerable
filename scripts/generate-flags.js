const fs = require('fs');
const path = require('path');

const FLAGS_DIR = path.join(__dirname, '..', 'app', 'flags');

const TIERS = {
  BRONZE: { name: 'Bronze', emoji: '🥉', points: 10 },
  SILVER: { name: 'Silver', emoji: '🥈', points: 25 },
  GOLD: { name: 'Gold', emoji: '🥇', points: 50 },
  PLATINUM: { name: 'Platinum', emoji: '💎', points: 75 },
  DIAMOND: { name: 'Diamond', emoji: '🔱', points: 100 }
};

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

function generateFlag(category, subcategory, tier) {
  const tierInfo = TIERS[tier.toUpperCase()];
  const hash = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FLAG{${subcategory.toUpperCase()}_${tierInfo.emoji}_${category.toUpperCase()}_${hash}}`;
}

function createFlagFiles() {
  let totalFlags = 0;

  Object.entries(CATEGORIES).forEach(([category, subcategories]) => {
    Object.entries(subcategories).forEach(([subcategory, tiers]) => {
      tiers.forEach(tier => {
        const dir = path.join(FLAGS_DIR, category, subcategory);
        const filename = `${subcategory}_${tier}.txt`;
        const filePath = path.join(dir, filename);

        // Create directory if not exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Generate flag content
        const flagValue = generateFlag(category, subcategory, tier);
        const tierInfo = TIERS[tier.toUpperCase()];
        const content = `${flagValue}

This flag was captured using ${subcategory.toUpperCase()} attack (${tierInfo.name} tier).
Points: ${tierInfo.points}
Category: ${category}
Technique: ${subcategory}

Congratulations on successfully exploiting this vulnerability!`;

        fs.writeFileSync(filePath, content);
        console.log(`Created: ${category}/${subcategory}/${filename}`);
        totalFlags++;
      });
    });
  });

  console.log(`\n=================================`);
  console.log(`Total flags generated: ${totalFlags}`);
  console.log(`=================================`);

  // Calculate max score
  let maxScore = 0;
  Object.entries(CATEGORIES).forEach(([category, subcategories]) => {
    Object.entries(subcategories).forEach(([subcategory, tiers]) => {
      tiers.forEach(tier => {
        maxScore += TIERS[tier.toUpperCase()].points;
      });
    });
  });
  console.log(`Maximum possible score: ${maxScore} points`);
}

createFlagFiles();
