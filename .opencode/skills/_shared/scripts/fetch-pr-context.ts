import { execSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  writeFileSync as write,
} from "node:fs";
import { join } from "node:path";

const USAGE = "Usage: fetch-pr-context <pr-number> [issue-number]";

const OUT_DIR = ".ai-workflows";

interface GhResult {
  stdout: string;
  ok: boolean;
}

function gh(args: string): GhResult {
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

function getRepo(): GhResult {
  const r = gh("repo view --json nameWithOwner -q .nameWithOwner");
  return r;
}

function getPrHeadBranch(prNumber: string): GhResult {
  const r = gh(`pr view ${prNumber} --json headRefName -q .headRefName`);
  return r;
}

function getPrBaseBranch(prNumber: string): string {
  const r = gh(`pr view ${prNumber} --json baseRefName -q .baseRefName`);
  return r.ok ? r.stdout : "master";
}

function getLinkedIssue(repo: string, prNumber: string): string {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return "";

  // Try GraphQL API for closingIssuesReferences (GitHub's canonical linked-issue source)
  const query = `query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){closingIssuesReferences(first:5){nodes{number}}}}}`;
  const graphqlResult = gh(
    `api graphql -f query='${query}' -f owner='${owner}' -f name='${name}' -F pr=${prNumber} --jq '.data.repository.pullRequest.closingIssuesReferences.nodes[].number'`,
  );
  if (graphqlResult.ok && graphqlResult.stdout) {
    const numbers = graphqlResult.stdout.split("\n").filter(Boolean);
    if (numbers.length > 0) return numbers[0];
  }

  // Fallback: branch name convention (e.g., "42-fix-bug")
  const headResult = gh(
    `pr view ${prNumber} --json headRefName -q .headRefName`,
  );
  if (headResult.ok) {
    const match = headResult.stdout.match(/^(\d+)/);
    if (match) return match[1];
  }

  // Fallback: PR body keyword parsing
  const bodyResult = gh(
    `pr view ${prNumber} --json body -q .body --repo "${repo}"`,
  );
  if (bodyResult.ok) {
    const match = bodyResult.stdout.match(
      /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/i,
    );
    if (match) return match[1];
  }

  return "";
}

function extractComments(filePath: string): string[] {
  const comments: string[] = [];
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    if (
      /\.(ts|tsx|js|jsx|mjs|cjs|java|kt|swift|scala|go|rs|c|h|cpp|hpp|cs|dart)$/.test(
        filePath,
      )
    ) {
      let lineNum = 0;
      let inBlock = false;
      let blockLines: string[] = [];
      for (const line of lines) {
        lineNum++;
        const trimmed = line.trim();

        if (inBlock) {
          blockLines.push(`${lineNum}: ${line}`);
          if (trimmed.includes("*/")) {
            inBlock = false;
            const blockComment = blockLines.join("\n");
            if (blockComment.length > 6) {
              comments.push(blockComment);
            }
            blockLines = [];
          }
          continue;
        }

        if (trimmed.startsWith("//")) {
          comments.push(`${lineNum}: ${line}`);
          continue;
        }

        if (trimmed.includes("/*")) {
          if (trimmed.includes("*/")) {
            const block = `${lineNum}: ${line}`;
            if (block.length > 6) {
              comments.push(block);
            }
          } else {
            inBlock = true;
            blockLines = [`${lineNum}: ${line}`];
          }
          continue;
        }
      }
    } else if (/\.(py|rb|pl|sh|bash|zsh)$/.test(filePath)) {
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        const trimmed = line.trim();
        if (trimmed.startsWith("#") && !trimmed.startsWith("#!")) {
          comments.push(`${lineNum}: ${line}`);
        }
      }
    } else if (/\.(html|xml|md|mdx)$/.test(filePath)) {
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        const trimmed = line.trim();
        if (trimmed.includes("<!--") && trimmed.includes("-->")) {
          comments.push(`${lineNum}: ${line}`);
        }
      }
    }
  } catch {
    // file read error, skip
  }
  return comments;
}

