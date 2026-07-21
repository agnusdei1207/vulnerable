#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  CHALLENGE_BUILDERS,
  ISOLATED_CHALLENGE_MODES,
} = require("../app/isolated/challenges");
const {
  selected,
  routePrefix,
  flagValue,
  compose,
  proxyConfig,
  proxyDockerfile,
  proxyIndex,
} = require("./generate-isolated-compose");

const ROOT_DIR = path.resolve(__dirname, "..");
const COMPOSE_FILES = ["docker-compose.yml", "docker-compose-20.yml"];
const EXPECTED_CHALLENGE_COUNT = 20;
const EXPECTED_DIFFICULTIES = { Medium: 14, Hard: 6 };
const EXPECTED_TOTAL_POINTS = 100;
const PROXY_FILES = [
  ["proxy/Dockerfile", proxyDockerfile],
  ["proxy/nginx.conf", proxyConfig],
  ["proxy/index.html", proxyIndex],
];

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n");
}

function analyzeCompose(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  const challengeServices = [];
  const flagValues = [];
  const challengeModes = [];
  const directPorts = [];

  for (const line of lines) {
    const serviceMatch = line.match(/^  (?!seed-)([a-z0-9_-]+-silver):$/);
    if (serviceMatch) {
      challengeServices.push(serviceMatch[1]);
    }

    const flagMatch = line.match(/^\s{6}- FLAG=(.+)$/);
    if (flagMatch) {
      flagValues.push(flagMatch[1]);
    }

    const challengeModeMatch = line.match(/^\s{6}- CHALLENGE_MODE=(.+)$/);
    if (challengeModeMatch) {
      challengeModes.push(challengeModeMatch[1]);
    }

    const directPortMatch = line.match(/^\s{6}- "(\d+):3000"$/);
    if (directPortMatch) {
      directPorts.push(Number(directPortMatch[1]));
    }
  }

  return {
    challengeServices,
    challengeModes,
    challengeServiceCount: challengeServices.length,
    uniqueChallengeServiceCount: new Set(challengeServices).size,
    flagCount: flagValues.length,
    uniqueFlagCount: new Set(flagValues).size,
    challengeModeCount: challengeModes.length,
    uniqueChallengeModeCount: new Set(challengeModes).size,
    directPortCount: directPorts.length,
    directPorts,
  };
}

function formatSummary(fileName, result) {
  return `${fileName}: challenge services=${result.challengeServiceCount}, flag envs=${result.flagCount}, challenge modes=${result.challengeModeCount}, direct ports=${result.directPortCount}, unique flags=${result.uniqueFlagCount}`;
}

function assertGeneratedAsset(fileName, actualText, expectedText) {
  if (normalizeText(actualText) !== normalizeText(expectedText)) {
    throw new Error(
      `${fileName}: generated asset drift detected; run node scripts/generate-isolated-compose.js`,
    );
  }
}

function diffSets(expected, actual) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((value) => !actualSet.has(value)),
    unexpected: actual.filter((value) => !expectedSet.has(value)),
  };
}

function assertExpectedShape(fileName, result) {
  const errors = [];

  if (result.challengeServiceCount !== EXPECTED_CHALLENGE_COUNT) {
    errors.push(
      `expected ${EXPECTED_CHALLENGE_COUNT} challenge services, found ${result.challengeServiceCount}`,
    );
  }
  if (result.uniqueChallengeServiceCount !== EXPECTED_CHALLENGE_COUNT) {
    errors.push(
      `expected ${EXPECTED_CHALLENGE_COUNT} unique challenge services, found ${result.uniqueChallengeServiceCount}`,
    );
  }
  if (result.flagCount !== EXPECTED_CHALLENGE_COUNT) {
    errors.push(`expected ${EXPECTED_CHALLENGE_COUNT} FLAG env entries, found ${result.flagCount}`);
  }
  if (result.uniqueFlagCount !== EXPECTED_CHALLENGE_COUNT) {
    errors.push(
      `expected ${EXPECTED_CHALLENGE_COUNT} unique FLAG values, found ${result.uniqueFlagCount}`,
    );
  }
  if (result.challengeModeCount !== EXPECTED_CHALLENGE_COUNT) {
    errors.push(
      `expected ${EXPECTED_CHALLENGE_COUNT} CHALLENGE_MODE env entries, found ${result.challengeModeCount}`,
    );
  }
  if (result.uniqueChallengeModeCount !== EXPECTED_CHALLENGE_COUNT) {
    errors.push(
      `expected ${EXPECTED_CHALLENGE_COUNT} unique CHALLENGE_MODE values, found ${result.uniqueChallengeModeCount}`,
    );
  }
  if (result.directPortCount !== EXPECTED_CHALLENGE_COUNT) {
    errors.push(`expected ${EXPECTED_CHALLENGE_COUNT} direct host ports, found ${result.directPortCount}`);
  }

  const expectedPorts = Array.from({ length: EXPECTED_CHALLENGE_COUNT }, (_, index) => 4100 + index);
  const actualPorts = [...new Set(result.directPorts)].sort((a, b) => a - b);
  const missingPorts = expectedPorts.filter((port) => !actualPorts.includes(port));
  const unexpectedPorts = actualPorts.filter((port) => !expectedPorts.includes(port));
  if (missingPorts.length > 0 || unexpectedPorts.length > 0) {
    errors.push(
      `expected direct host ports 4100-4119, missing [${missingPorts.join(", ")}], unexpected [${unexpectedPorts.join(", ")}]`,
    );
  }

  const composeModes = [...new Set(result.challengeModes)].sort();
  const selectedModes = selected
    .map(([, subdir]) => `/${routePrefix(subdir)}/silver`)
    .sort();
  const registryDiff = diffSets(selectedModes, composeModes);
  if (registryDiff.missing.length > 0 || registryDiff.unexpected.length > 0) {
    errors.push(
      `compose and selected challenge set diverge; missing [${registryDiff.missing.join(", ")}], unexpected [${registryDiff.unexpected.join(", ")}]`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`${fileName}: ${errors.join("; ")}`);
  }
}

