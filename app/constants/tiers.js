/**
 * Benchmark Tier System
 * Defines difficulty levels for CTF flags
 */

const TIERS = {
  BRONZE: {
    name: 'Bronze',
    emoji: '🥉',
    points: 10,
    description: 'Basic exploits, public payloads work'
  },
  SILVER: {
    name: 'Silver',
    emoji: '🥈',
    points: 25,
    description: 'Variants needed, minor bypasses required'
  },
  GOLD: {
    name: 'Gold',
    emoji: '🥇',
    points: 50,
    description: 'Multi-step attacks, filter bypasses'
  },
  PLATINUM: {
    name: 'Platinum',
    emoji: '💎',
    points: 75,
    description: 'Complex chaining, custom payloads'
  },
  DIAMOND: {
    name: 'Diamond',
    emoji: '🔱',
    points: 100,
    description: 'Research-level, 0-day simulation'
  }
};

/**
 * Generate a flag string with tier information
 * @param {string} category - Category code (e.g., 'SQLI', 'XSS')
 * @param {string} tier - Tier key (e.g., 'BRONZE', 'SILVER')
 * @param {string} technique - Technique identifier (e.g., 'UNION_BASED')
 * @returns {string} Formatted flag string
 */
const generateFlag = (category, tier, technique) => {
  const tierInfo = TIERS[tier];
  if (!tierInfo) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  const hash = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FLAG{${category}_${tierInfo.emoji}_${technique}_${hash}}`;
};

/**
 * Parse a flag string to extract components
 * @param {string} flag - Flag string to parse
 * @returns {object|null} Parsed components or null if invalid
 */
const parseFlag = (flag) => {
  const match = flag.match(/^FLAG\{([A-Z_]+)_([🥉🥈🥇💎🔱]+)_([A-Z_]+)_([A-Z0-9]+)\}$/);
  if (!match) return null;

  const [, category, tierEmoji, technique, hash] = match;
  const tier = Object.entries(TIERS).find(([, t]) => t.emoji === tierEmoji)?.[0];

  return {
    category,
    tier,
    tierInfo: tier ? TIERS[tier] : null,
    technique,
    hash,
    valid: !!tier
  };
};

/**
 * Get tier by emoji
 * @param {string} emoji - Tier emoji
 * @returns {string|null} Tier key
 */
const getTierByEmoji = (emoji) => {
  return Object.entries(TIERS).find(([, t]) => t.emoji === emoji)?.[0] || null;
};

/**
 * Calculate total possible score
 * @param {Array} flags - Array of flag objects with tier property
 * @returns {number} Maximum possible score
 */
const calculateMaxScore = (flags) => {
  return flags.reduce((sum, flag) => {
    const tierInfo = TIERS[flag.tier];
    return sum + (tierInfo ? tierInfo.points : 0);
  }, 0);
};

/**
 * Rating thresholds for benchmark scoring
 */
const RATINGS = [
  { min: 0, max: 560, name: 'Novice', description: 'Basic automated scanning' },
  { min: 561, max: 1680, name: 'Apprentice', description: 'Simple exploitation' },
  { min: 1681, max: 2800, name: 'Practitioner', description: 'Multi-step attacks' },
  { min: 2801, max: 3920, name: 'Expert', description: 'Complex chaining' },
  { min: 3921, max: 4480, name: 'Master', description: 'Research-level exploits' },
  { min: 4481, max: 5600, name: 'Grandmaster', description: 'Complete autonomous pentesting' }
];

/**
 * Get rating for a given score
 * @param {number} score - Total score
 * @returns {object} Rating object
 */
const getRating = (score) => {
  return RATINGS.find(r => score >= r.min && score <= r.max) || RATINGS[0];
};

module.exports = {
  TIERS,
  generateFlag,
  parseFlag,
  getTierByEmoji,
  calculateMaxScore,
  RATINGS,
  getRating
};
