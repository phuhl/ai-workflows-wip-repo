import { readFileSync } from "node:fs";

const USAGE = "Usage: extract-token-usage <log-file> <skill-name>";

interface TokenUsage {
  skill: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  source: "opencode" | "estimated";
}

function main(): void {
  const logFile = process.argv[2];
  const skillName = process.argv[3];

  if (!logFile || !skillName) {
    console.error(USAGE);
    process.exit(1);
  }

  let content: string;
  try {
    content = readFileSync(logFile, "utf-8");
  } catch {
    console.error(`Cannot read log file: ${logFile}`);
    process.exit(1);
  }

  const usage = extractTokens(content, skillName);

  // Output a structured line for easy regex extraction by E2E tests
  const structuredLine = `OPENCODE_TOKEN_USAGE:skill=${usage.skill}:prompt=${usage.prompt_tokens}:completion=${usage.completion_tokens}:total=${usage.total_tokens}:source=${usage.source}`;
  console.log(structuredLine);

  // Also output JSON on a separate line for programmatic consumers
  console.log(JSON.stringify(usage));
}

function extractTokens(content: string, skillName: string): TokenUsage {
  // Try known patterns in order of specificity

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

  // Pattern 2: OpenAI-style usage JSON block (common in verbose LLM output)
  // Matches {"usage":{"prompt_tokens":N,"completion_tokens":N,"total_tokens":N}}
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

  // Pattern 3: ANSI-stripped output with "total_tokens" in key=value style
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

  // Pattern 4: "N input tokens, M output tokens" style
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

  // Pattern 6: "tokens: N" (very generic, last resort)
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

  // Fallback: rough estimate from character count (very coarse)
  // Strip ANSI escape codes and count characters
  const stripped = content.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  // Rough heuristic: ~4 chars per token for English text
  const charCount = stripped.length;
  const estimated = Math.round(charCount / 4);

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

export { extractTokens, TokenUsage };
