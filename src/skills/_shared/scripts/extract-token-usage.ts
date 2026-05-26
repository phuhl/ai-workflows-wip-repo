import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { runStats, parseStats, StatsSnapshot } from "./stats-snapshot";

const USAGE =
  "Usage: extract-token-usage <log-file> <skill-name>\n" +
  "       extract-token-usage --delta <skill-name> [--model <m>] [--variant <v>]";

interface TokenUsage {
  skill: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  source: "opencode" | "estimated";
  duration_ms?: number;
}

const STATS_FILE = "/tmp/opencode-stats.json";

function main(): void {
  const deltaMode = process.argv[2] === "--delta";
  const logFile = deltaMode ? undefined : process.argv[2];
  const skillName = deltaMode ? process.argv[3] : process.argv[3];

  // Parse optional --model and --variant from remaining args
  let model: string | undefined;
  let variant: string | undefined;
  const args = process.argv.slice(deltaMode ? 4 : 4);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) model = args[++i];
    if (args[i] === "--variant" && args[i + 1]) variant = args[++i];
  }

  if ((!deltaMode && !logFile) || !skillName) {
    console.error(USAGE);
    process.exit(1);
  }

  let usage: TokenUsage;

  if (deltaMode) {
    usage = extractFromStats(skillName);
  } else {
    let content: string | undefined;
    try {
      content = readFileSync(logFile!, "utf-8");
    } catch {
      content = undefined;
    }
    const logUsage =
      content != null ? extractTokens(content, skillName) : undefined;
    if (logUsage && logUsage.source === "opencode") {
      usage = logUsage;
    } else {
      const statsUsage = extractFromStats(skillName);
      usage =
        statsUsage.source === "opencode"
          ? statsUsage
          : (logUsage ?? statsUsage);
    }
  }

  const fields = [
    `skill=${usage.skill}`,
    `prompt=${usage.prompt_tokens}`,
    `completion=${usage.completion_tokens}`,
    `total=${usage.total_tokens}`,
    `source=${usage.source}`,
  ];
  if (model) fields.push(`model=${model}`);
  if (variant) fields.push(`variant=${variant}`);
  if (usage.duration_ms != null)
    fields.push(`duration_ms=${usage.duration_ms}`);

  const structuredLine = `OPENCODE_TOKEN_USAGE:${fields.join(":")}`;
  console.log(structuredLine);
  console.log(JSON.stringify(usage));
}

function extractFromStats(skillName: string): TokenUsage {
  const output = runStats();
  const current = output ? parseStats(output) : null;
  if (!current) {
    return fallbackZero(skillName);
  }

  current.timestamp = Date.now();

  let prev: StatsSnapshot | null = null;
  if (existsSync(STATS_FILE)) {
    try {
      prev = JSON.parse(readFileSync(STATS_FILE, "utf-8"));
    } catch {
      // corrupt file
    }
  }

  try {
    mkdirSync("/tmp", { recursive: true });
    writeFileSync(STATS_FILE, JSON.stringify(current));
  } catch {
    // non-fatal
  }

  const durationMs =
    prev && prev.timestamp
      ? Math.max(0, current.timestamp - prev.timestamp)
      : undefined;

  if (!prev) {
    return {
      skill: skillName,
      prompt_tokens: current.input,
      completion_tokens: current.output,
      total_tokens: current.input + current.output,
      source: "opencode",
      duration_ms: durationMs,
    };
  }

  const prompt = Math.max(0, current.input - prev.input);
  const completion = Math.max(0, current.output - prev.output);

  return {
    skill: skillName,
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    source: "opencode",
    duration_ms: durationMs,
  };
}

function extractTokens(content: string, skillName: string): TokenUsage {
  const explicitMatch = content.match(
    /OPENCODE_TOKEN_USAGE:skill=\w+:prompt=(\d+):completion=(\d+):total=(\d+)/,
  );
  if (explicitMatch) {
    return {
      skill: skillName,
      prompt_tokens: parseInt(explicitMatch[1], 10),
      completion_tokens: parseInt(explicitMatch[2], 10),
      total_tokens: parseInt(explicitMatch[3], 10),
      source: "opencode",
    };
  }

  const usageJsonMatch = content.match(
    /"usage"\s*:\s*\{[^}]*"prompt_tokens"\s*:\s*(\d+)[^}]*"completion_tokens"\s*:\s*(\d+)[^}]*"total_tokens"\s*:\s*(\d+)[^}]*\}/,
  );
  if (usageJsonMatch) {
    return {
      skill: skillName,
      prompt_tokens: parseInt(usageJsonMatch[1], 10),
      completion_tokens: parseInt(usageJsonMatch[2], 10),
      total_tokens: parseInt(usageJsonMatch[3], 10),
      source: "opencode",
    };
  }

  const kvTotal = content.match(/total_tokens[=:]\s*(\d+)/i);
  const kvPrompt = content.match(/prompt_tokens[=:]\s*(\d+)/i);
  const kvCompletion = content.match(/completion_tokens[=:]\s*(\d+)/i);

  if (kvTotal) {
    const total = parseInt(kvTotal[1], 10);
    const prompt = kvPrompt ? parseInt(kvPrompt[1], 10) : 0;
    const completion = kvCompletion
      ? parseInt(kvCompletion[1], 10)
      : total - prompt;
    return {
      skill: skillName,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total,
      source: "opencode",
    };
  }

  const inputOutputMatch = content.match(
    /(\d+)\s*,?\s*input tokens?\s*,?\s*(\d+)\s*,?\s*output tokens?/i,
  );
  if (inputOutputMatch) {
    const prompt = parseInt(inputOutputMatch[1], 10);
    const completion = parseInt(inputOutputMatch[2], 10);
    return {
      skill: skillName,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: prompt + completion,
      source: "opencode",
    };
  }

  const simpleTotal = content.match(
    /(?:token usage|total tokens)[=:]\s*(\d+)/i,
  );
  if (simpleTotal) {
    return {
      skill: skillName,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: parseInt(simpleTotal[1], 10),
      source: "opencode",
    };
  }

  const genericTokens = content.match(/tokens?[=:]\s*(\d+)/i);
  if (genericTokens) {
    return {
      skill: skillName,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: parseInt(genericTokens[1], 10),
      source: "opencode",
    };
  }

  const stripped = content.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  const estimated = Math.round(stripped.length / 4);
  return {
    skill: skillName,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: estimated,
    source: "estimated",
  };
}

function fallbackZero(skillName: string): TokenUsage {
  return {
    skill: skillName,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    source: "estimated",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { extractTokens, TokenUsage };
