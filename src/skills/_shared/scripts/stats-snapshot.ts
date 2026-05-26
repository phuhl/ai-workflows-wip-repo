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
    return execSync("opencode stats --project . --days 0", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
  } catch {
    return "";
  }
}

function parseStats(text: string): StatsSnapshot | null {
  const input = text.match(/Input\s+(\d[\d,]*)/);
  const output = text.match(/Output\s+(\d[\d,]*)/);
  const cacheRead = text.match(/Cache Read\s+(\d[\d,]*)/);
  const cacheWrite = text.match(/Cache Write\s+(\d[\d,]*)/);

  if (!input && !output) return null;

  return {
    input: input ? parseInt(input[1].replace(/,/g, ""), 10) : 0,
    output: output ? parseInt(output[1].replace(/,/g, ""), 10) : 0,
    cache_read: cacheRead ? parseInt(cacheRead[1].replace(/,/g, ""), 10) : 0,
    cache_write: cacheWrite ? parseInt(cacheWrite[1].replace(/,/g, ""), 10) : 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { parseStats, runStats, StatsSnapshot };
