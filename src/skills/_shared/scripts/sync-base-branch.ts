import { execSync } from "node:child_process";

const USAGE = "Usage: sync-base-branch <issue-number>";

export interface SyncResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

function ghCli(args: string): { stdout: string; ok: boolean } {
  try {
    const stdout = execSync(`gh ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return { stdout: stdout.trim(), ok: true };
  } catch {
    return { stdout: "", ok: false };
  }
}

export function syncBaseBranch(issueNumber: string): SyncResult {
  if (!issueNumber) {
    return {
      ok: false,
      exitCode: 1,
      output: `${USAGE}\nError: issue number is required`,
    };
  }

  // Find PR for the issue
  const prList = ghCli(
    `pr list --search "${issueNumber}" --json number --jq ".[0].number"`,
  );
  if (!prList.ok || !prList.stdout) {
    return {
      ok: false,
      exitCode: 2,
      output: "No open PR found for this issue.",
    };
  }

  const prNumber = prList.stdout.trim();

  // Get base branch
  const baseBranch = ghCli(
    `pr view ${prNumber} --json baseRefName --jq ".baseRefName"`,
  );
  if (!baseBranch.ok || !baseBranch.stdout) {
    return {
      ok: false,
      exitCode: 2,
      output: "Could not determine base branch for PR #" + prNumber,
    };
  }

  // Get head branch
  const headBranch = ghCli(
    `pr view ${prNumber} --json headRefName --jq ".headRefName"`,
  );
  if (!headBranch.ok || !headBranch.stdout) {
    return {
      ok: false,
      exitCode: 2,
      output: "Could not determine head branch for PR #" + prNumber,
    };
  }

  const base = baseBranch.stdout.trim();
  const head = headBranch.stdout.trim();

  // Fetch and checkout head branch
  try {
    execSync("git fetch origin", { stdio: "pipe" });
  } catch {
    return {
      ok: false,
      exitCode: 2,
      output: "Failed to fetch from origin",
    };
  }

  try {
    execSync(`git checkout ${head}`, { stdio: "pipe" });
  } catch {
    return {
      ok: false,
      exitCode: 2,
      output: `Failed to checkout branch ${head}`,
    };
  }

  // Update base branch
  try {
    execSync(`git fetch origin ${base}`, { stdio: "pipe" });
  } catch {
    return {
      ok: false,
      exitCode: 3,
      output: `Failed to fetch base branch ${base} from origin`,
    };
  }

  // Merge base into head
  try {
    const mergeOutput = execSync(`git merge origin/${base}`, {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return {
      ok: true,
      exitCode: 0,
      output: "Base branch merged successfully.\n" + mergeOutput.trim(),
    };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const errMsg = err.stdout?.toString() || err.stderr?.toString() || "";
    if (errMsg.includes("CONFLICT")) {
      return {
        ok: false,
        exitCode: 3,
        output: "Merge conflicts detected. Please resolve manually.",
      };
    }
    return {
      ok: false,
      exitCode: 3,
      output: `Merge failed: ${errMsg}`,
    };
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const issueNumber = args[0] || "";
  const result = syncBaseBranch(issueNumber);
  console.log(result.output);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
