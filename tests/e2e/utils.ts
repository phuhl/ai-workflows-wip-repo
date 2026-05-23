import type {
  ScenarioResult,
  ScenarioSpec,
  E2EContext,
  AssertionResult,
} from "./types";

export function logHeader(text: string): void {
  const line = "=".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

export function logStep(text: string): void {
  console.log(`  → ${text}`);
}

export function logPass(text: string): void {
  console.log(`    ✅ ${text}`);
}

export function logFail(text: string): void {
  console.log(`    ❌ ${text}`);
}

export async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 5000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(intervalMs);
  }
  return false;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runScenario(
  scenario: ScenarioSpec,
  ctx: E2EContext,
): Promise<ScenarioResult> {
  const start = Date.now();
  logHeader(`Scenario: ${scenario.name}`);
  console.log(`  ${scenario.description}`);

  try {
    logStep("Running setup...");
    await scenario.setup(ctx);
    logPass("Setup complete");

    logStep("Running trigger...");
    await scenario.trigger(ctx);
    logPass("Trigger complete");

    logStep(`Waiting (timeout: ${scenario.timeoutMs}ms)...`);
    await scenario.wait(ctx);
    logPass("Wait complete");

    logStep("Running assertions...");
    const assertions = await scenario.assertions(ctx);
    for (const a of assertions) {
      if (a.passed) {
        logPass(a.message);
      } else {
        logFail(a.message);
      }
    }

    const passed = assertions.every((a) => a.passed);
    return {
      name: scenario.name,
      passed,
      assertions,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    logFail(`Error: ${e instanceof Error ? e.message : String(e)}`);
    return {
      name: scenario.name,
      passed: false,
      assertions: [],
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  } finally {
    try {
      logStep("Running cleanup...");
      await scenario.cleanup(ctx);
      logPass("Cleanup complete");
    } catch (e) {
      logFail(`Cleanup error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export function assert(condition: boolean, message: string): AssertionResult {
  return { name: message, passed: condition, message };
}

export function printSummary(results: ScenarioResult[]): void {
  logHeader("Test Run Summary");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const duration = (r.durationMs / 1000).toFixed(1);
    console.log(`  ${icon} ${r.name} (${duration}s)`);
    if (r.error) {
      console.log(`      Error: ${r.error}`);
    }
    for (const a of r.assertions.filter((a) => !a.passed)) {
      console.log(`      Failed: ${a.message}`);
    }
  }

  console.log(
    `\n  ${passed} passed, ${failed} failed, ${results.length} total`,
  );
}

export function isBot(author: string): boolean {
  return author === "opencode[bot]" || author.includes("[bot]");
}