function getChangedFiles(base: string, head: string): string[] {
  try {
    execSync(`git fetch origin ${base}`, { stdio: "pipe" });
  } catch {
    // base may already be present
  }
  try {
    const out = execSync(`git diff --name-only origin/${base}...HEAD`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return out
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    // fallback: just HEAD files
    try {
      const out = execSync(`git diff --name-only HEAD~1`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      return out
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);
    } catch {
      return [];
    }
  }
}

export interface FetchResult {
  ok: boolean;
  exitCode: number;
  output: string;
  files: string[];
}

export function fetchPrContext(
  prNumber: string,
  issueNumber?: string,
): FetchResult {
  if (!prNumber) {
    return {
      ok: false,
      exitCode: 1,
      output: `${USAGE}\nError: PR number is required`,
      files: [],
    };
  }

  const repoResult = getRepo();
  if (!repoResult.ok) {
    return {
      ok: false,
      exitCode: 2,
      output: `${USAGE}\nError: could not determine repository`,
      files: [],
    };
  }
  const repo = repoResult.stdout;

  const saved: string[] = [];
  const lines: string[] = [];

  mkdirSync(OUT_DIR, { recursive: true });

  // 1. PR body
  const prBody = gh(
    `pr view ${prNumber} --json body -q .body --repo "${repo}"`,
  );
  if (prBody.ok && prBody.stdout) {
    writeFileSync(join(OUT_DIR, "pr-body.md"), prBody.stdout);
    saved.push("pr-body.md");
    lines.push("[fetch-pr-context] Saved pr-body.md");
  }

  const prTitle = gh(
    `pr view ${prNumber} --json title -q .title --repo "${repo}"`,
  );

  // 2. PR comments (main thread)
  const prComments = gh(
    `pr view ${prNumber} --json comments -q ".comments[] | {author: .author.login, body, createdAt}" --repo "${repo}"`,
  );
  if (prComments.ok && prComments.stdout) {
    writeFileSync(join(OUT_DIR, "pr-comments.json"), prComments.stdout);
    saved.push("pr-comments.json");
    lines.push("[fetch-pr-context] Saved pr-comments.json");
  }

  // 3. PR review comments (code-line)
  const prReviewComments = gh(
    `api "repos/${repo}/pulls/${prNumber}/comments" --jq '.[] | {id, path, line, body, in_reply_to_id, user: .user.login, author_association, createdAt}'`,
  );
  if (prReviewComments.ok && prReviewComments.stdout) {
    writeFileSync(
      join(OUT_DIR, "pr-review-comments.json"),
      prReviewComments.stdout,
    );
    saved.push("pr-review-comments.json");
    lines.push("[fetch-pr-context] Saved pr-review-comments.json");
  }

  // 4. PR reviews (summary-level)
  const prReviews = gh(
    `pr view ${prNumber} --json reviews -q '.reviews[] | {author: .author.login, state, body}' --repo "${repo}"`,
  );
  if (prReviews.ok && prReviews.stdout) {
    writeFileSync(join(OUT_DIR, "pr-reviews.json"), prReviews.stdout);
    saved.push("pr-reviews.json");
    lines.push("[fetch-pr-context] Saved pr-reviews.json");
  }

  // 5. Issue body and comments
  const effectiveIssue = issueNumber || getLinkedIssue(repo, prNumber);
  if (effectiveIssue) {
    const issueBody = gh(
      `issue view ${effectiveIssue} --json body -q .body --repo "${repo}"`,
    );
    if (issueBody.ok && issueBody.stdout) {
      writeFileSync(join(OUT_DIR, "issue-body.md"), issueBody.stdout);
      saved.push("issue-body.md");
      lines.push("[fetch-pr-context] Saved issue-body.md");
    }

    const issueTitle = gh(
      `issue view ${effectiveIssue} --json title -q .title --repo "${repo}"`,
    );

    const issueComments = gh(
      `issue view ${effectiveIssue} --json comments -q ".comments[] | {author: .author.login, body, createdAt}" --repo "${repo}"`,
    );
    if (issueComments.ok && issueComments.stdout) {
      writeFileSync(join(OUT_DIR, "issue-comments.json"), issueComments.stdout);
      saved.push("issue-comments.json");
      lines.push("[fetch-pr-context] Saved issue-comments.json");
    }
  }

  // 6. Changed files list and code comments
  const headResult = getPrHeadBranch(prNumber);
  if (!headResult.ok) {
    return {
      ok: false,
      exitCode: 2,
      output: `${USAGE}\nError: could not find PR #${prNumber}`,
      files: saved,
    };
  }
  const head = headResult.stdout;
  const base = getPrBaseBranch(prNumber);

  try {
    execSync(`git fetch origin ${head}`, { stdio: "pipe" });
    execSync(`git checkout ${head}`, { stdio: "pipe" });
  } catch {
    lines.push(
      "[fetch-pr-context] Warning: could not checkout PR branch; code comments skipped",
    );
  }

  const changedFiles = getChangedFiles(base, head);
  if (changedFiles.length > 0) {
    writeFileSync(join(OUT_DIR, "changed-files.txt"), changedFiles.join("\n"));
    saved.push("changed-files.txt");
    lines.push(
      `[fetch-pr-context] Saved changed-files.txt (${changedFiles.length} files)`,
    );

    // Extract code comments from changed files
    const commentLines: string[] = [];
    for (const file of changedFiles) {
      if (!existsSync(file)) continue;
      const fileComments = extractComments(file);
      if (fileComments.length > 0) {
        commentLines.push(`## ${file}`);
        commentLines.push(...fileComments);
        commentLines.push("");
      }
    }
    if (commentLines.length > 0) {
      writeFileSync(join(OUT_DIR, "code-comments.md"), commentLines.join("\n"));
      saved.push("code-comments.md");
      lines.push(`[fetch-pr-context] Saved code-comments.md`);
    }
  }

  // 7. Generate a brief review-context.md from the raw data
  const contextParts: string[] = [];
  contextParts.push("# Review Context");
  contextParts.push("");

  const title = prTitle.ok ? prTitle.stdout : `PR #${prNumber}`;
  contextParts.push(`## PR: ${title}`);
  contextParts.push("");

  if (prBody.ok && prBody.stdout) {
    contextParts.push("### PR Description");
    contextParts.push(prBody.stdout);
    contextParts.push("");
  }

  if (effectiveIssue) {
    const issueTitleResult = gh(
      `issue view ${effectiveIssue} --json title -q .title --repo "${repo}"`,
    );
    contextParts.push(
      `## Issue: ${issueTitleResult.ok ? issueTitleResult.stdout : `#${effectiveIssue}`}`,
    );
    contextParts.push("");

    const issueBody = gh(
      `issue view ${effectiveIssue} --json body -q .body --repo "${repo}"`,
    );
    if (issueBody.ok && issueBody.stdout) {
      contextParts.push("### Issue Description");
      contextParts.push(issueBody.stdout);
      contextParts.push("");
    }
  }

  if (changedFiles.length > 0) {
    contextParts.push("## Changed Files");
    contextParts.push(...changedFiles.map((f) => `- \`${f}\``));
    contextParts.push("");
  }

  writeFileSync(join(OUT_DIR, "review-context.md"), contextParts.join("\n"));
  saved.push("review-context.md");
  lines.push("[fetch-pr-context] Generated review-context.md");

  return {
    ok: true,
    exitCode: 0,
    output: lines.join("\n"),
    files: saved,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const [prNumber, issueNumber] = args;
  const result = fetchPrContext(prNumber || "", issueNumber);
  console.log(result.output);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
