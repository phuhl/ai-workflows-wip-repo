import { execSync } from "node:child_process";

const USAGE =
  "Usage: <script> <pr-number> <in-reply-to-comment-id> <body> [repo]";

export interface PostReviewReplyResult {
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

export function postReviewReply(
  prNumber: number,
  inReplyToCommentId: number,
  body: string,
  repoArg?: string,
): PostReviewReplyResult {
  if (!prNumber || !inReplyToCommentId || !body) {
    return {
      ok: false,
      exitCode: 1,
      output: `${USAGE}\nError: PR number, comment ID, and body are required`,
    };
  }

  let repo = repoArg;
  if (!repo) {
    const repoResult = ghCli(
      "repo view --json nameWithOwner -q .nameWithOwner",
    );
    if (!repoResult.ok || !repoResult.stdout) {
      return {
        ok: false,
        exitCode: 2,
        output:
          "Error: could not determine repository. Pass it as the fourth argument.",
      };
    }
    repo = repoResult.stdout.trim();
  }

  const payload = {
    body,
    in_reply_to: inReplyToCommentId,
  };

  const json = JSON.stringify(payload);

  try {
    execSync(`gh api "repos/${repo}/pulls/${prNumber}/comments" --input -`, {
      input: json,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return {
      ok: false,
      exitCode: 3,
      output: `Error: failed to post reply to comment ${inReplyToCommentId} on PR #${prNumber}`,
    };
  }

  return {
    ok: true,
    exitCode: 0,
    output: `Reply posted to comment ${inReplyToCommentId} on PR #${prNumber}`,
  };
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(USAGE);
    process.exit(1);
  }

  const [prNumberArg, commentIdArg, body, repo] = args;
  const result = postReviewReply(
    parseInt(prNumberArg, 10),
    parseInt(commentIdArg, 10),
    body,
    repo,
  );
  console.log(result.output);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
