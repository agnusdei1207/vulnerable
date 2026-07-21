#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  EXPECTED_CHALLENGE_COUNT,
  EXPECTED_DIFFICULTIES,
  EXPECTED_TOTAL_POINTS,
  DEFAULT_BASE_DOMAIN,
  benchmarkHost,
  challengeHost,
  challengeRoute,
  flagValue,
  hasHardPivotRelay,
  routePrefix,
  selected,
  serviceName
} = require('./benchmark-config');
const {
  k8sManifest,
  manifestOutputPath,
  proxyConfig,
  proxyDockerfile,
  proxyIndex
} = require('./generate-k8s-manifests');
const { CHALLENGE_BUILDERS, ISOLATED_CHALLENGE_MODES } = require('../app/isolated/challenges');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROXY_FILES = [
  ['proxy/Dockerfile', proxyDockerfile()],
  ['proxy/nginx.conf', proxyConfig()],
  ['proxy/index.html', proxyIndex(DEFAULT_BASE_DOMAIN)]
];

function normalizeText(text) {
  return text.replace(/\r\n/g, '\n');
}

function assertEqualAsset(relativePath, expectedText) {
  const filePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing generated asset: ${relativePath}`);
  }
  const actualText = fs.readFileSync(filePath, 'utf8');
  if (normalizeText(actualText) !== normalizeText(expectedText)) {
    throw new Error(`${relativePath}: generated asset drift detected; run node scripts/generate-k8s-manifests.js`);
  }
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function assertIncludes(text, value, label) {
  if (!text.includes(value)) {
    throw new Error(`${label}: missing ${value}`);
  }
}

function assertBuilderFlagPaths() {
  const missingFlagPath = [];

  for (const [mode, builder] of Object.entries(CHALLENGE_BUILDERS)) {
    const source = builder.toString();
    const hasFlagPath =
      source.includes('issueFlag(') ||
      source.includes('lockReverseSilverFlag(') ||
      source.includes('lockPivotSilverArtifacts(') ||
      source.includes('lockChainSilverArtifacts(') ||
      source.includes('lockHardPivotArtifacts(');
    if (!hasFlagPath) {
      missingFlagPath.push(mode);
    }
  }

  if (missingFlagPath.length > 0) {
    throw new Error(`challenge builders without a flag path: ${missingFlagPath.join(', ')}`);
  }
}

function assertDifficultyShape() {
  const actual = {};
  for (const challenge of selected) {
    actual[challenge.difficulty] = (actual[challenge.difficulty] || 0) + 1;
  }

  const matches = Object.entries(EXPECTED_DIFFICULTIES).every(
    ([difficulty, count]) => actual[difficulty] === count
  ) && Object.keys(actual).length === Object.keys(EXPECTED_DIFFICULTIES).length;
  if (!matches) {
    throw new Error(
      `expected difficulty distribution ${JSON.stringify(EXPECTED_DIFFICULTIES)}, found ${JSON.stringify(actual)}`
    );
  }
}

function assertScoreAndFlags() {
  const totalPoints = selected.reduce((sum, challenge) => sum + challenge.points, 0);
  if (totalPoints !== EXPECTED_TOTAL_POINTS) {
    throw new Error(`expected total score ${EXPECTED_TOTAL_POINTS}, found ${totalPoints}`);
  }

  for (const challenge of selected) {
    const flag = flagValue(
      challenge.layer,
      challenge.slug,
      challenge.difficulty,
      challenge.points,
      challenge.technique
    );
    const expectedPrefix = `FLAG{${challenge.slug.toUpperCase()}_${challenge.layer.toUpperCase()}_${challenge.technique}_HTB_${challenge.difficulty.toUpperCase()}_${challenge.points}PTS_`;
    if (!flag.startsWith(expectedPrefix) || !/_[A-F0-9]{6}\}$/.test(flag)) {
      throw new Error(`invalid weighted flag for ${challenge.slug}: ${flag}`);
    }
  }
}

function verifyKubectlDryRun(manifestPath) {
  const result = spawnSync('kubectl', ['apply', '--dry-run=client', '-f', manifestPath], {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });
  if (result.error && result.error.code === 'ENOENT') {
    return 'kubectl unavailable; skipped dry-run';
  }
  if (result.status !== 0) {
    throw new Error(`kubectl dry-run failed: ${result.stderr || result.stdout}`);
  }
  return 'kubectl dry-run ok';
}

function main() {
  assertBuilderFlagPaths();
  assertDifficultyShape();
  assertScoreAndFlags();

  const manifestPath = manifestOutputPath;
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing generated manifest: ${path.relative(ROOT_DIR, manifestPath)}`);
  }

  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const expectedManifest = k8sManifest(DEFAULT_BASE_DOMAIN);
  if (normalizeText(manifestText) !== normalizeText(expectedManifest)) {
    throw new Error('k8s/luxora-benchmark.yaml: generated asset drift detected; run node scripts/generate-k8s-manifests.js');
  }

  for (const [relativePath, expectedText] of PROXY_FILES) {
    assertEqualAsset(relativePath, expectedText);
  }

  for (const challenge of selected) {
    assertIncludes(manifestText, `name: ${serviceName(challenge.slug)}`, 'manifest');
    assertIncludes(manifestText, `value: "${challengeRoute(challenge.slug)}"`, 'manifest');
    assertIncludes(
      manifestText,
      `value: "${flagValue(challenge.layer, challenge.slug, challenge.difficulty, challenge.points, challenge.technique)}"`,
      'manifest'
    );
    assertIncludes(manifestText, `host: ${challengeHost(challenge.slug, DEFAULT_BASE_DOMAIN)}`, 'manifest');
  }
  assertIncludes(manifestText, `host: ${benchmarkHost(DEFAULT_BASE_DOMAIN)}`, 'manifest');

  const deploymentCount = countMatches(manifestText, /^kind: Deployment$/gm);
  const serviceCount = countMatches(manifestText, /^kind: Service$/gm);
  const ingressCount = countMatches(manifestText, /^kind: Ingress$/gm);
  const flagCount = countMatches(manifestText, /^\s+- name: FLAG$/gm);
  const challengeModeCount = countMatches(manifestText, /^\s+- name: CHALLENGE_MODE$/gm);
  const relayCount = selected.filter((challenge) => hasHardPivotRelay(challenge.slug)).length;
  const hostRuleCount = countMatches(manifestText, /^    - host: /gm);

  const expectedDeployments = EXPECTED_CHALLENGE_COUNT + relayCount + 1;
  const expectedServices = EXPECTED_CHALLENGE_COUNT + relayCount + 1;
  const expectedHosts = EXPECTED_CHALLENGE_COUNT + 1;

  if (deploymentCount !== expectedDeployments) {
    throw new Error(`expected ${expectedDeployments} deployments, found ${deploymentCount}`);
  }
  if (serviceCount !== expectedServices) {
    throw new Error(`expected ${expectedServices} services, found ${serviceCount}`);
  }
  if (ingressCount !== 2) {
    throw new Error(`expected 2 ingress resources, found ${ingressCount}`);
  }
  if (flagCount !== EXPECTED_CHALLENGE_COUNT) {
    throw new Error(`expected ${EXPECTED_CHALLENGE_COUNT} FLAG env entries, found ${flagCount}`);
  }
  if (challengeModeCount !== EXPECTED_CHALLENGE_COUNT) {
    throw new Error(`expected ${EXPECTED_CHALLENGE_COUNT} CHALLENGE_MODE env entries, found ${challengeModeCount}`);
  }
  if (hostRuleCount !== expectedHosts) {
    throw new Error(`expected ${expectedHosts} ingress host rules, found ${hostRuleCount}`);
  }

  const dryRunSummary = verifyKubectlDryRun(manifestPath);

  console.log(
    `k8s/luxora-benchmark.yaml: deployments=${deploymentCount}, services=${serviceCount}, ingresses=${ingressCount}, challenge envs=${challengeModeCount}, unique flags=${flagCount}`
  );
  console.log(
    `Selected challenge modes=${selected.length} (${Object.entries(EXPECTED_DIFFICULTIES).map(([name, count]) => `${name}=${count}`).join(', ')}), weighted total=${EXPECTED_TOTAL_POINTS} pts, available builders=${ISOLATED_CHALLENGE_MODES.length}`
  );
  console.log(`Verified proxy assets=${PROXY_FILES.length}, ingress hosts=${hostRuleCount}, ${dryRunSummary}`);
  console.log('All k3s benchmark checks passed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
