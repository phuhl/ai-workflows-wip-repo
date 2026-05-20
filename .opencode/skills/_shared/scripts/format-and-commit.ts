import { execSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const USAGE = "Usage: format-and-commit <message> <file...>";

export interface FormatAndCommitResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

export function formatAndCommit(
  message: string,
  files: string[],
): FormatAndCommitResult {
  const lines: string[] = [];

  if (!message || files.length === 0 || files.some((f) => !f)) {
    const err = `${USAGE}\nError: commit message and at least one file are required`;
    return { ok: false, exitCode: 1, output: err };
  }

  // Verify all files exist
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    const err = `Error: pathspec '${missing[0]}' did not match any files`;
    return { ok: false, exitCode: 128, output: err };
  }

  // Stage files
  for (const file of files) {
    execFileSync("git", ["add", file], { stdio: "pipe" });
  }

  // Run prettier if available
  try {
    execSync("npx prettier --write . 2>/dev/null || true", { stdio: "pipe" });
  } catch {
    // prettier not available
  }

  // Run eslint if available
  try {
    execSync("npx eslint . --fix 2>/dev/null || true", { stdio: "pipe" });
  } catch {
    // eslint not available
  }

  // Commit — use execFileSync to safely pass message with special chars
  const commitOutput = execFileSync("git", ["commit", "-m", message], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  lines.push(commitOutput.trim());

  // Push
  try {
    const pushOutput = execSync("git push", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    lines.push(pushOutput.trim());
  } catch {
    // Push might fail if no remote
    lines.push("Warning: git push failed (no remote?)");
  }

  return { ok: true, exitCode: 0, output: lines.join("\n") };
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(USAGE);
    process.exit(1);
  }

  const [message, ...files] = args;
  const result = formatAndCommit(message, files);
  console.log(result.output);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
