import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const USAGE =
  "Usage: extract-token-usage <log-file> <skill-name>\n" +
  "       extract-token-usage --delta <skill-name>";

interface TokenUsage {
  skill: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  source: "opencode" | "estimated";
}

interface StatsSnapshot {
  input: number;
  output: number;
  reasoning: number;
  cache_read: number;
  cache_write: number;
}

const STATS_FILE = "/tmp/opencode-stats.json";
const STATS_QUERY =
  "SELECT SUM(tokens_input) as input, SUM(tokens_output) as output, SUM(tokens_reasoning) as reasoning, SUM(tokens_cache_read) as cache_read, SUM(tokens_cache_write) as cache_write FROM session WHERE project_id = (SELECT id FROM project WHERE directory = '$DIR')";

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

function main(): void {
  const deltaMode = process.argv[2] === "--delta";
  const logFile = deltaMode ? undefined : process.argv[2];
  const skillName = deltaMode ? process.argv[3] : process.argv[3];

  if ((!deltaMode && !logFile) || !skillName) {
    console.error(USAGE);
    process.exit(1);
  }

  let usage: TokenUsage;

  if (deltaMode) {
    usage = extractFromDatabase(skillName);
  } else {
    let content: string | undefined;
    try {
      content = readFileSync(logFile!, "utf-8");
    } catch {
      content = undefined;
    }
    const logUsage =
      content != null ? extractTokens(content, skillName) : undefined;
    // If log parsing only gave an estimate, try the database for real numbers
    if (logUsage && logUsage.source === "opencode") {
      usage = logUsage;
    } else {
      const dbUsage = extractFromDatabase(skillName);
      usage = dbUsage.source === "opencode" ? dbUsage : (logUsage ?? dbUsage);
    }
  }

  const structuredLine = `OPENCODE_TOKEN_USAGE:skill=${usage.skill}:prompt=${usage.prompt_tokens}:completion=${usage.completion_tokens}:total=${usage.total_tokens}:source=${usage.source}`;
  console.log(structuredLine);
  console.log(JSON.stringify(usage));
}

function queryStats(): StatsSnapshot | null {
  try {
    const query = STATS_QUERY.replace("$DIR", sqlEscape(process.cwd()));
    const raw = execSync(`opencode db --format json '${query}'`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
    if (!raw) return null;
    const rows = JSON.parse(raw);
    if (!rows.length) return null;
    return {
      input: Number(rows[0].input) || 0,
      output: Number(rows[0].output) || 0,
      reasoning: Number(rows[0].reasoning) || 0,
      cache_read: Number(rows[0].cache_read) || 0,
      cache_write: Number(rows[0].cache_write) || 0,
    };
  } catch {
    return null;
  }
}

function extractFromDatabase(skillName: string): TokenUsage {
  const current = queryStats();
  if (!current) {
    return fallbackZero(skillName);
  }

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
    // can't write stats file, non-fatal
  }

  if (!prev) {
    return {
      skill: skillName,
      prompt_tokens: current.input,
      completion_tokens: current.output,
      total_tokens: current.input + current.output + current.reasoning,
      source: "opencode",
    };
  }

  const prompt = Math.max(0, current.input - prev.input);
  const completion = Math.max(0, current.output - prev.output);
  const reasoning = Math.max(0, current.reasoning - prev.reasoning);

  return {
    skill: skillName,
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion + reasoning,
    source: "opencode",
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

function extractTokens(content: string, skillName: string): TokenUsage {
  // Pattern 1: explicit OPENCODE_TOKEN_USAGE line (when opencode itself outputs it)
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

  // Pattern 2: OpenAI-style usage JSON block
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

  // Pattern 3: key=value style token fields
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

  // Pattern 4: "N input tokens, M output tokens"
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

  // Pattern 5: "Token usage: N total" or "Total tokens: N"
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

  // Pattern 6: "tokens: N" (generic)
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

  // Fallback: character-count estimate
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { extractTokens, queryStats, TokenUsage, StatsSnapshot };