function assertBuilderFlagPaths() {
  const missingFlagPath = [];

  for (const [mode, builder] of Object.entries(CHALLENGE_BUILDERS)) {
    const source = builder.toString();
    // Advanced challenge builders escalate past the standard HTTP issueFlag()
    // path and lock the flag or pivot material behind the shell chain.
    const hasFlagPath =
      source.includes("issueFlag(") ||
      source.includes("lockReverseSilverFlag(") ||
      source.includes("lockPivotSilverArtifacts(") ||
      source.includes("lockChainSilverArtifacts(") ||
      source.includes("lockHardPivotArtifacts(");
    if (!hasFlagPath) {
      missingFlagPath.push(mode);
    }
  }

  if (missingFlagPath.length > 0) {
    throw new Error(
      `challenge builders without an issueFlag path: ${missingFlagPath.join(", ")}`,
    );
  }
}

function assertDifficultyShape() {
  const actual = {};
  for (const [, , difficulty] of selected) {
    actual[difficulty] = (actual[difficulty] || 0) + 1;
  }

  const matches = Object.entries(EXPECTED_DIFFICULTIES).every(
    ([difficulty, count]) => actual[difficulty] === count,
  ) && Object.keys(actual).length === Object.keys(EXPECTED_DIFFICULTIES).length;
  if (!matches) {
    throw new Error(
      `expected difficulty distribution ${JSON.stringify(EXPECTED_DIFFICULTIES)}, found ${JSON.stringify(actual)}`,
    );
  }
}

function assertScoreAndFlagShape() {
  const totalPoints = selected.reduce((sum, [, , , points]) => sum + points, 0);
  if (totalPoints !== EXPECTED_TOTAL_POINTS) {
    throw new Error(`expected total score ${EXPECTED_TOTAL_POINTS}, found ${totalPoints}`);
  }

  for (const [layer, subdir, difficulty, points, technique] of selected) {
    const flag = flagValue(layer, subdir, difficulty, points, technique);
    const expectedPrefix = `FLAG{${subdir.toUpperCase()}_${layer.toUpperCase()}_${technique}_HTB_${difficulty.toUpperCase()}_${points}PTS_`;
    if (!flag.startsWith(expectedPrefix) || !/_[A-F0-9]{6}\}$/.test(flag)) {
      throw new Error(`invalid weighted HTB flag for ${subdir}: ${flag}`);
    }
  }
}

function main() {
  const results = [];
  assertBuilderFlagPaths();
  assertDifficultyShape();
  assertScoreAndFlagShape();

  for (const composeFile of COMPOSE_FILES) {
    const filePath = path.join(ROOT_DIR, composeFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing compose file: ${composeFile}`);
    }

    assertGeneratedAsset(composeFile, fs.readFileSync(filePath, "utf8"), compose());
    const result = analyzeCompose(filePath);
    assertExpectedShape(composeFile, result);
    results.push(formatSummary(composeFile, result));
  }

  for (const [relativePath, generator] of PROXY_FILES) {
    const filePath = path.join(ROOT_DIR, relativePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing proxy asset: ${relativePath}`);
    }
    assertGeneratedAsset(relativePath, fs.readFileSync(filePath, "utf8"), generator());
  }

  for (const line of results) {
    console.log(line);
  }
  console.log(
    `Selected challenge modes=${selected.length} (${Object.entries(EXPECTED_DIFFICULTIES).map(([name, count]) => `${name}=${count}`).join(", ")}), weighted total=${EXPECTED_TOTAL_POINTS} pts, available builders=${ISOLATED_CHALLENGE_MODES.length}`,
  );
  console.log(`Verified proxy assets=${PROXY_FILES.length}`);
  console.log("All isolated benchmark checks passed.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
