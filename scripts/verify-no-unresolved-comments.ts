import { execSync } from "node:child_process";

interface Comment {
  id: number;
  in_reply_to_id: number | null;
  user: { login: string };
  path: string;
  line: number | null;
  body: string;
}

export interface UnresolvedResult {
  id: number;
  path: string;
  line: string;
  bodyPreview: string;
}

export interface VerifyResult {
  ok: boolean;
  exitCode: number;
  output: string;
  unresolved: UnresolvedResult[];
}

function fetchComments(prNumber: number, repo: string): Comment[] | null {
  try {
    const raw = execSync(
      `gh api "repos/${repo}/pulls/${prNumber}/comments" --jq '.'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] },
    );
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[]") return null;
    return JSON.parse(trimmed) as Comment[];
  } catch {
    return null;
  }
}

function detectBotUser(): string {
  try {
    const raw = execSync("gh api /user -q '.login'", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const user = raw.trim();
    if (!user || user === "null") return "opencode[bot]";
    return user;
  } catch {
    return "opencode[bot]";
  }
}

export function verifyComments(
  prNumber: number,
  repo: string,
  botUser?: string,
): VerifyResult {
  const lines: string[] = [];
  const unresolved: UnresolvedResult[] = [];

  const effectiveBotUser = botUser || detectBotUser();

  lines.push(
    `=== Checking unresolved code-line review comments on PR #${prNumber} in ${repo} ===`,
  );
  lines.push(`Bot user for resolution check: ${effectiveBotUser}`);

  const allComments = fetchComments(prNumber, repo);

  if (!allComments) {
    lines.push("No code-line review comments found.");
    return { ok: true, exitCode: 0, output: lines.join("\n"), unresolved };
  }

  const threadStarters = allComments.filter((c) => c.in_reply_to_id === null);

  if (threadStarters.length === 0) {
    lines.push("No code-line review comment threads found.");
    return { ok: true, exitCode: 0, output: lines.join("\n"), unresolved };
  }

  for (const starter of threadStarters) {
    const replies = allComments
      .filter((c) => c.in_reply_to_id === starter.id)
      .sort((a, b) => a.id - b.id);

    const lastReply = replies.length > 0 ? replies[replies.length - 1] : null;

    if (!lastReply || lastReply.user.login !== effectiveBotUser) {
      const lineInfo = `${starter.id}  file=${starter.path}:${starter.line ?? "?"}`;
      const bodyPreview = starter.body.slice(0, 120);

      unresolved.push({
        id: starter.id,
        path: starter.path,
        line: String(starter.line ?? "?"),
        bodyPreview,
      });

      lines.push(`UNRESOLVED: ${lineInfo}`);
      lines.push(`            ${bodyPreview}`);
    }
  }

  lines.push("");

  if (unresolved.length > 0) {
    lines.push(
      `${unresolved.length} code-line review comment(s) remain unaddressed.`,
    );
    lines.push(
      "Reply to each (implement the change or explain why not) before finalizing.",
    );
    return { ok: false, exitCode: 1, output: lines.join("\n"), unresolved };
  }

  lines.push(
    "All code-line review comments have been addressed (last reply is from the bot).",
  );
  return { ok: true, exitCode: 0, output: lines.join("\n"), unresolved };
}

function main(): void {
  const [prNumArg, repoArg, botUserArg] = process.argv.slice(2);

  let repo = repoArg;
  if (!repo) {
    try {
      const raw = execSync(
        "gh repo view --json nameWithOwner -q .nameWithOwner",
        {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
      repo = raw.trim();
    } catch {
      repo = "";
    }
  }

  if (!prNumArg) {
    console.log("Usage: <script> <pr-number> [repo] [bot-user]");
    process.exit(2);
  }

  if (!repo) {
    console.log(
      "Error: could not determine repository. Pass it as the second argument.",
    );
    process.exit(2);
  }

  const prNumber = parseInt(prNumArg, 10);
  const result = verifyComments(prNumber, repo, botUserArg || undefined);
  console.log(result.output);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
