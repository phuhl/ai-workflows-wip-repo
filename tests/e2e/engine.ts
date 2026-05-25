import { execSync } from "node:child_process";
import type {
  Comment,
  PrInfo,
  WorkflowRun,
  CheckRun,
  TokenUsageEntry,
} from "./types";

function gh(args: string, opts?: { cwd?: string; stdin?: string }): string {
  try {
    const result = execSync(`gh ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      ...(opts?.cwd ? { cwd: opts.cwd } : {}),
      ...(opts?.stdin !== undefined ? { input: opts.stdin } : {}),
    });
    return result.trim();
  } catch (e: unknown) {
    const stderr =
      e && typeof e === "object" && "stderr" in e
        ? String((e as { stderr: unknown }).stderr || "")
        : "";
    const stdout =
      e && typeof e === "object" && "stdout" in e
        ? String((e as { stdout: unknown }).stdout || "")
        : "";
    throw new Error(`gh ${args} failed: ${stderr || stdout || e}`);
  }
}

function ghJson<T>(args: string, opts?: { cwd?: string; stdin?: string }): T {
  const output = gh(args, opts);
  return JSON.parse(output) as T;
}

export function createIssue(
  repo: string,
  title: string,
  body: string,
): { number: number; url: string } {
  const result = ghJson<{ number: number; html_url: string }>(
    `api repos/${repo}/issues --input -`,
    { stdin: JSON.stringify({ title, body }) },
  );
  return { number: result.number, url: result.html_url };
}

export function getIssue(
  repo: string,
  issueNumber: number,
): { body: string; title: string; state: string } {
  return ghJson<{ body: string; title: string; state: string }>(
    `issue view ${issueNumber} --repo ${repo} --json body,title,state`,
  );
}

export function labelIssue(
  repo: string,
  issueNumber: number,
  label: string,
): void {
  gh(`issue edit ${issueNumber} --repo ${repo} --add-label "${label}"`);
}

export function commentOnIssue(
  repo: string,
  issueNumber: number,
  body: string,
): void {
  gh(`api repos/${repo}/issues/${issueNumber}/comments --input -`, {
    stdin: JSON.stringify({ body }),
  });
}

export function getIssueComments(repo: string, issueNumber: number): Comment[] {
  return ghJson<Comment[]>(
    `api "repos/${repo}/issues/${issueNumber}/comments" --jq '[.[] | {id: .id, body: .body, author: .user.login, createdAt: .created_at}]'`,
  );
}

export function getPrForIssue(
  repo: string,
  issueNumber: number,
): PrInfo | null {
  try {
    const result = gh(
      `pr list --repo ${repo} --search "${issueNumber}" --state all --json number,title,body,state,isDraft,headRefName,baseRefName,labels,author,mergeable --limit 1`,
    );
    if (!result || result === "[]") return null;
    return JSON.parse(result)[0] as PrInfo;
  } catch {
    return null;
  }
}

export function getPr(repo: string, prNumber: number): PrInfo {
  return ghJson<PrInfo>(
    `pr view ${prNumber} --repo ${repo} --json number,title,body,state,isDraft,headRefName,baseRefName,labels,author,mergeable`,
  );
}

export function getPrLabels(repo: string, prNumber: number): string[] {
  const result = gh(
    `pr view ${prNumber} --repo ${repo} --json labels -q '.labels[].name'`,
  );
  return result ? result.split("\n").filter(Boolean) : [];
}

export function getPrComments(repo: string, prNumber: number): Comment[] {
  return ghJson<Comment[]>(
    `api "repos/${repo}/issues/${prNumber}/comments" --jq '[.[] | {id: .id, body: .body, author: .user.login, createdAt: .created_at}]'`,
  );
}

export function getPrReviewComments(repo: string, prNumber: number): Comment[] {
  return ghJson<Comment[]>(
    `api "repos/${repo}/pulls/${prNumber}/comments" --jq '[.[] | {id: .id, body: .body, author: .user.login, createdAt: .created_at}]'`,
  );
}

export function getPrFiles(repo: string, prNumber: number): string[] {
  const result = gh(
    `pr view ${prNumber} --repo ${repo} --json files -q '.files[].path'`,
  );
  return result ? result.split("\n").filter(Boolean) : [];
}

export function addPrLabel(
  repo: string,
  prNumber: number,
  label: string,
): void {
  gh(`api repos/${repo}/issues/${prNumber}/labels --input -`, {
    stdin: JSON.stringify([label]),
  });
}

export function removePrLabel(
  repo: string,
  prNumber: number,
  label: string,
): void {
  gh(`pr edit ${prNumber} --repo ${repo} --remove-label "${label}" || true`);
}

export function getWorkflowRuns(repo: string, branch: string): WorkflowRun[] {
  try {
    return ghJson<WorkflowRun[]>(
      `run list --repo ${repo} --branch "${branch}" --json databaseId,name,status,conclusion,headBranch,createdAt --limit 20`,
    );
  } catch {
    return [];
  }
}

export function getWorkflowRun(
  repo: string,
  runId: number,
): WorkflowRun | null {
  try {
    return ghJson<WorkflowRun>(
      `run view ${runId} --repo ${repo} --json databaseId,name,status,conclusion`,
    );
  } catch {
    return null;
  }
}

export function getRunJobs(
  repo: string,
  runId: number,
): Array<{ name: string; conclusion: string | null }> {
  try {
    return ghJson<Array<{ name: string; conclusion: string | null }>>(
      `run view ${runId} --repo ${repo} --json jobs --jq '.jobs | map({name, conclusion})'`,
    );
  } catch {
    return [];
  }
}

export function getWorkflowRunLog(repo: string, runId: number): string {
  try {
    return gh(`run view ${runId} --repo ${repo} --log`, { cwd: undefined });
  } catch {
    return "";
  }
}

export function parseTokenUsageFromLog(log: string): TokenUsageEntry[] {
  const entries: TokenUsageEntry[] = [];
  const regex =
    /OPENCODE_TOKEN_USAGE:skill=([^:]+):prompt=(\d+):completion=(\d+):total=(\d+):source=(opencode|estimated)/g;

  let match;
  while ((match = regex.exec(log)) !== null) {
    entries.push({
      skill: match[1],
      prompt_tokens: parseInt(match[2], 10),
      completion_tokens: parseInt(match[3], 10),
      total_tokens: parseInt(match[4], 10),
      source: match[5] as "opencode" | "estimated",
    });
  }

  return entries;
}

export async function extractTokenUsage(
  repo: string,
  runId: number,
): Promise<TokenUsageEntry[]> {
  try {
    const log = getWorkflowRunLog(repo, runId);
    return parseTokenUsageFromLog(log);
  } catch {
    return [];
  }
}

export function getCheckRuns(repo: string, ref: string): CheckRun[] {
  try {
    return ghJson<CheckRun[]>(
      `api "repos/${repo}/commits/${ref}/check-runs" --jq '[.check_runs[] | {name: .name, status: .status, conclusion: .conclusion}]'`,
    );
  } catch {
    return [];
  }
}

export function deleteBranch(repo: string, branch: string): void {
  gh(`api repos/${repo}/git/refs/heads/${branch} -X DELETE`);
}

export async function closeIssue(
  repo: string,
  issueNumber: number,
): Promise<void> {
  gh(`issue close ${issueNumber} --repo ${repo}`);
}

export async function closePr(repo: string, prNumber: number): Promise<void> {
  gh(`pr close ${prNumber} --repo ${repo}`);
}

export function getRepoLabels(repo: string): string[] {
  const result = gh(`label list --repo ${repo} --json name -q '.[].name'`);
  return result ? result.split("\n").filter(Boolean) : [];
}

export async function safeCleanup(
  fn: () => void | Promise<void>,
  label: string,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(
      `  ⚠ Cleanup '${label}' failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function ensureLabelExists(repo: string, label: string, color: string): void {
  try {
    gh(`api repos/${repo}/labels --input -`, {
      stdin: JSON.stringify({ name: label, color }),
    });
  } catch {
    // label already exists or can't be created; ignore
  }
}

export function addResultLabel(
  repo: string,
  issueNumber: number,
  passed: boolean,
): void {
  const label = passed ? "passing" : "failing";
  const color = passed ? "0e8a16" : "b60205";
  ensureLabelExists(repo, label, color);
  try {
    addPrLabel(repo, issueNumber, label);
  } catch {
    // retry after ensuring label exists
    ensureLabelExists(repo, label, color);
    try {
      addPrLabel(repo, issueNumber, label);
    } catch {
      // silently ignore
    }
  }
}

export function postResultComment(
  repo: string,
  issueNumber: number,
  scenarioName: string,
  passed: boolean,
  error?: string,
  failedAssertions?: { message: string }[],
): void {
  if (passed) return;

  let body = `## E2E Test Result: FAILED\n\n`;
  body += `**Scenario**: \`${scenarioName}\`\n\n`;
  if (error) {
    body += `**Error**: ${error}\n\n`;
  }
  if (failedAssertions && failedAssertions.length > 0) {
    body += `**Failed assertions**:\n`;
    for (const a of failedAssertions) {
      body += `- ${a.message}\n`;
    }
  }

  try {
    commentOnIssue(repo, issueNumber, body);
  } catch {
    // silently ignore
  }
}

export interface FileChange {
  path: string;
  content: string;
}

export function createPrWithChanges(
  repo: string,
  branchName: string,
  title: string,
  body: string,
  changes: FileChange[],
): { number: number; url: string } {
  const baseSha: string = gh(
    `api repos/${repo}/git/refs/heads/master --jq '.object.sha'`,
  );

  gh(
    `api repos/${repo}/git/refs -f ref=refs/heads/${branchName} -f sha=${baseSha}`,
  );

  const treeItems = changes.map((c) => {
    const blob = ghJson<{ sha: string }>(
      `api repos/${repo}/git/blobs --input -`,
      { stdin: JSON.stringify({ content: c.content, encoding: "utf-8" }) },
    );
    return {
      path: c.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blob.sha,
    };
  });

  const baseTreeSha: string = gh(
    `api repos/${repo}/git/commits/${baseSha} --jq '.tree.sha'`,
  );

  const newTree = ghJson<{ sha: string }>(
    `api repos/${repo}/git/trees --input -`,
    {
      stdin: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    },
  );

  const newCommit = ghJson<{ sha: string }>(
    `api repos/${repo}/git/commits --input -`,
    {
      stdin: JSON.stringify({
        message: title,
        tree: newTree.sha,
        parents: [baseSha],
      }),
    },
  );

  gh(`api repos/${repo}/git/refs/heads/${branchName} -X PATCH --input -`, {
    stdin: JSON.stringify({ sha: newCommit.sha, force: true }),
  });

  const pr = ghJson<{ number: number; html_url: string }>(
    `api repos/${repo}/pulls --input -`,
    {
      stdin: JSON.stringify({
        title,
        body,
        head: branchName,
        base: "master",
        draft: true,
      }),
    },
  );

  return { number: pr.number, url: pr.html_url };
}

export function getDefaultBranch(repo: string): string {
  try {
    return gh(
      `repo view ${repo} --json defaultBranchRef -q '.defaultBranchRef.name'`,
    );
  } catch {
    return "master";
  }
}
