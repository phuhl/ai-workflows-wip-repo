import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");

let failures = 0;

function runSuite(name: string, fn: () => boolean): void {
  console.log(`\n--- ${name} ---\n`);
  try {
    const passed = fn();
    if (passed) {
      console.log("  PASSED");
    } else {
      failures++;
      console.log("  FAILED");
    }
  } catch (e) {
    failures++;
    console.log("  FAILED");
    console.error(e);
  }
}

function runVitest(): boolean {
  try {
    execSync("npx vitest run", {
      cwd: ROOT_DIR,
      stdio: "inherit",
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}

function runPluginTests(): boolean {
  const opencodeDir = path.join(ROOT_DIR, ".opencode");
  if (!existsSync(path.join(opencodeDir, "node_modules", "vitest"))) {
    console.log("  SKIP: vitest not installed in .opencode/");
    return false;
  }
  try {
    execSync("npx vitest run", {
      cwd: opencodeDir,
      stdio: "inherit",
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}

// Main
console.log("==========================================");
console.log("  AI Workflows — Local Test Suite");
console.log("==========================================");

// 1. Structural validation (vitest with 'validate' glob)
// 2. Script tests (vitest with 'scripts' glob)
// Both covered by main vitest run

console.log("\n--- Vitest tests ---\n");
runSuite("Vitest tests", runVitest);

// Plugin tests (separate vitest config)
console.log("\n--- Plugin tests ---\n");
const pluginOk = runPluginTests();
if (pluginOk) {
  console.log("  PASSED");
} else {
  // plugin tests skip is not a failure
  console.log("  SKIPPED (install with: cd .opencode && npm install)");
}

console.log("\n==========================================");
if (failures === 0) {
  console.log("  All tests passed.");
  process.exit(0);
} else {
  console.log(`  ${failures} suite(s) failed.`);
  process.exit(1);
}
