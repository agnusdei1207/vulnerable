#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  CHALLENGE_BUILDERS,
  ISOLATED_CHALLENGE_MODES,
} = require("../app/isolated/challenges");
const {
  compose,
  proxyConfig,
  proxyDockerfile,
  proxyIndex,
} = require("./generate-isolated-compose");

const ROOT_DIR = path.resolve(__dirname, "..");
const COMPOSE_FILES = ["docker-compose.yml", "docker-compose-40.yml"];
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

  if (result.challengeServiceCount !== 40) {
    errors.push(
      `expected 40 challenge services, found ${result.challengeServiceCount}`,
    );
  }
  if (result.uniqueChallengeServiceCount !== 40) {
    errors.push(
      `expected 40 unique challenge services, found ${result.uniqueChallengeServiceCount}`,
    );
  }
  if (result.flagCount !== 40) {
    errors.push(`expected 40 FLAG env entries, found ${result.flagCount}`);
  }
  if (result.uniqueFlagCount !== 40) {
    errors.push(
      `expected 40 unique FLAG values, found ${result.uniqueFlagCount}`,
    );
  }
  if (result.challengeModeCount !== 40) {
    errors.push(
      `expected 40 CHALLENGE_MODE env entries, found ${result.challengeModeCount}`,
    );
  }
  if (result.uniqueChallengeModeCount !== 40) {
    errors.push(
      `expected 40 unique CHALLENGE_MODE values, found ${result.uniqueChallengeModeCount}`,
    );
  }
  if (result.directPortCount !== 40) {
    errors.push(`expected 40 direct host ports, found ${result.directPortCount}`);
  }

  const expectedPorts = Array.from({ length: 40 }, (_, index) => 4100 + index);
  const actualPorts = [...new Set(result.directPorts)].sort((a, b) => a - b);
  const missingPorts = expectedPorts.filter((port) => !actualPorts.includes(port));
  const unexpectedPorts = actualPorts.filter((port) => !expectedPorts.includes(port));
  if (missingPorts.length > 0 || unexpectedPorts.length > 0) {
    errors.push(
      `expected direct host ports 4100-4139, missing [${missingPorts.join(", ")}], unexpected [${unexpectedPorts.join(", ")}]`,
    );
  }

  const composeModes = [...new Set(result.challengeModes)].sort();
  const registryDiff = diffSets(ISOLATED_CHALLENGE_MODES, composeModes);
  if (registryDiff.missing.length > 0 || registryDiff.unexpected.length > 0) {
    errors.push(
      `compose and isolated registry diverge; missing [${registryDiff.missing.join(", ")}], unexpected [${registryDiff.unexpected.join(", ")}]`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`${fileName}: ${errors.join("; ")}`);
  }
}

function assertBuilderFlagPaths() {
  const missingFlagPath = [];

  for (const [mode, builder] of Object.entries(CHALLENGE_BUILDERS)) {
    if (!builder.toString().includes("issueFlag(")) {
      missingFlagPath.push(mode);
    }
  }

  if (missingFlagPath.length > 0) {
    throw new Error(
      `challenge builders without an issueFlag path: ${missingFlagPath.join(", ")}`,
    );
  }
}

function main() {
  const results = [];
  assertBuilderFlagPaths();

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
    `Registered isolated challenge modes=${ISOLATED_CHALLENGE_MODES.length}, builders with flag path=${Object.keys(CHALLENGE_BUILDERS).length}`,
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
