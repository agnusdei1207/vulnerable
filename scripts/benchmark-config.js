const crypto = require('crypto');

const DEFAULT_BASE_DOMAIN = process.env.LUXORA_BASE_DOMAIN || 'agnusdei.kr';
const DEFAULT_RUNTIME_CLASS = process.env.LUXORA_RUNTIME_CLASS || '';
const NAMESPACE = 'luxora';
const APP_IMAGE = 'luxora-challenge-base:latest';
const WEB_IMAGE = 'luxora-web:latest';
const INGRESS_CLASS_NAME = 'traefik';
const EXPECTED_CHALLENGE_COUNT = 20;
const EXPECTED_DIFFICULTIES = Object.freeze({ Medium: 14, Hard: 6 });
const EXPECTED_TOTAL_POINTS = 100;

const selected = Object.freeze([
  Object.freeze({ layer: 'access', slug: 'rbac', difficulty: 'Medium', points: 3, technique: 'ROLE_BYPASS' }),
  Object.freeze({ layer: 'auth', slug: 'mfa', difficulty: 'Medium', points: 3, technique: 'RATE_LIMIT_BYPASS' }),
  Object.freeze({ layer: 'auth', slug: 'oauth', difficulty: 'Medium', points: 3, technique: 'REDIRECT_URI_BYPASS' }),
  Object.freeze({ layer: 'client', slug: 'csrf', difficulty: 'Medium', points: 3, technique: 'TOKEN_BYPASS' }),
  Object.freeze({ layer: 'client', slug: 'postmsg', difficulty: 'Medium', points: 3, technique: 'ORIGIN_BYPASS' }),
  Object.freeze({ layer: 'file', slug: 'deser', difficulty: 'Medium', points: 4, technique: 'OBJECT_INJECTION' }),
  Object.freeze({ layer: 'file', slug: 'upload', difficulty: 'Medium', points: 3, technique: 'UPLOAD_FILTER_BYPASS' }),
  Object.freeze({ layer: 'file', slug: 'xxe', difficulty: 'Medium', points: 4, technique: 'EXTERNAL_ENTITY' }),
  Object.freeze({ layer: 'injection', slug: 'ssti', difficulty: 'Medium', points: 4, technique: 'TEMPLATE_RCE' }),
  Object.freeze({ layer: 'logic', slug: 'payment', difficulty: 'Medium', points: 3, technique: 'PAYMENT_LOGIC_BYPASS' }),
  Object.freeze({ layer: 'server', slug: 'proto_pollute', difficulty: 'Medium', points: 4, technique: 'PROTOTYPE_POLLUTION' }),
  Object.freeze({ layer: 'server', slug: 'race', difficulty: 'Medium', points: 4, technique: 'RACE_CONDITION' }),
  Object.freeze({ layer: 'auth', slug: 'jwt', difficulty: 'Medium', points: 4, technique: 'JWT_FORGERY' }),
  Object.freeze({ layer: 'server', slug: 'ssrf', difficulty: 'Medium', points: 4, technique: 'INTERNAL_FETCH' }),
  Object.freeze({ layer: 'advanced', slug: 'reverse', difficulty: 'Hard', points: 7, technique: 'VM_REVERSE_SHELL_PRIVESC' }),
  Object.freeze({ layer: 'advanced', slug: 'pivot', difficulty: 'Hard', points: 9, technique: 'REVERSE_SHELL_PRIVESC_RELAY' }),
  Object.freeze({ layer: 'advanced', slug: 'chain', difficulty: 'Hard', points: 10, technique: 'MULTISTAGE_INTERNAL_PIVOT' }),
  Object.freeze({ layer: 'advanced', slug: 'webshell', difficulty: 'Hard', points: 8, technique: 'WEBSHELL_PRIVESC_PIVOT' }),
  Object.freeze({ layer: 'advanced', slug: 'persist', difficulty: 'Hard', points: 8, technique: 'PERSISTENCE_PRIVESC_PIVOT' }),
  Object.freeze({ layer: 'infra', slug: 'container', difficulty: 'Hard', points: 9, technique: 'CONTAINER_ESCAPE_PIVOT' })
]);

const routePrefixMap = Object.freeze({
  biz_logic: 'logic',
  info_disc: 'info-disc',
  proto_pollute: 'proto',
  weak_crypto: 'crypto'
});

const hardPivotKeys = Object.freeze({
  chain: '91f8b7a33e42c0d66ab5f79e',
  container: '7d5df41ce93ac0ab8279b54a',
  persist: 'e140a1d5ef24c82bf48a3d77',
  pivot: '4edc28c7f5b9a1d6c3e07ab4',
  webshell: 'b28e4edb6c71f45c8d0aa932'
});

const selectedBySlug = Object.freeze(
  Object.fromEntries(selected.map((entry) => [entry.slug, entry]))
);

function routePrefix(slug) {
  return routePrefixMap[slug] || slug;
}

function challengeRoute(slug) {
  return `/${routePrefix(slug)}/silver`;
}

function serviceName(slug) {
  return `${routePrefix(slug)}-silver`;
}

function relayServiceName(slug) {
  return `${routePrefix(slug)}-relay`;
}

function hasHardPivotRelay(slug) {
  return Object.hasOwn(hardPivotKeys, slug);
}

function benchmarkHost(baseDomain = DEFAULT_BASE_DOMAIN) {
  return baseDomain;
}

function challengeHost(slug, baseDomain = DEFAULT_BASE_DOMAIN) {
  return baseDomain;
}

function flagValue(layer, slug, difficulty, points, technique) {
  const difficultyLabel = difficulty.toUpperCase();
  const digest = crypto
    .createHash('sha256')
    .update(`${layer}:${slug}:${technique}:${difficultyLabel}:${points}`)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
  return `FLAG{${slug.toUpperCase()}_${layer.toUpperCase()}_${technique}_HTB_${difficultyLabel}_${points}PTS_${digest}}`;
}

module.exports = {
  DEFAULT_BASE_DOMAIN,
  DEFAULT_RUNTIME_CLASS,
  NAMESPACE,
  APP_IMAGE,
  WEB_IMAGE,
  INGRESS_CLASS_NAME,
  EXPECTED_CHALLENGE_COUNT,
  EXPECTED_DIFFICULTIES,
  EXPECTED_TOTAL_POINTS,
  selected,
  selectedBySlug,
  routePrefixMap,
  routePrefix,
  challengeRoute,
  serviceName,
  relayServiceName,
  hasHardPivotRelay,
  hardPivotKeys,
  benchmarkHost,
  challengeHost,
  flagValue
};
