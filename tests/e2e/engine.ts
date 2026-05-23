import { execSync } from "node:child_process";
import type { Comment, PrInfo, WorkflowRun, CheckRun } from "./types";

function gh(args: string, opts?: { cwd?: string }): string {
  try {
    const result = execSync(`gh ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      ...(opts?.cwd ? { cwd: opts.cwd } : {}),
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

function ghJson<T>(args: string): T {
  const output = gh(args);
  return JSON.parse(output) as T;
}

export function createIssue(
  repo: string,
  title: string,
  body: string,
): { number: number; url: string } {
  const result = ghJson<{ number: number; html_url: string }>(
    `api "repos/${repo}/issues" -f title="${title}" -f body="${body.replace(/"/g, '\\"')}"`,
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
  gh(
    `issue comment ${issueNumber} --repo ${repo} --body "${body.replace(/"/g, '\\"')}"`,
  );
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
  gh(`pr edit ${prNumber} --repo ${repo} --add-label "${label}"`);
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
      `run list --repo ${repo} --branch "${branch}" --json id,name,status,conclusion,headBranch,createdAt --limit 20`,
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
  try {
    gh(`api "repos/${repo}/git/refs/heads/${branch}" -X DELETE`);
  } catch {
    // branch may not exist
  }
}

export function closeIssue(repo: string, issueNumber: number): void {
  gh(`issue close ${issueNumber} --repo ${repo}`);
}

export function closePr(repo: string, prNumber: number): void {
  gh(`pr close ${prNumber} --repo ${repo}`);
}

export function getRepoLabels(repo: string): string[] {
  const result = gh(`label list --repo ${repo} --json name -q '.[].name'`);
  return result ? result.split("\n").filter(Boolean) : [];
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
