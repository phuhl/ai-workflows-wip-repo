import { execSync } from "node:child_process";

export function postReviewReply(
  prNumber: number,
  inReplyToCommentId: number,
  body: string,
): void {
  const payload = {
    body,
    in_reply_to: inReplyToCommentId,
  };

  const json = JSON.stringify(payload);

  execSync(
    `gh api "repos/{owner}/{repo}/pulls/${prNumber}/comments" --input -`,
    {
      input: json,
      encoding: "utf-8",
      stdio: "inherit",
    },
  );
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log("Usage: <script> <pr-number> <in-reply-to-comment-id> <body>");
    process.exit(1);
  }

  const [prNumberArg, commentIdArg, body] = args;
  postReviewReply(parseInt(prNumberArg, 10), parseInt(commentIdArg, 10), body);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
