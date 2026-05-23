#!/usr/bin/env npx tsx
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allScenarios, scenarioNames } from "./scenarios/index";
import { runScenario, printSummary, logHeader, logStep } from "./utils";
import type { E2EContext, ScenarioResult } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const candidates = [
    resolve(__dirname, "../../.env"),
    resolve(process.cwd(), ".env"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      const lines = readFileSync(path, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!env[key]) env[key] = value;
      }
    }
  }
  return env;
}

function parseArgs(): { repo: string; scenarios: string[]; listOnly: boolean } {
  const args = process.argv.slice(2);
  const env = loadEnv();

  let repo = env.TEST_REPO || "";
  let scenarios: string[] = [];
  let listOnly = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--repo":
        repo = args[++i] || "";
        break;
      case "--scenario":
        scenarios.push(args[++i] || "");
        break;
      case "--list":
        listOnly = true;
        break;
      case "--all":
        scenarios = [...scenarioNames];
        break;
      default:
        if (!args[i].startsWith("-")) {
          scenarios.push(args[i]);
        }
    }
  }

  if (!repo && !listOnly) {
    console.error(
      "Error: --repo <owner/repo> is required, or set TEST_REPO in .env",
    );
    process.exit(1);
  }

  // Validate scenario names and resolve to ordered list
  if (listOnly) return { repo, scenarios: [], listOnly: true };

  if (scenarios.length === 0) {
    scenarios = ["happy-path"];
  }

  const invalid = scenarios.filter((s) => !allScenarios[s]);
  if (invalid.length > 0) {
    console.error(`Error: unknown scenario(s): ${invalid.join(", ")}`);
    console.error(`Available: ${scenarioNames.join(", ")}`);
    process.exit(1);
  }

  return { repo, scenarios, listOnly };
}

function resolveToken(env: Record<string, string>): void {
  if (!process.env.GH_TOKEN) {
    const token = env.GITHUB_TOKEN || env.GH_TOKEN || "";
    if (token) {
      process.env.GH_TOKEN = token;
    }
  }
}

async function main() {
  const env = loadEnv();
  const { repo, scenarios, listOnly } = parseArgs();

  if (listOnly) {
    logHeader("Available E2E Test Scenarios");
    for (const name of scenarioNames) {
      const s = allScenarios[name];
      console.log(`  ${name}`);
      console.log(`    ${s.description}`);
      console.log(`    Timeout: ${s.timeoutMs}ms`);
    }
    console.log("");
    return;
  }

  resolveToken(env);

  if (!process.env.GH_TOKEN) {
    console.error(
      "Error: GH_TOKEN not set. Set GITHUB_TOKEN in .env or export GH_TOKEN.",
    );
    process.exit(1);
  }

  logHeader("E2E Test Runner");
  console.log(`  Repo: ${repo}`);
  console.log(`  Scenarios: ${scenarios.join(", ")}`);
  console.log("");

  const results: ScenarioResult[] = [];

  for (const name of scenarios) {
    const scenario = allScenarios[name];

    const ctx: E2EContext = {
      repo,
      repoUrl: `https://github.com/${repo}`,
      metadata: {},
    };

    const result = await runScenario(scenario, ctx);
    results.push(result);
  }

  printSummary(results);

  const failed = results.filter((r) => !r.passed).length;
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
