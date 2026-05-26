import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

interface StatsSnapshot {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

const USAGE =
  "Usage: stats-snapshot [--save <file>]\n" +
  "  --save <file>  Save snapshot as JSON (also print to stdout)";

function main(): void {
  const output = runStats();
  const snapshot = output ? parseStats(output) : null;
  if (!snapshot) {
    console.error("Failed to parse opencode stats output");
    process.exit(1);
  }

  const json = JSON.stringify(snapshot);
  console.log(json);

  if (process.argv[2] === "--save" && process.argv[3]) {
    writeFileSync(process.argv[3], json);
  }
}

function runStats(): string {
  try {
    return execSync("opencode stats --days 0", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
  } catch {
    return "";
  }
}

function parseNumber(s?: string): number {
  if (!s) return 0;
  // Handle formats like "932.3K", "1.2M", "42", "0"
  const cleaned = s.replace(/,/g, "").trim();
  const match = cleaned.match(/^([\d.]+)\s*(K|M|B)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") return Math.round(num * 1000);
  if (suffix === "M") return Math.round(num * 1_000_000);
  if (suffix === "B") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function parseStats(text: string): StatsSnapshot | null {
  const input = text.match(/Input\s+([\d.,]+\s*[KMB]?)/i);
  const output = text.match(/Output\s+([\d.,]+\s*[KMB]?)/i);
  const cacheRead = text.match(/Cache Read\s+([\d.,]+\s*[KMB]?)/i);
  const cacheWrite = text.match(/Cache Write\s+([\d.,]+\s*[KMB]?)/i);

  if (!input && !output) return null;

  return {
    input: parseNumber(input?.[1]),
    output: parseNumber(output?.[1]),
    cache_read: parseNumber(cacheRead?.[1]),
    cache_write: parseNumber(cacheWrite?.[1]),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { parseStats, runStats, StatsSnapshot };
