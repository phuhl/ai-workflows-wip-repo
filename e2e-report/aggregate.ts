import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSONL_PATH = join(__dirname, "token-usage.jsonl");

export interface TokenUsageRecord {
  timestamp: string;
  commit: string;
  commit_message: string;
  scenario: string;
  workflow_run_id?: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  sources: ("opencode" | "estimated")[];
  skills: {
    name: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    source: "opencode" | "estimated";
  }[];
}

export function appendRecord(record: TokenUsageRecord): void {
  const line = JSON.stringify(record) + "\n";
  writeFileSync(JSONL_PATH, line, { flag: "a" });
}

export function readRecords(): TokenUsageRecord[] {
  if (!existsSync(JSONL_PATH)) return [];
  const content = readFileSync(JSONL_PATH, "utf-8");
  return content
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as TokenUsageRecord);
}

export function aggregate(
  records: TokenUsageRecord[],
): {
  byScenario: Record<string, { count: number; avgTotal: number; minTotal: number; maxTotal: number }>;
  bySkill: Record<
    string,
    { count: number; avgTotal: number; totalSum: number }
  >;
  totalRecords: number;
} {
  const byScenario: Record<
    string,
    { counts: number[] }
  > = {};
  const bySkill: Record<
    string,
    { counts: number[] }
  > = {};

  for (const r of records) {
    if (!byScenario[r.scenario]) {
      byScenario[r.scenario] = { counts: [] };
    }
    byScenario[r.scenario].counts.push(r.total_tokens);

    for (const s of r.skills) {
      if (!bySkill[s.name]) {
        bySkill[s.name] = { counts: [] };
      }
      bySkill[s.name].counts.push(s.total_tokens);
    }
  }

  const byScenarioOut: Record<
    string,
    { count: number; avgTotal: number; minTotal: number; maxTotal: number }
  > = {};
  for (const [name, data] of Object.entries(byScenario)) {
    byScenarioOut[name] = {
      count: data.counts.length,
      avgTotal: Math.round(
        data.counts.reduce((a, b) => a + b, 0) / data.counts.length,
      ),
      minTotal: Math.min(...data.counts),
      maxTotal: Math.max(...data.counts),
    };
  }

  const bySkillOut: Record<
    string,
    { count: number; avgTotal: number; totalSum: number }
  > = {};
  for (const [name, data] of Object.entries(bySkill)) {
    bySkillOut[name] = {
      count: data.counts.length,
      avgTotal: Math.round(
        data.counts.reduce((a, b) => a + b, 0) / data.counts.length,
      ),
      totalSum: data.counts.reduce((a, b) => a + b, 0),
    };
  }

  return {
    byScenario: byScenarioOut,
    bySkill: bySkillOut,
    totalRecords: records.length,
  };
}

export function printReport(records: TokenUsageRecord[]): string {
  const agg = aggregate(records);
  const lines: string[] = [];

  const sep = "=".repeat(70);
  lines.push(sep);
  lines.push("  Token Usage Report");
  lines.push(sep);
  lines.push(`  Total test runs: ${agg.totalRecords}`);
  lines.push("");

  if (Object.keys(agg.byScenario).length > 0) {
    lines.push("  By Scenario:");
    lines.push("  " + "-".repeat(68));
    lines.push(
      `  ${"Scenario".padEnd(30)} ${"Count".padStart(6)} ${"Avg".padStart(10)} ${"Min".padStart(10)} ${"Max".padStart(10)}`,
    );
    lines.push("  " + "-".repeat(68));
    for (const [name, stats] of Object.entries(agg.byScenario).sort(
      (a, b) => b[1].avgTotal - a[1].avgTotal,
    )) {
      lines.push(
        `  ${name.padEnd(30)} ${String(stats.count).padStart(6)} ${String(stats.avgTotal).padStart(10)} ${String(stats.minTotal).padStart(10)} ${String(stats.maxTotal).padStart(10)}`,
      );
    }
    lines.push("");
  }

  if (Object.keys(agg.bySkill).length > 0) {
    lines.push("  By Skill:");
    lines.push("  " + "-".repeat(68));
    lines.push(
      `  ${"Skill".padEnd(30)} ${"Count".padStart(6)} ${"Avg".padStart(10)} ${"Total".padStart(10)}`,
    );
    lines.push("  " + "-".repeat(68));
    for (const [name, stats] of Object.entries(agg.bySkill).sort(
      (a, b) => b[1].avgTotal - a[1].avgTotal,
    )) {
      lines.push(
        `  ${name.padEnd(30)} ${String(stats.count).padStart(6)} ${String(stats.avgTotal).padStart(10)} ${String(stats.totalSum).padStart(10)}`,
      );
    }
    lines.push("");
  }

  // Recent runs
  lines.push("  Most Recent Runs:");
  lines.push("  " + "-".repeat(68));
  for (const r of records.slice(-5).reverse()) {
    const skillNames = r.skills.map((s) => `${s.name}(${s.total_tokens})`).join(", ");
    lines.push(
      `  ${r.timestamp.slice(0, 16)}  ${r.commit.slice(0, 8)}  ${r.scenario.padEnd(20)}  ${String(r.total_tokens).padStart(10)}  ${skillNames}`,
    );
  }
  lines.push("");

  lines.push(sep);
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const records = readRecords();

  if (args.includes("--json")) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  const report = printReport(records);
  console.log(report);
}

if (import.meta.url.endsWith("/aggregate.ts") || process.argv[1]?.endsWith("aggregate.ts")) {
  main();
}
